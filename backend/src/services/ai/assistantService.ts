import { prisma } from '../../config/prisma';
import { ReportContent } from '../../models/ReportContent';
import { Role, ReportStatus } from '@prisma/client';
import { getAIProvider } from './aiProviderFactory';
import {
  ASSISTANT_SYSTEM_INSTRUCTION,
  formatReportContext,
  formatCalculatedMetrics,
  formatMemberSummaryMetrics,
  buildUserPrompt,
  FormattedReportContext,
  CalculatedMetrics,
  MemberSummaryMetric,
} from './assistantPrompt';

export interface AssistantDateRange {
  from: string; // ISO YYYY-MM-DD
  to: string;   // ISO YYYY-MM-DD
}

export interface AssistantFilters {
  member?: string | null;
  project?: string | null;
  status?: string | null;
}

export interface AssistantResponse {
  answer: string;
  reportCount: number;
  dateRange: AssistantDateRange | null;
  filters: AssistantFilters;
  provider: string;
  model?: string;
}

export class AssistantProviderUnavailableError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(
    message: string = 'The AI report assistant is temporarily unavailable. Please try again later.',
    statusCode: number = 503,
    code: string = 'AI_PROVIDER_UNAVAILABLE'
  ) {
    super(message);
    this.name = 'AssistantProviderUnavailableError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Format a Date object or ISO string reliably to UTC YYYY-MM-DD (ISO date format)
 */
export function formatIsoDateString(d: Date | string): string {
  const date = new Date(d);
  if (isNaN(date.getTime())) {
    return '';
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert email to human-readable display name (e.g. "alice.chen@company.com" -> "Alice Chen")
 */
export function formatUserDisplayName(email: string): string {
  const prefix = email.split('@')[0];
  const parts = prefix.split('.');
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Resolve calendar boundaries using the configured APP_TIMEZONE (e.g., "Asia/Colombo")
 * Weeks run Monday through Sunday.
 */
export function getResolvedTimezoneDates(timeframe: 'this_week' | 'last_week' | 'four_weeks' | 'all') {
  const timeZone = process.env.APP_TIMEZONE || 'Asia/Colombo';
  
  // Format current date in configured timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const formattedToday = formatter.format(now); // "YYYY-MM-DD"
  const [y, m, d] = formattedToday.split('-').map(Number);
  const tzDate = new Date(Date.UTC(y, m - 1, d));
  
  // Monday = 1, Sunday = 7 (in JS getUTCDay(): 0 is Sunday, 1 is Monday)
  const dayOfWeek = tzDate.getUTCDay() === 0 ? 7 : tzDate.getUTCDay();
  
  // Current Monday
  const currentMonday = new Date(tzDate);
  currentMonday.setUTCDate(tzDate.getUTCDate() - (dayOfWeek - 1));
  
  // Current Sunday
  const currentSunday = new Date(currentMonday);
  currentSunday.setUTCDate(currentMonday.getUTCDate() + 6);
  
  if (timeframe === 'this_week') {
    return { startDate: currentMonday, endDate: currentSunday };
  }
  
  if (timeframe === 'last_week') {
    const lastMonday = new Date(currentMonday);
    lastMonday.setUTCDate(currentMonday.getUTCDate() - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setUTCDate(lastMonday.getUTCDate() + 6);
    return { startDate: lastMonday, endDate: lastSunday };
  }
  
  // Default: Past 4 weeks (from Monday 4 weeks ago through current Sunday)
  const fourWeeksAgoMonday = new Date(currentMonday);
  fourWeeksAgoMonday.setUTCDate(currentMonday.getUTCDate() - 28);
  return { startDate: fourWeeksAgoMonday, endDate: currentSunday };
}

export class AssistantService {
  /**
   * Conservative scope filter:
   * Returns true if question is related to reports, projects, team members, deliverables, workload, etc.
   * Returns false if clearly unrelated (e.g. recipes, generic coding questions, trivia, weather, politics).
   */
  isQuestionInScope(
    question: string,
    teamMembers: { email: string; displayName: string }[],
    projects: { name: string }[]
  ): boolean {
    const q = question.toLowerCase();

    // 1. Check if question mentions any known team member name or email prefix
    for (const m of teamMembers) {
      const emailPrefix = m.email.split('@')[0].toLowerCase();
      const parts = emailPrefix.split('.');
      const first = parts[0];
      const last = parts[1] || '';
      const display = m.displayName.toLowerCase();

      if (q.includes(emailPrefix) || q.includes(display)) return true;
      if (first.length > 2 && q.includes(first)) return true;
      if (last.length > 2 && q.includes(last)) return true;
    }

    // 2. Check if question mentions any organizational project name
    for (const p of projects) {
      const pLower = p.name.toLowerCase();
      if (q.includes(pLower)) return true;
      const words = pLower.split(/\s+/).filter((w) => w.length > 3 && w !== 'with' && w !== 'from');
      if (words.some((w) => q.includes(w))) return true;
    }

    // 3. Relevant report domain keywords
    const domainKeywords = [
      'report', 'reports', 'weekly', 'status', 'task', 'tasks', 'deliverable', 'deliverables',
      'blocker', 'blockers', 'achievement', 'achievements', 'work', 'worked', 'working',
      'hour', 'hours', 'time', 'spent', 'planned', 'workload', 'progress',
      'approval', 'approve', 'approved', 'correction', 'draft', 'submitted', 'review',
      'team', 'member', 'members', 'activity', 'trend', 'trends', 'compare', 'comparison',
      'summary', 'summarise', 'summarize', 'overview', 'milestone', 'milestones',
      'pipeline', 'platform', 'security', 'analytics', 'web', 'devops', 'backend', 'frontend',
      'development', 'testing', 'meetings', 'documentation', 'notes', 'feedback', 'problems', 'problem',
      'waiting', 'awaiting', 'facing', 'faced', 'everyone', 'anybody', 'latest'
    ];

    const matchedKeyword = domainKeywords.some((kw) => {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      return regex.test(q);
    });

    if (matchedKeyword) {
      return true;
    }

    return false;
  }

  /**
   * Main query execution pipeline:
   * 1. Check scope
   * 2. Extract database filters with strict ambiguity resolution
   * 3. Fetch Postgres reports + single batch MongoDB content (max 50)
   * 4. Pre-calculate arithmetic and format structured prompt
   * 5. Call AI Provider
   */
  async processQuery(managerUserId: string, question: string): Promise<AssistantResponse> {
    const sanitizedQuestion = question.trim();
    if (!sanitizedQuestion) {
      throw new Error('Question must not be empty.');
    }

    // Fetch team members and projects for scope & filter detection
    const [teamUsers, allProjects] = await Promise.all([
      prisma.user.findMany({
        where: { role: Role.team_member, active: true },
        select: { id: true, email: true },
      }),
      prisma.project.findMany({
        where: { active: true },
        select: { id: true, name: true },
      }),
    ]);

    const formattedMembers = teamUsers.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: formatUserDisplayName(u.email),
    }));

    // Step 1: Server-side Scope Check
    const inScope = this.isQuestionInScope(sanitizedQuestion, formattedMembers, allProjects);
    if (!inScope) {
      return {
        answer: 'I can only answer questions about team members, projects, and weekly reports.',
        reportCount: 0,
        dateRange: null,
        filters: {},
        provider: 'scope_filter',
      };
    }

    // Step 2: Determine Filters from Question
    const qLower = sanitizedQuestion.toLowerCase();

    // Check member filtering with exact match & safe partial match with ambiguity resolution
    let matchedMember: { id: string; email: string; displayName: string } | null = null;
    let candidateMatches: { id: string; email: string; displayName: string }[] = [];

    // Check for exact email or full display name first
    for (const m of formattedMembers) {
      const emailLower = m.email.toLowerCase();
      const displayLower = m.displayName.toLowerCase();
      if (qLower.includes(emailLower) || qLower.includes(displayLower)) {
        matchedMember = m;
        candidateMatches = [m];
        break;
      }
    }

    // If no full match, check partial name matching (first name, last name, email prefix)
    if (!matchedMember && !qLower.includes('all team') && !qLower.includes('whole team') && !qLower.includes('across the team') && !qLower.includes('everyone') && !qLower.includes('anybody')) {
      for (const m of formattedMembers) {
        const emailPrefix = m.email.split('@')[0].toLowerCase();
        const parts = emailPrefix.split('.');
        const first = parts[0];
        const last = parts[1] || '';

        const regexFirst = new RegExp(`\\b${first}\\b`, 'i');
        const regexLast = last.length > 2 ? new RegExp(`\\b${last}\\b`, 'i') : null;
        const regexPrefix = new RegExp(`\\b${emailPrefix}\\b`, 'i');

        if (regexPrefix.test(qLower) || regexFirst.test(qLower) || (regexLast && regexLast.test(qLower))) {
          if (!candidateMatches.some((c) => c.id === m.id)) {
            candidateMatches.push(m);
          }
        }
      }

      if (candidateMatches.length === 1) {
        matchedMember = candidateMatches[0];
      } else if (candidateMatches.length > 1) {
        // Ambiguous match: multiple team members matched
        const matchedNames = candidateMatches.map((c) => c.displayName).join(', ');
        return {
          answer: `Multiple team members match your query (${matchedNames}). Please specify the full name.`,
          reportCount: 0,
          dateRange: null,
          filters: { member: candidateMatches[0].displayName.split(' ')[0] },
          provider: 'member_disambiguation',
        };
      }
    }

    // If no existing member matched, check if a specific person was asked for
    if (!matchedMember && candidateMatches.length === 0 && !qLower.includes('all team') && !qLower.includes('whole team') && !qLower.includes('across the team') && !qLower.includes('every team') && !qLower.includes('everyone') && !qLower.includes('anybody')) {
      const memberPatterns = [
        /what\s+did\s+([a-z0-9_.\s-]+?)\s+(?:work|do|complete|deliver|submit|report)/i,
        /activity\s+(?:of|for|details\s+of)\s+([a-z0-9_.\s-]+?)(?:\s+during|\s+in|\s+this|\s+last|\?|$)/i,
        /(?:summary|summarise|summarize|details|deliverables|blockers)\s+(?:of|for)\s+([a-z0-9_.\s-]+?)(?:\s+during|\s+in|\s+this|\s+last|\?|$)/i,
        /([a-z0-9_.-]+)'s\s+(?:work|report|deliverables|blockers|tasks|activity|latest)/i,
        /show\s+([a-z0-9_.-]+)'s\s+(?:work|report|deliverables|blockers|tasks|activity|latest)/i,
      ];

      for (const pattern of memberPatterns) {
        const match = sanitizedQuestion.match(pattern);
        if (match && match[1]) {
          const candidate = match[1].trim();
          const candidateLower = candidate.toLowerCase();
          const ignoredTerms = ['the team', 'all team members', 'team member', 'the project', 'everyone', 'anyone', 'all members', 'anybody'];
          if (!ignoredTerms.includes(candidateLower) && candidate.length > 2) {
            return {
              answer: 'No matching team member was found in the available report data.',
              reportCount: 0,
              dateRange: null,
              filters: {
                member: candidate,
                project: null,
                status: null,
              },
              provider: 'none',
            };
          }
        }
      }
    }

    // Check for specific project filter (sort by length descending to match most specific first)
    const sortedProjects = [...allProjects].sort((a, b) => b.name.length - a.name.length);
    let matchedProject: { id: string; name: string } | null = null;
    for (const p of sortedProjects) {
      const pLower = p.name.toLowerCase();
      if (qLower.includes(pLower)) {
        matchedProject = p;
        break;
      }
      const words = pLower.split(/\s+/).filter((w) => w.length > 3 && w !== 'pipeline' && w !== 'platform');
      if (words.length > 1 && words.every((w) => qLower.includes(w))) {
        matchedProject = p;
        break;
      }
    }

    // Check for specific status filter
    let matchedStatus: ReportStatus | null = null;
    if (qLower.includes('awaiting approval') || qLower.includes('pending approval') || qLower.includes('need approval') || qLower.includes('needs approval') || qLower.includes('submitted') || qLower.includes('waiting for review')) {
      matchedStatus = ReportStatus.submitted;
    } else if (qLower.includes('needs correction') || qLower.includes('correction') || qLower.includes('changes requested')) {
      matchedStatus = ReportStatus.needs_correction;
    } else if (qLower.includes('approved')) {
      matchedStatus = ReportStatus.approved;
    } else if (qLower.includes('draft')) {
      matchedStatus = ReportStatus.draft;
    }

    // Resolve date timeframe using APP_TIMEZONE (Monday through Sunday)
    let timeframe: 'this_week' | 'last_week' | 'four_weeks' = 'four_weeks';
    if (qLower.includes('this week') || qLower.includes('current week')) {
      timeframe = 'this_week';
    } else if (qLower.includes('last week') || qLower.includes('past week')) {
      timeframe = 'last_week';
    }

    const { startDate, endDate } = getResolvedTimezoneDates(timeframe);

    // Build Prisma query where clause
    const whereClause: any = {
      user: {
        role: Role.team_member,
        active: true,
      },
    };

    if (matchedMember) {
      whereClause.user_id = matchedMember.id;
    }
    if (matchedProject) {
      whereClause.project_id = matchedProject.id;
    }
    if (matchedStatus) {
      whereClause.status = matchedStatus;
    }
    if (startDate) {
      whereClause.week_start = { gte: startDate };
    }

    // Step 3: Fetch PostgreSQL Reports (Apply max limit of 50 reports)
    const reports = await prisma.report.findMany({
      where: whereClause,
      orderBy: [{ week_start: 'desc' }, { created_at: 'desc' }],
      take: 50,
      include: {
        user: { select: { id: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

    const activeFilters: AssistantFilters = {
      member: matchedMember ? matchedMember.displayName : null,
      project: matchedProject ? matchedProject.name : null,
      status: matchedStatus ? matchedStatus : null,
    };

    // If no reports found matching query
    if (reports.length === 0) {
      return {
        answer: 'No matching report information was found for that request.',
        reportCount: 0,
        dateRange: null,
        filters: activeFilters,
        provider: 'none',
      };
    }

    // Step 4: Batch-fetch matching MongoDB report content using ONE $in query (No N+1)
    const reportIds = reports.map((r) => r.id);
    const contents = await ReportContent.find({ report_id: { $in: reportIds } }).lean();
    const contentMap = new Map<string, any>();
    for (const c of contents) {
      contentMap.set(c.report_id, c);
    }

    // Step 5: Backend Arithmetic Calculation (Do not rely on Gemini for arithmetic)
    let minDate: Date = reports[0].week_start;
    let maxDate: Date = reports[0].week_end;

    const uniqueMembersSet = new Set<string>();
    const uniqueProjectsSet = new Set<string>();
    const statusCounts = { approved: 0, submitted: 0, needsCorrection: 0, draft: 0 };
    const taskCounts = { totalTasks: 0, doneTasks: 0, inProgressTasks: 0, blockedTasks: 0 };
    const hourTotals = { development: 0, testing: 0, meetings: 0, documentation: 0, totalHours: 0 };
    const blockerStats = { totalBlockers: 0, keyBlockers: 0 };
    const achievementStats = { totalAchievements: 0, keyAchievements: 0 };

    // Track per-member summary metrics in TypeScript
    const memberMetricsMap = new Map<string, MemberSummaryMetric>();

    for (const r of reports) {
      if (r.week_start < minDate) minDate = r.week_start;
      if (r.week_end > maxDate) maxDate = r.week_end;

      const memberName = formatUserDisplayName(r.user.email);
      uniqueMembersSet.add(memberName);
      if (r.project?.name) uniqueProjectsSet.add(r.project.name);

      if (!memberMetricsMap.has(memberName)) {
        memberMetricsMap.set(memberName, {
          name: memberName,
          completedTasks: 0,
          inProgressTasks: 0,
          blockedTasks: 0,
          totalTasks: 0,
          loggedHours: 0,
          mainDeliverables: [],
          keyBlockersCount: 0,
          reportsWithKeyBlockerCount: 0,
          keyBlockerOccurrences: [],
          keyBlockers: [],
          keyAchievements: [],
        });
      }
      const mm = memberMetricsMap.get(memberName)!;

      // Status
      if (r.status === ReportStatus.approved) statusCounts.approved++;
      else if (r.status === ReportStatus.submitted) statusCounts.submitted++;
      else if (r.status === ReportStatus.needs_correction) statusCounts.needsCorrection++;
      else if (r.status === ReportStatus.draft) statusCounts.draft++;

      // Content stats
      const c = contentMap.get(r.id);
      if (c) {
        if (Array.isArray(c.tasks_completed)) {
          for (const t of c.tasks_completed) {
            taskCounts.totalTasks++;
            mm.totalTasks++;
            if (t.status === 'done') {
              taskCounts.doneTasks++;
              mm.completedTasks++;
              if (t.output_deliverable && !mm.mainDeliverables.includes(t.output_deliverable)) {
                mm.mainDeliverables.push(t.output_deliverable);
              } else if (t.task_name && !mm.mainDeliverables.includes(t.task_name)) {
                mm.mainDeliverables.push(t.task_name);
              }
            } else if (t.status === 'in_progress') {
              taskCounts.inProgressTasks++;
              mm.inProgressTasks++;
            } else if (t.status === 'blocked') {
              taskCounts.blockedTasks++;
              mm.blockedTasks++;
            }
          }
        }

        if (c.hours_by_type) {
          const h = c.hours_by_type;
          const dev = Number(h.development || 0);
          const qa = Number(h.testing || 0);
          const meet = Number(h.meetings || 0);
          const doc = Number(h.documentation || 0);
          hourTotals.development += dev;
          hourTotals.testing += qa;
          hourTotals.meetings += meet;
          hourTotals.documentation += doc;
          mm.loggedHours += (dev + qa + meet + doc);
        }

        let reportHasKeyBlocker = false;
        if (Array.isArray(c.blockers)) {
          for (const b of c.blockers) {
            blockerStats.totalBlockers++;
            if (b.is_key_issue) {
              blockerStats.keyBlockers++;
              reportHasKeyBlocker = true;
              mm.keyBlockersCount++;
              const periodStr = `${formatIsoDateString(r.week_start)} to ${formatIsoDateString(r.week_end)}`;
              mm.keyBlockerOccurrences.push({
                project: r.project?.name || 'General',
                reportingPeriod: periodStr,
                text: b.text,
              });
              if (b.text && !mm.keyBlockers.includes(b.text)) {
                mm.keyBlockers.push(b.text);
              }
            }
          }
        }
        if (reportHasKeyBlocker) {
          mm.reportsWithKeyBlockerCount++;
        }

        if (Array.isArray(c.achievements)) {
          for (const a of c.achievements) {
            achievementStats.totalAchievements++;
            if (a.is_key_achievement) {
              achievementStats.keyAchievements++;
              if (a.text && !mm.keyAchievements.includes(a.text)) {
                mm.keyAchievements.push(a.text);
              }
            }
          }
        }
      }
    }

    hourTotals.totalHours = hourTotals.development + hourTotals.testing + hourTotals.meetings + hourTotals.documentation;

    const calculatedMetrics: CalculatedMetrics = {
      totalReports: reports.length,
      uniqueMembers: uniqueMembersSet.size,
      uniqueProjects: uniqueProjectsSet.size,
      statusBreakdown: statusCounts,
      taskStats: taskCounts,
      hourTotals,
      blockerStats,
      achievementStats,
    };

    const calculatedMetricsText = formatCalculatedMetrics(calculatedMetrics);
    const memberSummaryText = formatMemberSummaryMetrics(Array.from(memberMetricsMap.values()));

    const isoFrom = formatIsoDateString(minDate);
    const isoTo = formatIsoDateString(maxDate);

    const dateRange: AssistantDateRange = {
      from: isoFrom <= isoTo ? isoFrom : isoTo,
      to: isoTo >= isoFrom ? isoTo : isoFrom,
    };

    // Determine if manager asked for emails
    const includeEmail = /\b(emails?|e-mails?|contact)\b/i.test(sanitizedQuestion);

    // Format individual reports
    const formattedContextReports: FormattedReportContext[] = reports.map((report) => {
      const content = contentMap.get(report.id) || {};
      const memberDisplayName = formatUserDisplayName(report.user.email);
      const projectName = report.project?.name || 'General';
      const memberLabel = includeEmail ? `${memberDisplayName} (${report.user.email})` : memberDisplayName;

      return {
        memberName: memberLabel,
        projectName,
        weekStart: formatIsoDateString(report.week_start),
        weekEnd: formatIsoDateString(report.week_end),
        status: report.status,
        managerComment: report.current_comment,
        tasksCompleted: Array.isArray(content.tasks_completed)
          ? content.tasks_completed.map((t: any) => ({
              taskName: t.task_name,
              priority: t.priority,
              plannedPercent: t.planned_percent,
              actualPercent: t.actual_percent,
              status: t.status,
              plannedHours: t.time_planned_hours || 0,
              spentHours: t.time_spent_hours || 0,
              deliverable: t.output_deliverable,
            }))
          : [],
        plannedNextWeek: Array.isArray(content.tasks_planned_next_week) ? content.tasks_planned_next_week : [],
        blockers: Array.isArray(content.blockers)
          ? content.blockers.map((b: any) => ({
              text: b.text,
              isKeyIssue: !!b.is_key_issue,
            }))
          : [],
        achievements: Array.isArray(content.achievements)
          ? content.achievements.map((a: any) => ({
              text: a.text,
              isKeyAchievement: !!a.is_key_achievement,
            }))
          : [],
        hoursByType: content.hours_by_type,
        notes: content.notes,
      };
    });

    const isWholeTeamQuery =
      !matchedMember &&
      (qLower.includes('team') ||
       qLower.includes('compare') ||
       qLower.includes('comparison') ||
       qLower.includes('everyone') ||
       qLower.includes('all member') ||
       qLower.includes('everybody') ||
       qLower.includes('all reports'));

    const { contextText, isTruncated } = formatReportContext(formattedContextReports);
    const userPrompt = buildUserPrompt(
      calculatedMetricsText,
      memberSummaryText,
      contextText,
      sanitizedQuestion,
      isTruncated,
      isWholeTeamQuery
    );

    // Step 6: Invoke AI Provider
    let provider = getAIProvider();

    try {
      const answer = await provider.generateText(userPrompt, {
        systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION,
      });

      return {
        answer,
        reportCount: reports.length,
        dateRange,
        filters: activeFilters,
        provider: provider.name,
        model: provider.model,
      };
    } catch (error: any) {
      const statusCode = error?.statusCode || 503;
      const code = error?.code || 'AI_PROVIDER_UNAVAILABLE';
      let safeMsg = 'The AI report assistant is temporarily unavailable. Please try again later.';

      if (statusCode === 429) {
        safeMsg = 'The AI assistant has reached its rate limit. Please wait a moment and try again.';
      } else if (code === 'AI_RESPONSE_TRUNCATED' || statusCode === 422) {
        safeMsg = 'The response was too long to complete. Please ask about a specific team member, project, or shorter timeframe.';
      }

      console.error('[AssistantService] Provider execution failed:', error?.message || error);
      throw new AssistantProviderUnavailableError(safeMsg, statusCode, code);
    }
  }
}

export const assistantService = new AssistantService();
