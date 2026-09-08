import { randomUUID } from 'crypto';
import { prisma } from '../config/prisma';
import { ReportContent, IReportContent } from '../models/ReportContent';
import { ReportVersion } from '../models/ReportVersion';
import { AppError } from '../middleware/errorHandler';
import { validateStateTransition, assertContentEditable } from './stateMachine';
import { ReportStatus, Role, Report, ReviewAction } from '@prisma/client';

export interface CreateReportDTO {
  project_id: string;
  week_start: string;
  week_end: string;
}

export interface UpdateReportContentDTO {
  tasks_completed?: any[];
  tasks_planned_next_week?: string[];
  blockers?: any[];
  achievements?: any[];
  hours_by_type?: {
    development?: number;
    testing?: number;
    meetings?: number;
    documentation?: number;
  };
  notes?: string;
}

export interface ListReportsQuery {
  page?: string | number;
  limit?: string | number;
  status?: ReportStatus;
  project_id?: string;
}

export class ReportService {
  /**
   * Creates a new report header in PostgreSQL (status=draft) and empty content in MongoDB.
   * Generates shared UUID in service layer BEFORE either write.
   */
  async createReport(userId: string, data: CreateReportDTO): Promise<{ report: Report; content: IReportContent }> {
    const { project_id, week_start, week_end } = data;

    if (!project_id || !week_start || !week_end) {
      throw new AppError(400, 'project_id, week_start, and week_end are required.');
    }

    const startDate = new Date(week_start);
    const endDate = new Date(week_end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new AppError(400, 'Invalid date format. Use YYYY-MM-DD.');
    }

    if (startDate > endDate) {
      throw new AppError(400, 'week_start cannot be after week_end.');
    }

    // Check unique constraint: one report per person per week
    const existing = await prisma.report.findUnique({
      where: {
        user_id_week_start: {
          user_id: userId,
          week_start: startDate,
        },
      },
    });

    if (existing) {
      throw new AppError(400, 'A report already exists for this user for the specified week.');
    }

    // Ensure project exists
    let project = await prisma.project.findUnique({
      where: { id: project_id },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          id: project_id,
          name: 'Engineering Project',
          description: 'Auto-created project',
        },
      });
    }

    // Explicitly generate the shared UUID in the service layer before either write
    const reportId = randomUUID();

    // 1. Write to PostgreSQL (status = draft)
    const report = await prisma.report.create({
      data: {
        id: reportId,
        user_id: userId,
        project_id: project.id,
        week_start: startDate,
        week_end: endDate,
        status: ReportStatus.draft,
      },
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    // 2. Write to MongoDB (report_content) using the exact same UUID
    let content: IReportContent;
    try {
      content = new ReportContent({
        report_id: reportId,
        tasks_completed: [],
        tasks_planned_next_week: [],
        blockers: [],
        achievements: [],
        hours_by_type: { development: 0, testing: 0, meetings: 0, documentation: 0 },
        notes: '',
      });
      await content.save();
    } catch (mongoError) {
      // Polyglot rollback: delete Postgres row if Mongo fails
      await prisma.report.delete({ where: { id: reportId } }).catch(() => {});
      throw mongoError;
    }

    return { report, content };
  }

  /**
   * Updates report_content in MongoDB:
   * Only allowed if status is 'draft' or 'needs_correction', and only by the report's owner.
   * Reject otherwise with 403.
   */
  async updateReportContent(
    reportId: string,
    userId: string,
    userRole: Role,
    data: UpdateReportContentDTO
  ): Promise<{ report: Report; content: IReportContent }> {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new AppError(404, 'Report not found.');
    }

    // Enforce content editability rules
    assertContentEditable(report.status, userRole, report.user_id === userId);

    // Fetch existing Mongo document
    let content = await ReportContent.findOne({ report_id: reportId });

    if (!content) {
      content = new ReportContent({ report_id: reportId });
    }

    // Apply updates
    if (data.tasks_completed !== undefined) content.tasks_completed = data.tasks_completed;
    if (data.tasks_planned_next_week !== undefined) content.tasks_planned_next_week = data.tasks_planned_next_week;
    if (data.blockers !== undefined) content.blockers = data.blockers;
    if (data.achievements !== undefined) content.achievements = data.achievements;
    if (data.hours_by_type !== undefined) content.hours_by_type = data.hours_by_type;
    if (data.notes !== undefined) content.notes = data.notes;

    // Validate and save (triggers Mongoose schema validators)
    await content.save();

    // Update Postgres timestamp
    const updatedReport = await prisma.report.update({
      where: { id: reportId },
      data: { updated_at: new Date() },
    });

    return { report: updatedReport, content };
  }

  /**
   * Moves status draft | needs_correction -> submitted.
   * Only the owner. Reject illegal transitions with 409 and clear message.
   */
  async submitReport(reportId: string, userId: string, userRole: Role): Promise<Report> {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new AppError(404, 'Report not found.');
    }

    // Validate state transition through explicit table
    validateStateTransition(
      report.status,
      ReportStatus.submitted,
      userRole,
      report.user_id === userId
    );

    // Update status in PostgreSQL
    const updatedReport = await prisma.report.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.submitted,
        updated_at: new Date(),
      },
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, role: true } },
      },
    });

    return updatedReport;
  }

  /**
   * Returns merged PostgreSQL header + MongoDB content.
   * Owner can see their own; Manager can see any.
   */
  async getReportById(reportId: string, userId: string, userRole: Role): Promise<any> {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        user: { select: { id: true, email: true, role: true } },
        project: { select: { id: true, name: true, active: true } },
      },
    });

    if (!report) {
      throw new AppError(404, 'Report not found.');
    }

    // Authorization: Owner or Manager only
    if (userRole !== Role.manager && report.user_id !== userId) {
      throw new AppError(403, 'Forbidden: You do not have permission to view this report.');
    }

    // Fetch MongoDB document
    const content = await ReportContent.findOne({ report_id: reportId });

    return {
      ...report,
      content: content || null,
    };
  }

  /**
   * Paginated list of reports.
   * TeamMember: only own reports.
   * Manager: can view all or filter.
   */
  async listReports(userId: string, userRole: Role, query: ListReportsQuery): Promise<any> {
    const page = Math.max(1, parseInt(String(query.page || 1), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(query.limit || 10), 10)));
    const skip = (page - 1) * limit;

    const where: any = {};

    // RBAC: Team member can only see their own reports
    if (userRole === Role.team_member) {
      where.user_id = userId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.project_id) {
      where.project_id = query.project_id;
    }

    const [total, data] = await Promise.all([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ week_start: 'desc' }, { created_at: 'desc' }],
        include: {
          project: { select: { id: true, name: true } },
          user: { select: { id: true, email: true } },
        },
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const meta = {
      total,
      page,
      limit,
      totalPages,
    };

    return {
      data,
      meta,
      pagination: meta, // Backwards compatibility alias
    };
  }

  /**
   * Manager reviews report (approve or request_changes).
   * - request_changes: snapshots content into MongoDB report_versions BEFORE status update,
   *   sets status = needs_correction, current_comment = comment, inserts review_comments row.
   * - approve: sets status = approved, inserts review_comments row (action=approve).
   */
  async reviewReport(
    reportId: string,
    reviewerId: string,
    reviewerRole: Role,
    data: { action: 'approve' | 'request_changes'; comment?: string }
  ): Promise<{ report: Report; reviewComment: any; versionSnapshot?: any }> {
    const { action, comment } = data;

    if (!action || (action !== 'approve' && action !== 'request_changes')) {
      throw new AppError(400, "Action must be either 'approve' or 'request_changes'.");
    }

    if (action === 'request_changes' && (!comment || typeof comment !== 'string' || !comment.trim())) {
      throw new AppError(400, 'A comment is required when requesting changes.');
    }

    const report = await prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new AppError(404, 'Report not found.');
    }

    const targetStatus =
      action === 'approve' ? ReportStatus.approved : ReportStatus.needs_correction;

    // Enforce state transition rule (Manager only, submitted -> approved | needs_correction)
    validateStateTransition(report.status, targetStatus, reviewerRole, false);

    let versionSnapshot: any = null;
    let mongoVersionRef: string | null = null;

    if (action === 'request_changes') {
      // 1. BEFORE updating status, snapshot current report_content into MongoDB report_versions
      const currentContent = await ReportContent.findOne({ report_id: reportId });

      // Determine next version number
      const latestVersion = await ReportVersion.findOne({ report_id: reportId })
        .sort({ version_number: -1 })
        .select('version_number');
      const nextVersionNumber = (latestVersion?.version_number || 0) + 1;

      const snapshot = new ReportVersion({
        report_id: reportId,
        version_number: nextVersionNumber,
        content_snapshot: {
          tasks_completed: currentContent?.tasks_completed || [],
          tasks_planned_next_week: currentContent?.tasks_planned_next_week || [],
          blockers: currentContent?.blockers || [],
          achievements: currentContent?.achievements || [],
          hours_by_type: currentContent?.hours_by_type || {
            development: 0,
            testing: 0,
            meetings: 0,
            documentation: 0,
          },
          notes: currentContent?.notes || '',
        },
        submitted_at: new Date(),
      });

      await snapshot.save();
      versionSnapshot = snapshot;
      mongoVersionRef = String(nextVersionNumber);
    }

    const cleanComment = comment?.trim() || (action === 'approve' ? 'Approved' : '');

    // 2. Update PostgreSQL report status & current_comment
    const updatedReport = await prisma.report.update({
      where: { id: reportId },
      data: {
        status: targetStatus,
        current_comment: cleanComment,
        updated_at: new Date(),
      },
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, role: true } },
      },
    });

    // 3. Insert audit row into PostgreSQL review_comments
    const reviewComment = await prisma.reviewComment.create({
      data: {
        report_id: reportId,
        reviewer_id: reviewerId,
        comment: cleanComment,
        action: action === 'approve' ? ReviewAction.approve : ReviewAction.request_changes,
        mongo_version_ref: mongoVersionRef,
      },
      include: {
        reviewer: { select: { id: true, email: true, role: true } },
      },
    });

    return {
      report: updatedReport,
      reviewComment,
      versionSnapshot,
    };
  }

  /**
   * Returns all report_versions snapshots for this report (bonus: version history list)
   * Accessible by Owner and Manager
   */
  async getReportVersions(reportId: string, userId: string, userRole: Role): Promise<any[]> {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new AppError(404, 'Report not found.');
    }

    if (userRole !== Role.manager && report.user_id !== userId) {
      throw new AppError(403, 'Forbidden: You do not have permission to view this report history.');
    }

    const versions = await ReportVersion.find({ report_id: reportId }).sort({
      version_number: -1,
    });

    return versions;
  }

  /**
   * Returns all review_comments for this report ordered by created_at (bonus: comment history)
   * Accessible by Owner and Manager
   */
  async getReportComments(reportId: string, userId: string, userRole: Role): Promise<any[]> {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new AppError(404, 'Report not found.');
    }

    if (userRole !== Role.manager && report.user_id !== userId) {
      throw new AppError(403, 'Forbidden: You do not have permission to view comments for this report.');
    }

    const comments = await prisma.reviewComment.findMany({
      where: { report_id: reportId },
      orderBy: { created_at: 'asc' },
      include: {
        reviewer: { select: { id: true, email: true, role: true } },
      },
    });

    return comments;
  }
}

export const reportService = new ReportService();
