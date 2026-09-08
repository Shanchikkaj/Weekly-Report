import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { reportsApi, MergedReport } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { TaskRow } from '../components/TaskRow';
import {
  ArrowLeft,
  Edit3,
  Send,
  Clock,
  AlertTriangle,
  History,
  MessageSquare,
  Calendar,
} from 'lucide-react';

export const ReportDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [report, setReport] = useState<MergedReport | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReportData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [reportData, commentsData, versionsData] = await Promise.all([
        reportsApi.getReportById(id),
        reportsApi.getReportComments(id).catch(() => ({ comments: [] })),
        reportsApi.getReportVersions(id).catch(() => ({ versions: [] })),
      ]);
      setReport(reportData);
      setComments(commentsData.comments || []);
      setVersions(versionsData.versions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [id]);

  const handleSubmit = async () => {
    if (!id) return;
    if (!window.confirm('Are you ready to submit this report for manager review?')) return;

    setSubmitting(true);
    try {
      await reportsApi.submitReport(id);
      await fetchReportData();
    } catch (err: any) {
      setError(err.message || 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-muted">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        Loading report...
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center">
        <div className="p-6 bg-red-50 border border-red-200 rounded-card text-red-700 text-sm mb-4">
          {error || 'Report not found.'}
        </div>
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to report history</span>
        </Link>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const isOwner = user?.id === report.user_id;
  const isEditable = isOwner && (report.status === 'draft' || report.status === 'needs_correction');

  const content = report.content || {};
  const tasks = content.tasks_completed || [];
  const nextTasks = content.tasks_planned_next_week || [];
  const blockers = content.blockers || [];
  const achievements = content.achievements || [];
  const hours = content.hours_by_type || {};

  const totalHours =
    (hours.development || 0) +
    (hours.testing || 0) +
    (hours.meetings || 0) +
    (hours.documentation || 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Navigation & Status */}
      <div className="flex items-center justify-between">
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Reports</span>
        </Link>

        <div className="flex items-center gap-3">
          <StatusBadge status={report.status} />

          {isEditable && (
            <div className="flex items-center gap-2">
              <Link
                to={`/reports/${report.id}/edit`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-surface hover:bg-subsurface border border-border rounded-card transition-colors shadow-sm"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </Link>

              <button
                disabled={submitting}
                onClick={handleSubmit}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-card transition-colors shadow-sm disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'Submitting...' : 'Submit'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Needs Correction / Manager Comment Banner */}
      {report.status === 'needs_correction' && report.current_comment && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-card">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-amber-900">Changes Requested by Manager</h4>
              <p className="text-sm text-amber-800 mt-1 whitespace-pre-wrap">
                {report.current_comment}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header Info Panel */}
      <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-primary">
              {report.project?.name || 'Weekly Progress Report'}
            </h1>
            <p className="text-xs text-muted mt-1 flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(report.week_start)} — {formatDate(report.week_end)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Total: {totalHours} hrs logged
              </span>
            </p>
          </div>

          <div className="text-left sm:text-right text-xs text-muted">
            <div>Submitted by: <strong className="text-primary">{report.user?.email}</strong></div>
            <div>Updated: {formatDate(report.updated_at)}</div>
          </div>
        </div>

        {/* Hours Allocation Mini Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-subsurface rounded-card border border-border">
            <div className="text-xs text-muted">Development</div>
            <div className="text-base font-semibold text-primary mt-0.5">
              {hours.development || 0}h
            </div>
          </div>
          <div className="p-3 bg-subsurface rounded-card border border-border">
            <div className="text-xs text-muted">Testing</div>
            <div className="text-base font-semibold text-primary mt-0.5">
              {hours.testing || 0}h
            </div>
          </div>
          <div className="p-3 bg-subsurface rounded-card border border-border">
            <div className="text-xs text-muted">Meetings</div>
            <div className="text-base font-semibold text-primary mt-0.5">
              {hours.meetings || 0}h
            </div>
          </div>
          <div className="p-3 bg-subsurface rounded-card border border-border">
            <div className="text-xs text-muted">Documentation</div>
            <div className="text-base font-semibold text-primary mt-0.5">
              {hours.documentation || 0}h
            </div>
          </div>
        </div>
      </div>

      {/* Tasks Completed Section */}
      <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
        <h2 className="text-base font-semibold text-primary mb-1">Completed Tasks</h2>
        <p className="text-xs text-muted mb-4">Activities recorded for this week</p>

        {tasks.length === 0 ? (
          <p className="text-xs text-muted py-4">No completed tasks logged.</p>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-xs font-medium text-muted uppercase">
                  <th className="py-2.5 px-4">Task Name</th>
                  <th className="py-2.5 px-4">Priority</th>
                  <th className="py-2.5 px-4">Progress</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Time (Actual/Plan)</th>
                  <th className="py-2.5 px-4">Deliverable</th>
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

      {/* Planned Next Week & Blockers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Planned next week */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <h2 className="text-base font-semibold text-primary mb-1">Planned for Next Week</h2>
          <p className="text-xs text-muted mb-4">Upcoming objectives</p>

          {nextTasks.length === 0 ? (
            <p className="text-xs text-muted py-2">No planned items listed.</p>
          ) : (
            <ul className="space-y-2 text-sm text-primary">
              {nextTasks.map((t, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Blockers */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <h2 className="text-base font-semibold text-primary mb-1">Blockers & Roadblocks</h2>
          <p className="text-xs text-muted mb-4">Friction points recorded</p>

          {blockers.length === 0 ? (
            <p className="text-xs text-muted py-2">No blockers reported.</p>
          ) : (
            <div className="space-y-2">
              {blockers.map((b, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-card text-sm border ${
                    b.is_key_issue
                      ? 'bg-red-50 border-red-200 text-red-900'
                      : 'bg-subsurface border-border text-primary'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{b.text}</span>
                    {b.is_key_issue && (
                      <span className="px-2 py-0.5 text-xs rounded font-medium bg-red-100 text-red-800 border border-red-300 whitespace-nowrap">
                        Key Issue
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Achievements & Notes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Achievements */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <h2 className="text-base font-semibold text-primary mb-1">Achievements & Highlights</h2>
          <p className="text-xs text-muted mb-4">Wins and deliverables</p>

          {achievements.length === 0 ? (
            <p className="text-xs text-muted py-2">No achievements recorded.</p>
          ) : (
            <div className="space-y-2">
              {achievements.map((a, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-card text-sm border ${
                    a.is_key_achievement
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-subsurface border-border text-primary'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{a.text}</span>
                    {a.is_key_achievement && (
                      <span className="px-2 py-0.5 text-xs rounded font-medium bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
                        Key Achievement
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* General Notes */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <h2 className="text-base font-semibold text-primary mb-1">General Notes</h2>
          <p className="text-xs text-muted mb-4">Sprint reflections and team notes</p>

          <p className="text-sm text-primary whitespace-pre-wrap">
            {content.notes || 'No additional notes provided.'}
          </p>
        </div>
      </div>

      {/* Review Comments History Audit Trail */}
      {comments.length > 0 && (
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-accent" />
            <h2 className="text-base font-semibold text-primary">Review Comments History</h2>
          </div>

          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="p-3.5 bg-subsurface border border-border rounded-card">
                <div className="flex items-center justify-between gap-2 text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <strong className="text-primary">{c.reviewer?.email || 'Manager'}</strong>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        c.action === 'approve'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {c.action === 'approve' ? 'Approved' : 'Changes Requested'}
                    </span>
                  </div>
                  <span className="text-muted">{new Date(c.created_at).toLocaleString()}</span>
                </div>
                {c.comment && <p className="text-sm text-primary mt-1.5">{c.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Version Snapshots History */}
      {versions.length > 0 && (
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-accent" />
            <h2 className="text-base font-semibold text-primary">Snapshot History</h2>
          </div>

          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v._id}
                className="flex items-center justify-between p-3 bg-subsurface border border-border rounded-card text-xs"
              >
                <div>
                  <strong className="text-primary">Version {v.version_number}</strong>
                  <span className="text-muted ml-2">
                    Snapshot captured upon change request
                  </span>
                </div>
                <div className="text-muted">{new Date(v.submitted_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
