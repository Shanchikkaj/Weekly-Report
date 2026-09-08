import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  dashboardApi,
  projectsApi,
  DashboardSummary,
  DashboardTrends,
} from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  Users,
  Eye,
  Columns,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { AiAssistantDrawer } from '../components/AiAssistantDrawer';

export const ManagerDashboard: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trends, setTrends] = useState<DashboardTrends | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAiOpen, setIsAiOpen] = useState(false);

  // Filters for reports list
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  // Side-by-side view state
  const [showSideBySide, setShowSideBySide] = useState(false);
  const [sideBySideSection, setSideBySideSection] = useState<'blockers' | 'achievements' | 'tasks_completed' | 'tasks_planned_next_week'>('blockers');
  const [selectedSideBySideWeek, setSelectedSideBySideWeek] = useState<string>('');
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [sideBySideData, setSideBySideData] = useState<any>(null);
  const [loadingSideBySide, setLoadingSideBySide] = useState(false);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [sumRes, trendsRes, repRes, projRes] = await Promise.all([
        dashboardApi.getSummary(),
        dashboardApi.getTrends(),
        dashboardApi.getReports({ limit: 15 }),
        projectsApi.listProjects({ limit: 100 }),
      ]);
      setSummary(sumRes);
      setTrends(trendsRes);
      setReports(repRes.data || []);
      setProjects(projRes.data || []);
    } catch (err) {
      console.error('Failed to load dashboard metrics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadSideBySide = async (weekToLoad?: string, sectionToLoad?: 'blockers' | 'achievements' | 'tasks_completed' | 'tasks_planned_next_week') => {
    setLoadingSideBySide(true);
    try {
      const activeWeek = weekToLoad || selectedSideBySideWeek || undefined;
      const activeSection = sectionToLoad || sideBySideSection;
      const res = await dashboardApi.getSideBySide(activeWeek, activeSection);
      setSideBySideData(res);
      if (res.available_weeks && res.available_weeks.length > 0) {
        setAvailableWeeks(res.available_weeks);
      }
      if (!selectedSideBySideWeek && res.week_start) {
        setSelectedSideBySideWeek(res.week_start);
      }
    } catch (err) {
      console.error('Failed to load side-by-side data', err);
    } finally {
      setLoadingSideBySide(false);
    }
  };

  useEffect(() => {
    if (showSideBySide) {
      loadSideBySide(selectedSideBySideWeek, sideBySideSection);
    }
  }, [showSideBySide, selectedSideBySideWeek, sideBySideSection]);

  const filteredReports = reports.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (projectFilter && r.project_id !== projectFilter) return false;
    return true;
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatWeekOption = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[parseInt(month, 10) - 1];
    return `${monthName} ${parseInt(day, 10)}, ${year}`;
  };

  if (loading && !summary) {
    return (
      <div className="py-24 text-center text-sm text-muted">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        Loading team analytics dashboard...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Team Dashboard</h1>
          <p className="text-sm text-muted mt-0.5">
            Weekly progress overview, review queues, and team-wide productivity metrics
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAiOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-card bg-accent text-white hover:bg-accent/90 transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-white" />
            <span>Ask AI Assistant</span>
          </button>

          <button
            onClick={() => setShowSideBySide(!showSideBySide)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-card border transition-colors shadow-sm ${
              showSideBySide
                ? 'bg-accent-subtle text-accent border-accent-border'
                : 'bg-surface hover:bg-subsurface text-primary border-border'
            }`}
          >
            <Columns className="w-4 h-4 text-accent" />
            <span>{showSideBySide ? 'Hide Cross-Team View' : 'Side-by-Side Inspection'}</span>
          </button>

          <button
            onClick={loadDashboardData}
            className="p-2 border border-border rounded-card bg-surface hover:bg-subsurface text-muted hover:text-primary transition-colors"
            title="Refresh metrics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-6 bg-surface border border-border rounded-card shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase tracking-wider">
                Submitted This Week
              </span>
              <CheckCircle className="w-4 h-4 text-accent" />
            </div>
            <div className="text-2xl font-semibold text-primary mt-2">
              {summary.total_submitted_this_week}
            </div>
            <div className="text-xs text-muted mt-1">
              Out of {summary.active_members_count} active team members
            </div>
          </div>

          <div className="p-6 bg-surface border border-border rounded-card shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase tracking-wider">
                Compliance Rate
              </span>
              <Users className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-semibold text-primary mt-2">
              {summary.compliance_rate}%
            </div>
            <div className="w-full bg-subsurface h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-accent h-1.5 rounded-full"
                style={{ width: `${summary.compliance_rate}%` }}
              />
            </div>
          </div>

          <div className="p-6 bg-surface border border-border rounded-card shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase tracking-wider">
                Needs Correction
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-semibold text-amber-900 mt-2">
              {summary.needs_correction_count}
            </div>
            <div className="text-xs text-muted mt-1">
              Returned reports awaiting author updates
            </div>
          </div>

          <div className="p-6 bg-surface border border-border rounded-card shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase tracking-wider">
                Open Blockers
              </span>
              <Clock className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-2xl font-semibold text-red-900 mt-2">
              {summary.open_blockers_count}
            </div>
            <div className="text-xs text-muted mt-1">Active impediments across ongoing reports</div>
          </div>
        </div>
      )}

      {/* Bonus Feature: Cross-Team Side-by-Side View */}
      {showSideBySide && (
        <div className="p-6 bg-surface border border-accent-border rounded-card shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="text-base font-semibold text-primary flex items-center gap-2">
                <Columns className="w-4 h-4 text-accent" />
                Cross-Team Section Comparison (Week of {selectedSideBySideWeek || sideBySideData?.week_start || summary?.week_start})
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Inspect a single aspect across all team members in a single view
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted">Week:</span>
                <select
                  id="side-by-side-week-select"
                  value={selectedSideBySideWeek || sideBySideData?.week_start || ''}
                  onChange={(e) => setSelectedSideBySideWeek(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-surface border border-border rounded-input text-primary font-medium focus:outline-none focus:border-accent"
                >
                  {(availableWeeks.length > 0 ? availableWeeks : (sideBySideData?.available_weeks || [])).map((week: string) => (
                    <option key={week} value={week}>
                      {formatWeekOption(week)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted">Section:</span>
                <select
                  id="side-by-side-section-select"
                  value={sideBySideSection}
                  onChange={(e) => setSideBySideSection(e.target.value as any)}
                  className="px-3 py-1.5 text-xs bg-surface border border-border rounded-input text-primary font-medium focus:outline-none focus:border-accent"
                >
                  <option value="blockers">Blockers & Roadblocks</option>
                  <option value="achievements">Key Achievements</option>
                  <option value="tasks_completed">Tasks Completed</option>
                  <option value="tasks_planned_next_week">Planned for Next Week</option>
                </select>
              </div>
            </div>
          </div>

          {loadingSideBySide ? (
            <div className="py-8 text-center text-xs text-muted">Loading section details...</div>
          ) : !sideBySideData || sideBySideData.members.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">
              No reports submitted for the week of {selectedSideBySideWeek || sideBySideData?.week_start || summary?.week_start}.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sideBySideData.members.map((m: any) => (
                <div key={m.report_id} className="p-4 bg-subsurface border border-border rounded-card space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <div>
                      <Link
                        to={`/manager/members/${m.user_id}`}
                        className="text-xs font-semibold text-primary hover:text-accent"
                      >
                        {m.name ? `${m.name} (${m.email})` : m.email}
                      </Link>
                      <div className="text-xs text-muted">{m.project_name}</div>
                    </div>
                    <StatusBadge status={m.status} />
                  </div>

                  <div className="text-xs text-primary space-y-1.5">
                    {sideBySideSection === 'blockers' && (
                      m.data.length === 0 ? (
                        <span className="text-muted italic">No blockers logged.</span>
                      ) : (
                        m.data.map((b: any, idx: number) => (
                          <div
                            key={idx}
                            className={`p-2 rounded border ${
                              b.is_key_issue
                                ? 'bg-red-50 border-red-200 text-red-900 font-medium'
                                : 'bg-surface border-border text-primary'
                            }`}
                          >
                            {b.is_key_issue && <span className="text-red-700 font-bold mr-1">[Key Issue]</span>}
                            {b.text}
                          </div>
                        ))
                      )
                    )}

                    {sideBySideSection === 'achievements' && (
                      m.data.length === 0 ? (
                        <span className="text-muted italic">No achievements logged.</span>
                      ) : (
                        m.data.map((a: any, idx: number) => (
                          <div
                            key={idx}
                            className={`p-2 rounded border ${
                              a.is_key_achievement
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-medium'
                                : 'bg-surface border-border text-primary'
                            }`}
                          >
                            {a.is_key_achievement && <span className="text-emerald-700 font-bold mr-1">[Key Win]</span>}
                            {a.text}
                          </div>
                        ))
                      )
                    )}

                    {sideBySideSection === 'tasks_completed' && (
                      m.data.length === 0 ? (
                        <span className="text-muted italic">No tasks logged.</span>
                      ) : (
                        m.data.map((t: any, idx: number) => (
                          <div key={idx} className="p-2 bg-surface border border-border rounded flex items-center justify-between">
                            <span className="truncate max-w-[180px]">{t.task_name}</span>
                            <span className="text-muted font-medium">{t.actual_percent}%</span>
                          </div>
                        ))
                      )
                    )}

                    {sideBySideSection === 'tasks_planned_next_week' && (
                      m.data.length === 0 ? (
                        <span className="text-muted italic">No upcoming tasks logged.</span>
                      ) : (
                        <ul className="list-disc pl-4 space-y-1">
                          {m.data.map((p: any, idx: number) => (
                            <li key={idx}>{p}</li>
                          ))}
                        </ul>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Visual Analytics Charts Grid (Recharts) */}
      {trends && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Tasks Completed Trend */}
          <div className="p-6 bg-surface border border-border rounded-card shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-semibold text-primary">Tasks Completed Trend</h3>
              <p className="text-xs text-muted">Weekly task velocity over time</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends.tasksTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EB" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#5F6975' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#5F6975' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', borderColor: '#E4E7EB', fontSize: '12px' }} />
                  <Area
                    type="monotone"
                    dataKey="tasks_completed"
                    name="Completed Tasks"
                    stroke="#2563EB"
                    fill="#EFF6FF"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Status Breakdown by Member */}
          <div className="p-6 bg-surface border border-border rounded-card shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-semibold text-primary">Report Status by Member</h3>
              <p className="text-xs text-muted">Submission and approval distribution</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.memberStatus}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EB" />
                  <XAxis dataKey="member" tick={{ fontSize: 11, fill: '#5F6975' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#5F6975' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', borderColor: '#E4E7EB', fontSize: '12px' }} />
                  <Bar dataKey="approved" name="Approved" fill="#027A48" stackId="a" />
                  <Bar dataKey="submitted" name="Submitted" fill="#2563EB" stackId="a" />
                  <Bar dataKey="needs_correction" name="Needs Correction" fill="#B42318" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Workload by Project */}
          <div className="p-6 bg-surface border border-border rounded-card shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-semibold text-primary">Workload by Project</h3>
              <p className="text-xs text-muted">Total hours distributed across active initiatives</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.workloadByProject} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EB" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#5F6975' }} />
                  <YAxis
                    dataKey="project"
                    type="category"
                    width={175}
                    tick={{ fontSize: 11, fill: '#5F6975' }}
                    interval={0}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', borderColor: '#E4E7EB', fontSize: '12px' }}
                    formatter={(value: any) => [`${value} hrs`, 'Total Hours']}
                  />
                  <Bar dataKey="total_hours" name="Total Hours" fill="#2563EB" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 4: Time Spent by Task Category */}
          <div className="p-6 bg-surface border border-border rounded-card shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-semibold text-primary">Time Spent by Task Type</h3>
              <p className="text-xs text-muted">Aggregate hours logged team-wide</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.timeSpentByCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EB" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#5F6975' }} />
                  <YAxis dataKey="category" type="category" tick={{ fontSize: 11, fill: '#5F6975' }} width={90} />
                  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', borderColor: '#E4E7EB', fontSize: '12px' }} />
                  <Bar dataKey="hours" name="Logged Hours" fill="#2563EB" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity Feed & Filterable Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Filterable Report Queue */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-card shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-primary">Team Report Review Queue</h3>
              <p className="text-xs text-muted">Review, approve, or request revisions</p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-surface border border-border rounded-input text-primary"
              >
                <option value="">All Statuses</option>
                <option value="submitted">Submitted (Ready for Review)</option>
                <option value="needs_correction">Needs Correction</option>
                <option value="approved">Approved</option>
                <option value="draft">Draft</option>
              </select>

              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-surface border border-border rounded-input text-primary"
              >
                <option value="">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-subsurface text-xs font-medium text-muted uppercase">
                  <th className="py-2.5 px-3">Team Member</th>
                  <th className="py-2.5 px-3">Project</th>
                  <th className="py-2.5 px-3">Week</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-muted">
                      No reports match the active filters.
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((r) => (
                    <tr key={r.id} className="hover:bg-canvas transition-colors">
                      <td className="py-3 px-3 font-medium text-primary">
                        <Link
                          to={`/manager/members/${r.user.id}`}
                          className="hover:text-accent text-xs"
                        >
                          {r.user.email}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-xs text-muted">{r.project?.name || 'General'}</td>
                      <td className="py-3 px-3 text-xs text-muted whitespace-nowrap">
                        {formatDate(r.week_start)} — {formatDate(r.week_end)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Link
                          to={`/manager/review/${r.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-card transition-colors shadow-sm"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Review</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Recent Review Activity Feed */}
        <div className="bg-surface border border-border rounded-card shadow-sm p-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-primary">Recent Review Activity</h3>
            <p className="text-xs text-muted">Audit trail of managerial decisions</p>
          </div>

          <div className="space-y-3">
            {!trends || trends.recentActivity.length === 0 ? (
              <p className="text-xs text-muted py-6 text-center">No recent review actions logged.</p>
            ) : (
              trends.recentActivity.map((act) => (
                <div key={act.id} className="p-3 bg-subsurface border border-border rounded-card text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-semibold capitalize px-1.5 py-0.5 rounded text-[11px] ${
                        act.type === 'approve'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {act.type === 'approve' ? 'Approved' : 'Changes Requested'}
                    </span>
                    <span className="text-muted">{new Date(act.timestamp).toLocaleDateString()}</span>
                  </div>
                  <div className="text-primary font-medium mt-1">
                    {act.author} ({act.project})
                  </div>
                  {act.comment && <p className="text-muted italic">"{act.comment}"</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <AiAssistantDrawer isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} />
    </div>
  );
};

