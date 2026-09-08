import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { reportsApi, MergedReport } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { TaskRow } from '../components/TaskRow';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  History,
  MessageSquare,
  Calendar,
  Clock,
  Send,
} from 'lucide-react';

export const ManagerReview: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [report, setReport] = useState<MergedReport | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Review comment state
  const [actionType, setActionType] = useState<'approve' | 'request_changes'>('approve');
  const [reviewComment, setReviewComment] = useState('');

  const loadReportDetails = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [repData, commData, verData] = await Promise.all([
        reportsApi.getReportById(id),
        reportsApi.getReportComments(id).catch(() => ({ comments: [] })),
        reportsApi.getReportVersions(id).catch(() => ({ versions: [] })),
      ]);
      setReport(repData);
      setComments(commData.comments || []);
      setVersions(verData.versions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load report for review.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportDetails();
  }, [id]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    if (actionType === 'request_changes' && !reviewComment.trim()) {
      setError('A comment is required when requesting changes.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await reportsApi.reviewReport(id, {
        action: actionType,
        comment: reviewComment.trim() || undefined,
      });

      setSuccessMsg(
        actionType === 'approve'
          ? 'Report approved successfully.'
          : 'Report returned for corrections. Snapshot created in MongoDB.'
      );
      setReviewComment('');
      await loadReportDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-sm text-muted">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        Loading report for review...
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center">
        <div className="p-6 bg-red-50 border border-red-200 rounded-card text-red-700 text-sm mb-4">
          {error}
        </div>
        <Link
          to="/manager/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    );
  }

  if (!report) return null;

  const content = report.content || {};
  const tasks = content.tasks_completed || [];
  const blockers = content.blockers || [];
  const achievements = content.achievements || [];
  const hours = content.hours_by_type || {};

  const totalHours =
    (hours.development || 0) +
    (hours.testing || 0) +
    (hours.meetings || 0) +
    (hours.documentation || 0);

  const formatDate = (dStr: string) => {
    if (!dStr) return '';
    return new Date(dStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <Link
          to="/manager/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>

        <StatusBadge status={report.status} />
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-card flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-card flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Header Info Panel */}
      <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-primary">
              Review: {report.project?.name || 'Weekly Progress Report'}
            </h1>
            <p className="text-xs text-muted mt-1 flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(report.week_start)} — {formatDate(report.week_end)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {totalHours} hours total
              </span>
            </p>
          </div>

          <div className="text-left sm:text-right text-xs text-muted">
            <div>
              Team Member:{' '}
              <Link
                to={`/manager/members/${report.user_id}`}
                className="font-medium text-accent hover:underline"
              >
                {report.user?.email}
              </Link>
            </div>
            <div>Last Updated: {formatDate(report.updated_at)}</div>
          </div>
        </div>

        {/* Hours Allocation Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-subsurface rounded-card border border-border">
            <div className="text-xs text-muted">Development</div>
            <div className="text-base font-semibold text-primary mt-0.5">{hours.development || 0}h</div>
          </div>
          <div className="p-3 bg-subsurface rounded-card border border-border">
            <div className="text-xs text-muted">Testing</div>
            <div className="text-base font-semibold text-primary mt-0.5">{hours.testing || 0}h</div>
          </div>
          <div className="p-3 bg-subsurface rounded-card border border-border">
            <div className="text-xs text-muted">Meetings</div>
            <div className="text-base font-semibold text-primary mt-0.5">{hours.meetings || 0}h</div>
          </div>
          <div className="p-3 bg-subsurface rounded-card border border-border">
            <div className="text-xs text-muted">Documentation</div>
            <div className="text-base font-semibold text-primary mt-0.5">{hours.documentation || 0}h</div>
          </div>
        </div>
      </div>

      {/* Review Action Card */}
      <div className="bg-surface border border-accent-border rounded-card p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-primary">Manager Review Decision</h2>
          <p className="text-xs text-muted">
            Approve report or request revisions. Requesting changes automatically captures an immutable MongoDB snapshot.
          </p>
        </div>

        <form onSubmit={handleReviewSubmit} className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-primary">
              <input
                type="radio"
                name="action"
                value="approve"
                checked={actionType === 'approve'}
                onChange={() => setActionType('approve')}
                className="text-accent focus:ring-accent"
              />
              <span>Approve Report</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-primary">
              <input
                type="radio"
                name="action"
                value="request_changes"
                checked={actionType === 'request_changes'}
                onChange={() => setActionType('request_changes')}
                className="text-amber-600 focus:ring-amber-500"
              />
              <span>Request Changes</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-primary mb-1.5">
              Review Comments {actionType === 'request_changes' && <span className="text-red-500">*</span>}
            </label>
            <textarea
              rows={3}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder={
                actionType === 'request_changes'
                  ? 'Specify required corrections (required)...'
                  : 'Optional feedback or praise for the team member...'
              }
              className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
              required={actionType === 'request_changes'}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-card transition-colors shadow-sm disabled:opacity-60 ${
                actionType === 'approve'
                  ? 'bg-accent hover:bg-accent-hover'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Processing...'
                  : actionType === 'approve'
                  ? 'Confirm Approval'
                  : 'Submit Change Request'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Read-Only Report Content Display */}
      <div className="bg-surface border border-border rounded-card p-6 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-primary">Tasks Completed This Week</h2>
        {tasks.length === 0 ? (
          <p className="text-xs text-muted">No completed tasks logged.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-subsurface text-xs font-medium text-muted uppercase">
                  <th className="py-2 px-3">Task Name</th>
                  <th className="py-2 px-3">Priority</th>
                  <th className="py-2 px-3">Progress</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Hours</th>
                  <th className="py-2 px-3">Deliverable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasks.map((task, idx) => (
                  <TaskRow
                    key={idx}
                    index={idx}
                    task={task}
                    onChange={() => {}}
                    onRemove={() => {}}
                    isReadOnly={true}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Blockers & Achievements Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm space-y-3">
          <h2 className="text-base font-semibold text-primary">Blockers & Roadblocks</h2>
          {blockers.length === 0 ? (
            <p className="text-xs text-muted">No blockers reported.</p>
          ) : (
            blockers.map((b, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-card text-xs border ${
                  b.is_key_issue
                    ? 'bg-red-50 border-red-200 text-red-900 font-medium'
                    : 'bg-subsurface border-border text-primary'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{b.text}</span>
                  {b.is_key_issue && (
                    <span className="px-2 py-0.5 rounded font-bold bg-red-100 text-red-800 border border-red-300">
                      Key Issue
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="bg-surface border border-border rounded-card p-6 shadow-sm space-y-3">
          <h2 className="text-base font-semibold text-primary">Key Achievements</h2>
          {achievements.length === 0 ? (
            <p className="text-xs text-muted">No achievements recorded.</p>
          ) : (
            achievements.map((a, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-card text-xs border ${
                  a.is_key_achievement
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-medium'
                    : 'bg-subsurface border-border text-primary'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{a.text}</span>
                  {a.is_key_achievement && (
                    <span className="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Key Win
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Snapshot Version History & Audit Trail */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Version Snapshots */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-accent" />
            <h2 className="text-base font-semibold text-primary">Version Snapshot History</h2>
          </div>

          {versions.length === 0 ? (
            <p className="text-xs text-muted">No prior version snapshots recorded.</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div
                  key={v._id}
                  className="flex items-center justify-between p-3 bg-subsurface border border-border rounded-card text-xs"
                >
                  <div>
                    <strong className="text-primary">Version {v.version_number}</strong>
                    <span className="text-muted ml-2">Snapshot captured on change request</span>
                  </div>
                  <span className="text-muted">{new Date(v.submitted_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Review Comments History */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-accent" />
            <h2 className="text-base font-semibold text-primary">Comments Audit Trail</h2>
          </div>

          {comments.length === 0 ? (
            <p className="text-xs text-muted">No previous review comments.</p>
          ) : (
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="p-3 bg-subsurface border border-border rounded-card text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">{c.reviewer?.email}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        c.action === 'approve'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {c.action === 'approve' ? 'Approved' : 'Changes Requested'}
                    </span>
                  </div>
                  {c.comment && <p className="text-muted">{c.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
