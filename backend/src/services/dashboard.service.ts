import { prisma } from '../config/prisma';
import { ReportContent } from '../models/ReportContent';
import { ReportStatus, Role } from '@prisma/client';

function formatYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMondayOfWeek(d: Date = new Date()): string {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.getFullYear(), date.getMonth(), diff);
  return formatYYYYMMDD(monday);
}

export class DashboardService {
  /**
   * Summary metrics for manager dashboard
   */
  async getSummary(weekStart?: string) {
    const targetWeekStartStr = weekStart ? weekStart : getMondayOfWeek(new Date());
    const targetWeekStart = new Date(targetWeekStartStr);

    const [activeMembersCount, submittedThisWeekCount, needsCorrectionCount, allNeedsCorrectionReports] =
      await Promise.all([
        prisma.user.count({
          where: { role: Role.team_member, active: true },
        }),
        prisma.report.count({
          where: {
            week_start: targetWeekStart,
            status: { in: [ReportStatus.submitted, ReportStatus.approved] },
          },
        }),
        prisma.report.count({
          where: { status: ReportStatus.needs_correction },
        }),
        prisma.report.findMany({
          where: {
            status: { in: [ReportStatus.draft, ReportStatus.submitted, ReportStatus.needs_correction] },
          },
          select: { id: true },
        }),
      ]);

    // Batch query MongoDB for blockers in active/in-progress reports (avoid N+1)
    const reportIds = allNeedsCorrectionReports.map((r) => r.id);
    let openBlockersCount = 0;

    if (reportIds.length > 0) {
      const contents = await ReportContent.find(
        { report_id: { $in: reportIds } },
        { blockers: 1 }
      ).lean();

      for (const c of contents) {
        if (Array.isArray(c.blockers)) {
          openBlockersCount += c.blockers.length;
        }
      }
    }

    const complianceRate =
      activeMembersCount > 0
        ? Math.min(100, Math.round((submittedThisWeekCount / activeMembersCount) * 100))
        : 0;

    return {
      total_submitted_this_week: submittedThisWeekCount,
      active_members_count: activeMembersCount,
      compliance_rate: complianceRate,
      needs_correction_count: needsCorrectionCount,
      open_blockers_count: openBlockersCount,
      week_start: targetWeekStartStr,
    };
  }

