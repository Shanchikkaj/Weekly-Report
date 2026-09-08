import { ReportStatus, Role } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export interface TransitionRule {
  from: ReportStatus;
  to: ReportStatus;
  allowedRole: Role;
  requireOwnership: boolean;
  requiresComment?: boolean;
}

/**
 * EXPLICIT STATE MACHINE TRANSITION TABLE
 * Defines all valid report lifecycle state transitions and authorization rules.
 */
export const REPORT_STATE_TRANSITIONS: TransitionRule[] = [
  // Draft -> Submitted (Owner only)
  {
    from: ReportStatus.draft,
    to: ReportStatus.submitted,
    allowedRole: Role.team_member,
    requireOwnership: true,
  },
  // Needs Correction -> Submitted (Owner only, cycle can repeat)
  {
    from: ReportStatus.needs_correction,
    to: ReportStatus.submitted,
    allowedRole: Role.team_member,
    requireOwnership: true,
  },
  // Submitted -> Approved (Manager only)
  {
    from: ReportStatus.submitted,
    to: ReportStatus.approved,
    allowedRole: Role.manager,
    requireOwnership: false,
  },
  // Submitted -> Needs Correction (Manager only, requires review comment)
  {
    from: ReportStatus.submitted,
    to: ReportStatus.needs_correction,
    allowedRole: Role.manager,
    requireOwnership: false,
    requiresComment: true,
  },
];

/**
 * Validates a state transition against the explicit transition table.
 * Rejects illegal transitions with HTTP 409 Conflict or 403 Forbidden.
 */
export function validateStateTransition(
  currentStatus: ReportStatus,
  targetStatus: ReportStatus,
  userRole: Role,
  isOwner: boolean
): TransitionRule {
  const rule = REPORT_STATE_TRANSITIONS.find(
    (t) => t.from === currentStatus && t.to === targetStatus
  );

  if (!rule) {
    throw new AppError(
      409,
      `Illegal transition: Cannot move report from '${currentStatus}' to '${targetStatus}'.`
    );
  }

  if (rule.allowedRole !== userRole) {
    throw new AppError(
      403,
      `Forbidden: Role '${userRole}' is not permitted to transition report from '${currentStatus}' to '${targetStatus}'.`
    );
  }

  if (rule.requireOwnership && !isOwner) {
    throw new AppError(
      403,
      `Forbidden: Only the report's owner can transition this report from '${currentStatus}' to '${targetStatus}'.`
    );
  }

  return rule;
}

/**
 * Asserts whether a report's content is editable:
 * - Only 'draft' and 'needs_correction' can be edited.
 * - Only the report's owner (TeamMember) can edit content.
 * - Managers can NEVER edit content.
 */
export function assertContentEditable(
  currentStatus: ReportStatus,
  userRole: Role,
  isOwner: boolean
): void {
  if (userRole === Role.manager) {
    throw new AppError(
      403,
      'Forbidden: Managers can never edit report content (only review status and comments).'
    );
  }

  if (!isOwner) {
    throw new AppError(403, 'Forbidden: You can only edit your own reports.');
  }

  if (currentStatus !== ReportStatus.draft && currentStatus !== ReportStatus.needs_correction) {
    throw new AppError(
      403,
      `Forbidden: Report content cannot be edited while status is '${currentStatus}'. Content is locked.`
    );
  }
}
