import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usersApi } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import {
  ArrowLeft,
  User as UserIcon,
  CheckCircle,
  Clock,
  CheckSquare,
  FileText,
  Calendar,
} from 'lucide-react';

export const MemberProfile: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      if (!userId) return;
      setLoading(true);
      try {
        const data = await usersApi.getUserStats(userId);
        setProfile(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load member profile.');
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [userId]);

  if (loading) {
    return (
      <div className="py-24 text-center text-sm text-muted">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        Loading member profile...
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center">
        <div className="p-6 bg-red-50 border border-red-200 rounded-card text-red-700 text-sm mb-4">
          {error || 'Member not found.'}
        </div>
        <Link
          to="/manager/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
    );
  }

  const { user, stats, reports } = profile;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <Link
          to="/manager/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      {/* Member Header Card */}
      <div className="p-6 bg-surface border border-border rounded-card shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-subsurface border border-border flex items-center justify-center text-muted">
            <UserIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-primary">{user.email}</h1>
            <p className="text-xs text-muted mt-0.5">
              Role: <strong className="capitalize text-primary">{user.role.replace('_', ' ')}</strong> • Joined {formatDate(user.created_at)}
            </p>
          </div>
        </div>

        <div>
          <span
            className={`px-2.5 py-1 text-xs rounded-full font-medium border ${
              user.active
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {user.active ? 'Active Account' : 'Deactivated'}
          </span>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-5 bg-surface border border-border rounded-card shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase">Total Reports</span>
            <FileText className="w-4 h-4 text-accent" />
          </div>
          <div className="text-2xl font-semibold text-primary mt-2">{stats.total_reports}</div>
          <div className="text-xs text-muted mt-1">Submitted across projects</div>
        </div>

        <div className="p-5 bg-surface border border-border rounded-card shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase">Approval Rate</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-semibold text-primary mt-2">{stats.approval_rate}%</div>
          <div className="text-xs text-muted mt-1">{stats.approved} approved reports</div>
        </div>

        <div className="p-5 bg-surface border border-border rounded-card shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase">Hours Logged</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-semibold text-primary mt-2">{stats.total_hours}h</div>
          <div className="text-xs text-muted mt-1">Total effort logged</div>
        </div>

        <div className="p-5 bg-surface border border-border rounded-card shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase">Tasks Finished</span>
            <CheckSquare className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-semibold text-primary mt-2">{stats.tasks_completed}</div>
          <div className="text-xs text-muted mt-1">Completed task items</div>
        </div>
      </div>

      {/* Report History Table */}
      <div className="p-6 bg-surface border border-border rounded-card shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-primary">Full Report History</h2>
          <p className="text-xs text-muted">All historical weekly submissions for this team member</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-subsurface text-xs font-medium text-muted uppercase">
                <th className="py-2.5 px-3">Week Period</th>
                <th className="py-2.5 px-3">Project</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs text-muted">
                    No reports submitted yet by this member.
                  </td>
                </tr>
              ) : (
                reports.map((r: any) => (
                  <tr key={r.id} className="hover:bg-canvas transition-colors">
                    <td className="py-3 px-3 font-medium text-primary text-xs">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted" />
                        {formatDate(r.week_start)} — {formatDate(r.week_end)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs text-muted">{r.project?.name || 'General'}</td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        to={`/manager/review/${r.id}`}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