  /**
   * Filterable reports list for manager dashboard
   */
  async getDashboardReports(query: {
    week_start?: string;
    user_id?: string;
    project_id?: string;
    status?: ReportStatus;
    page?: string | number;
    limit?: string | number;
  }) {
    const page = Math.max(1, parseInt(String(query.page || 1), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || 20), 10)));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.week_start) {
      where.week_start = new Date(query.week_start);
    }
    if (query.user_id) {
      where.user_id = query.user_id;
    }
    if (query.project_id) {
      where.project_id = query.project_id;
    }
    if (query.status) {
      where.status = query.status;
    }

    const [total, reports] = await Promise.all([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ week_start: 'desc' }, { created_at: 'desc' }],
        include: {
          user: { select: { id: true, email: true } },
          project: { select: { id: true, name: true } },
          _count: { select: { review_comments: true } },
        },
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data: reports,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Data shaped for dashboard charts and visual analytics
   */
  async getTrends() {
    // 1. Fetch recent reports with user & project
    const recentReports = await prisma.report.findMany({
      take: 100,
      orderBy: { week_start: 'desc' },
      include: {
        user: { select: { id: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

    const reportIds = recentReports.map((r) => r.id);

    // 2. Batch-fetch MongoDB content documents in ONE single query (No N+1)
    const contents = await ReportContent.find({ report_id: { $in: reportIds } }).lean();
    const contentMap = new Map<string, any>();
    for (const c of contents) {
      contentMap.set(c.report_id, c);
    }

    // 3. Aggregate: Tasks Completed Over Time (by week)
    const weekMap = new Map<string, { week: string; tasks_completed: number; hours_spent: number }>();
    for (const r of recentReports) {
      const weekKey = r.week_start.toISOString().split('T')[0];
      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, { week: weekKey, tasks_completed: 0, hours_spent: 0 });
      }
      const entry = weekMap.get(weekKey)!;
      const content = contentMap.get(r.id);
      if (content) {
        if (Array.isArray(content.tasks_completed)) {
          const completedCount = content.tasks_completed.filter(
            (t: any) => t.status === 'done'
          ).length;
          entry.tasks_completed += completedCount;
          for (const t of content.tasks_completed) {
            entry.hours_spent += Number(t.time_spent_hours || 0);
          }
        }
      }
    }
    const tasksTrend = Array.from(weekMap.values()).reverse().slice(-8);

    // 4. Aggregate: Status by Member
    const memberMap = new Map<
      string,
      { member: string; approved: number; submitted: number; needs_correction: number; draft: number }
    >();
    for (const r of recentReports) {
      const email = r.user.email.split('@')[0];
      if (!memberMap.has(email)) {
        memberMap.set(email, {
          member: email,
          approved: 0,
          submitted: 0,
          needs_correction: 0,
          draft: 0,
        });
      }
      const m = memberMap.get(email)!;
      if (r.status === ReportStatus.approved) m.approved++;
      else if (r.status === ReportStatus.submitted) m.submitted++;
      else if (r.status === ReportStatus.needs_correction) m.needs_correction++;
      else if (r.status === ReportStatus.draft) m.draft++;
    }
    const memberStatus = Array.from(memberMap.values()).slice(0, 10);

    // 5. Aggregate: Workload by Project
    const allActiveProjects = await prisma.project.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    const projectMap = new Map<string, { project: string; reports_count: number; total_hours: number }>();
    for (const p of allActiveProjects) {
      projectMap.set(p.name, { project: p.name, reports_count: 0, total_hours: 0 });
    }
    for (const r of recentReports) {
      const pName = r.project?.name || 'General';
      if (!projectMap.has(pName)) {
        projectMap.set(pName, { project: pName, reports_count: 0, total_hours: 0 });
      }
      const p = projectMap.get(pName)!;
      p.reports_count++;
      const content = contentMap.get(r.id);
      if (content?.hours_by_type) {
        p.total_hours +=
          (content.hours_by_type.development || 0) +
          (content.hours_by_type.testing || 0) +
          (content.hours_by_type.meetings || 0) +
          (content.hours_by_type.documentation || 0);
      }
    }
    const workloadByProject = Array.from(projectMap.values());

    // 6. Aggregate: Time Spent by Task Category Team-wide
    const hoursTotal = { development: 0, testing: 0, meetings: 0, documentation: 0 };
    for (const content of contents) {
      if (content.hours_by_type) {
        hoursTotal.development += content.hours_by_type.development || 0;
        hoursTotal.testing += content.hours_by_type.testing || 0;
        hoursTotal.meetings += content.hours_by_type.meetings || 0;
        hoursTotal.documentation += content.hours_by_type.documentation || 0;
      }
    }
    const timeSpentByCategory = [
      { category: 'Development', hours: hoursTotal.development },
      { category: 'Testing', hours: hoursTotal.testing },
      { category: 'Meetings', hours: hoursTotal.meetings },
      { category: 'Documentation', hours: hoursTotal.documentation },
    ];

    // 7. Recent Activity Feed
    const recentComments = await prisma.reviewComment.findMany({
      take: 10,
      orderBy: { created_at: 'desc' },
      include: {
        reviewer: { select: { email: true } },
        report: {
          select: {
            id: true,
            week_start: true,
            user: { select: { email: true } },
            project: { select: { name: true } },
          },
        },
      },
    });

    const recentActivity = recentComments.map((c) => ({
      id: c.id,
      type: c.action,
      comment: c.comment,
      reviewer: c.reviewer.email,
      author: c.report.user.email,
      project: c.report.project.name,
      report_id: c.report.id,
      timestamp: c.created_at,
    }));

    return {
      tasksTrend,
      memberStatus,
      workloadByProject,
      timeSpentByCategory,
      recentActivity,
    };
  }

  /**
   * Bonus feature: Side-by-side section comparison across all team members for a week
   */
  async getSideBySide(
    weekStart?: string,
    section: 'blockers' | 'achievements' | 'tasks_completed' | 'tasks_planned_next_week' = 'blockers'
  ) {
    // 1. Distinct week_start values that actually exist in reports table
    const distinctWeeks = await prisma.report.findMany({
      select: { week_start: true },
      distinct: ['week_start'],
      orderBy: { week_start: 'desc' },
    });

    const availableWeeks = distinctWeeks.map(
      (w) => w.week_start.toISOString().split('T')[0]
    );

    // Default to the most recent week with real data, or fallback to current week Monday if no reports exist
    let targetWeekStartStr = weekStart;
    if (!targetWeekStartStr) {
      targetWeekStartStr = availableWeeks[0] || getMondayOfWeek(new Date());
    }
    const targetWeekStart = new Date(targetWeekStartStr);

    const reports = await prisma.report.findMany({
      where: { week_start: targetWeekStart },
      include: {
        user: { select: { id: true, email: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    const reportIds = reports.map((r) => r.id);
    const contents = await ReportContent.find({ report_id: { $in: reportIds } }).lean();
    const contentMap = new Map<string, any>();
    for (const c of contents) {
      contentMap.set(c.report_id, c);
    }

    const membersData = reports.map((r) => {
      const content = contentMap.get(r.id) || {};
      return {
        report_id: r.id,
        user_id: r.user.id,
        email: r.user.email,
        project_name: r.project.name,
        status: r.status,
        data: content[section] || [],
      };
    });

    return {
      week_start: targetWeekStart.toISOString().split('T')[0],
      available_weeks: availableWeeks,
      section,
      members: membersData,
    };
  }

  /**
   * Get distinct weeks that have reports in the database
   */
  async getAvailableWeeks() {
    const distinctWeeks = await prisma.report.findMany({
      select: { week_start: true },
      distinct: ['week_start'],
      orderBy: { week_start: 'desc' },
    });

    return distinctWeeks.map((w) => w.week_start.toISOString().split('T')[0]);
  }
}

export const dashboardService = new DashboardService();
