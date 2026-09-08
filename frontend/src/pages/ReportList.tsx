import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { reportsApi, ReportHeader } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { PlusCircle, FileText, ChevronLeft, ChevronRight, AlertCircle, User as UserIcon } from 'lucide-react';

export const ReportList: React.FC = () => {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';

  const [reports, setReports] = useState<ReportHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchReports = async (pageNumber: number, status: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportsApi.listReports({
        page: pageNumber,
        limit: 10,
        status: status || undefined,
      });
      setReports(res.data);
      setTotalPages(res.meta.totalPages);
    } catch (err: any) {
      setError(err.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports(page, statusFilter);
  }, [page, statusFilter]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-primary">
            {isManager ? 'Team Weekly Reports' : 'My Weekly Reports'}
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {isManager
              ? 'Browse, filter, and inspect weekly status reports across all team members'
              : 'Track and manage your submitted and draft weekly progress reports'}
          </p>
        </div>

        {!isManager && (
          <Link
            to="/reports/new"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-card transition-colors shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Report</span>
          </Link>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs font-medium text-muted">Status:</label>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 text-xs bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="needs_correction">Needs Correction</option>
          <option value="approved">Approved</option>
        </select>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-card flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Reports Table Container */}
      <div className="bg-surface border border-border rounded-card overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading reports...
          </div>
        ) : reports.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-subsurface text-muted flex items-center justify-center mx-auto mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-medium text-primary">No weekly reports found</h3>
            <p className="text-sm text-muted mt-1 max-w-sm mx-auto">
              {statusFilter
                ? `No reports currently match the "${statusFilter}" filter.`
                : isManager
                ? 'No reports have been submitted by the team yet.'
                : "You haven't created any weekly reports yet. Start by generating a draft."}
            </p>
            {!statusFilter && !isManager && (
              <Link
                to="/reports/new"
                className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-card transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Create Draft Report</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-subsurface text-xs font-medium text-muted uppercase">
                  {isManager && <th className="py-3 px-4">Team Member</th>}
                  <th className="py-3 px-4">Week Period</th>
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {reports.map((report) => {
                  const isEditable = (!isManager) && (report.status === 'draft' || report.status === 'needs_correction');
                  const memberName = report.user?.email ? report.user.email.split('@')[0] : 'Team Member';

                  return (
                    <tr key={report.id} className="hover:bg-canvas transition-colors">
                      {isManager && (
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-subsurface border border-border flex items-center justify-center text-muted text-xs">
                              <UserIcon className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <div className="font-medium text-primary text-xs">{memberName}</div>
                              <div className="text-[11px] text-muted">{report.user?.email}</div>
                            </div>
                          </div>
                        </td>
                      )}
                      <td className="py-3 px-4 font-medium text-primary whitespace-nowrap">
                        <Link
                          to={isManager ? `/manager/review/${report.id}` : `/reports/${report.id}`}
                          className="hover:text-accent"
                        >
                          {formatDate(report.week_start)} — {formatDate(report.week_end)}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-muted whitespace-nowrap">
                        {report.project?.name || 'General'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge status={report.status} />
                      </td>
                      <td className="py-3 px-4 text-muted whitespace-nowrap text-xs">
                        {formatDate(report.updated_at || report.created_at)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        {isManager ? (
                          <Link
                            to={`/manager/review/${report.id}`}
                            className="text-xs font-medium text-accent hover:underline px-2.5 py-1 rounded bg-accent/10 border border-accent/20 transition-colors"
                          >
                            Review & Inspect
                          </Link>
                        ) : (
                          <>
                            <Link
                              to={`/reports/${report.id}`}
                              className="text-xs font-medium text-muted hover:text-primary px-2 py-1 rounded hover:bg-subsurface transition-colors"
                            >
                              View
                            </Link>
                            {isEditable && (
                              <Link
                                to={`/reports/${report.id}/edit`}
                                className="text-xs font-medium text-accent hover:underline px-2 py-1 rounded hover:bg-accent-subtle transition-colors"
                              >
                                Edit
                              </Link>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="py-3 px-4 bg-surface border-t border-border flex items-center justify-between text-xs text-muted">
            <div>
              Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 border border-border rounded-card hover:bg-subsurface disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 border border-border rounded-card hover:bg-subsurface disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
