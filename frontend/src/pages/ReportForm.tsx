import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  reportsApi,
  projectsApi,
  TaskCompletedItem,
  BlockerItem,
  AchievementItem,
  HoursByType,
  ReportContentPayload,
  ApiError,
} from '../api/client';
import { TaskRow } from '../components/TaskRow';
import { StatusBadge } from '../components/StatusBadge';
import {
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Save,
  Send,
} from 'lucide-react';

export const ReportForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(isEditMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Available projects
  const [projects, setProjects] = useState<any[]>([]);

  // Header state
  const [projectId, setProjectId] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [reportStatus, setReportStatus] = useState<string>('draft');
  const [currentComment, setCurrentComment] = useState<string | null>(null);

  // Content state
  const [tasks, setTasks] = useState<TaskCompletedItem[]>([]);
  const [tasksPlannedNextWeek, setTasksPlannedNextWeek] = useState<string[]>([]);
  const [blockers, setBlockers] = useState<BlockerItem[]>([]);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [hoursByType, setHoursByType] = useState<HoursByType>({
    development: 0,
    testing: 0,
    meetings: 0,
    documentation: 0,
  });
  const [notes, setNotes] = useState('');

  // Default week dates calculation (Monday to Sunday)
  useEffect(() => {
    if (!isEditMode) {
      const now = new Date();
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      const diffToMonday = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date.getFullYear(), date.getMonth(), diffToMonday);
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

      const formatYYYYMMDD = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dayStr}`;
      };

      setWeekStart(formatYYYYMMDD(monday));
      setWeekEnd(formatYYYYMMDD(sunday));
    }
  }, [isEditMode]);

  // Load projects list
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await projectsApi.listProjects({ limit: 100, active: 'true' });
        setProjects(res.data || []);
        if (res.data && res.data.length > 0 && !projectId && !isEditMode) {
          setProjectId(res.data[0].id);
        }
      } catch (err) {
        console.error('Failed to load projects', err);
      }
    }
    loadProjects();
  }, [isEditMode]);

  // If Edit mode, load existing report data
  useEffect(() => {
    if (!isEditMode || !id) return;

    async function loadReport() {
      setLoading(true);
      setError(null);
      try {
        const data = await reportsApi.getReportById(id as string);
        setProjectId(data.project_id);
        setWeekStart(data.week_start.split('T')[0]);
        setWeekEnd(data.week_end.split('T')[0]);
        setReportStatus(data.status);
        setCurrentComment(data.current_comment || null);

        if (data.content) {
          setTasks(data.content.tasks_completed || []);
          setTasksPlannedNextWeek(data.content.tasks_planned_next_week || []);
          setBlockers(data.content.blockers || []);
          setAchievements(data.content.achievements || []);
          setHoursByType(
            data.content.hours_by_type || {
              development: 0,
              testing: 0,
              meetings: 0,
              documentation: 0,
            }
          );
          setNotes(data.content.notes || '');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load report for editing.');
      } finally {
        setLoading(false);
      }
    }

    loadReport();
  }, [id, isEditMode]);

  // -----------------------------------------------------------------
  // Tasks handlers
  // -----------------------------------------------------------------
  const addTask = () => {
    setTasks((prev) => [
      ...prev,
      {
        task_name: '',
        priority: 'medium',
        planned_percent: 100,
        actual_percent: 0,
        status: 'in_progress',
        time_planned_hours: 0,
        time_spent_hours: 0,
        output_deliverable: '',
      },
    ]);
  };

  const updateTask = (index: number, updated: TaskCompletedItem) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? updated : t)));
  };

  const removeTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  // -----------------------------------------------------------------
  // Next week tasks handlers
  // -----------------------------------------------------------------
  const addPlannedTask = () => {
    setTasksPlannedNextWeek((prev) => [...prev, '']);
  };

  const updatePlannedTask = (index: number, text: string) => {
    setTasksPlannedNextWeek((prev) => prev.map((t, i) => (i === index ? text : t)));
  };

  const removePlannedTask = (index: number) => {
    setTasksPlannedNextWeek((prev) => prev.filter((_, i) => i !== index));
  };

  // -----------------------------------------------------------------
  // Blockers handlers (Single Key Issue validation)
  // -----------------------------------------------------------------
  const addBlocker = () => {
    setBlockers((prev) => [...prev, { text: '', is_key_issue: false }]);
  };

  const updateBlockerText = (index: number, text: string) => {
    setBlockers((prev) => prev.map((b, i) => (i === index ? { ...b, text } : b)));
  };

  /**
   * NOTE: Client-side validation enforces that at most ONE blocker has is_key_issue=true.
   * Selecting a blocker as key issue automatically unselects any other.
   * Server-side Mongoose schema validator is the authoritative security boundary.
   */
  const toggleKeyIssue = (index: number) => {
    setBlockers((prev) =>
      prev.map((b, i) => {
        if (i === index) {
          return { ...b, is_key_issue: !b.is_key_issue };
        }
        // Uncheck others if this one is being toggled to true
        return { ...b, is_key_issue: false };
      })
    );
  };

  const removeBlocker = (index: number) => {
    setBlockers((prev) => prev.filter((_, i) => i !== index));
  };

  // -----------------------------------------------------------------
  // Achievements handlers (Single Key Achievement validation)
  // -----------------------------------------------------------------
  const addAchievement = () => {
    setAchievements((prev) => [...prev, { text: '', is_key_achievement: false }]);
  };

  const updateAchievementText = (index: number, text: string) => {
    setAchievements((prev) => prev.map((a, i) => (i === index ? { ...a, text } : a)));
  };

  /**
   * NOTE: Client-side validation enforces that at most ONE achievement has is_key_achievement=true.
   * Server-side Mongoose schema validator is the authoritative security boundary.
   */
  const toggleKeyAchievement = (index: number) => {
    setAchievements((prev) =>
      prev.map((a, i) => {
        if (i === index) {
          return { ...a, is_key_achievement: !a.is_key_achievement };
        }
        return { ...a, is_key_achievement: false };
      })
    );
  };

  const removeAchievement = (index: number) => {
    setAchievements((prev) => prev.filter((_, i) => i !== index));
  };

  // -----------------------------------------------------------------
  // Validation and Submission
  // -----------------------------------------------------------------
  const validateForm = (): boolean => {
    if (!projectId) {
      setError('Please select a project for this report.');
      return false;
    }
    if (!weekStart || !weekEnd) {
      setError('Please specify both week start and week end dates.');
      return false;
    }

    // Client-side rule: At most 1 key issue
    const keyIssueCount = blockers.filter((b) => b.is_key_issue).length;
    if (keyIssueCount > 1) {
      setError('At most one blocker can be flagged as Key Issue.');
      return false;
    }

    // Client-side rule: At most 1 key achievement
    const keyAchievementCount = achievements.filter((a) => a.is_key_achievement).length;
    if (keyAchievementCount > 1) {
      setError('At most one achievement can be flagged as Key Achievement.');
      return false;
    }

    return true;
  };

  const buildPayload = (): ReportContentPayload => ({
    tasks_completed: tasks.filter((t) => t.task_name.trim() !== ''),
    tasks_planned_next_week: tasksPlannedNextWeek.filter((t) => t.trim() !== ''),
    blockers: blockers.filter((b) => b.text.trim() !== ''),
    achievements: achievements.filter((a) => a.text.trim() !== ''),
    hours_by_type: hoursByType,
    notes: notes.trim() || undefined,
  });

  const handleSave = async (shouldSubmit: boolean) => {
    setError(null);
    setSuccessMsg(null);

    if (!validateForm()) return;

    setSubmitting(true);

    try {
      let currentReportId = id;

      if (!isEditMode) {
        // 1. Create report header
        const res = await reportsApi.createReport({
          project_id: projectId,
          week_start: weekStart,
          week_end: weekEnd,
        });
        currentReportId = res.report.id;
      }

      // 2. Update content
      const contentPayload = buildPayload();
      await reportsApi.updateReportContent(currentReportId as string, contentPayload);

      // 3. Submit if requested
      if (shouldSubmit) {
        await reportsApi.submitReport(currentReportId as string);
        navigate(`/reports/${currentReportId}`, { replace: true });
        return;
      }

      setSuccessMsg('Report draft saved successfully.');
      if (!isEditMode) {
        navigate(`/reports/${currentReportId}/edit`, { replace: true });
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while saving.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-muted">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        Loading report details...
      </div>
    );
  }

  const isLocked = isEditMode && reportStatus !== 'draft' && reportStatus !== 'needs_correction';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Back Link & Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Reports</span>
        </Link>

        {isEditMode && <StatusBadge status={reportStatus} />}
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-primary">
          {isEditMode ? 'Edit Weekly Report' : 'Create Weekly Report'}
        </h1>
        <p className="text-sm text-muted mt-1">
          {isEditMode
            ? 'Update your tasks, deliverables, and progress for this week'
            : 'Initialize a new weekly status report for your project'}
        </p>
      </div>

      {/* Needs Correction Manager Comment Alert */}
      {reportStatus === 'needs_correction' && currentComment && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-card">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-amber-900">
                Changes Requested by Manager
              </h4>
              <p className="text-sm text-amber-800 mt-1 whitespace-pre-wrap">
                {currentComment}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Locked status banner */}
      {isLocked && (
        <div className="mb-6 p-4 bg-slate-100 border border-border rounded-card text-sm text-muted">
          This report is currently in <strong>{reportStatus}</strong> status and is read-only.
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-card flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-card flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave(false);
        }}
        className="space-y-6"
      >
        {/* Section 1: Header (Project & Dates) */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <h2 className="text-base font-semibold text-primary mb-4">Report Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary mb-1.5">
                Project <span className="text-red-500">*</span>
              </label>
              <select
                value={projectId}
                disabled={isEditMode || isLocked}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent disabled:bg-subsurface text-primary"
                required
              >
                <option value="">Select Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-primary mb-1.5">
                Week Start <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={weekStart}
                disabled={isEditMode || isLocked}
                onChange={(e) => {
                  const val = e.target.value;
                  setWeekStart(val);
                  if (val) {
                    const [y, m, d] = val.split('-').map(Number);
                    if (y && m && d) {
                      const startDate = new Date(y, m - 1, d);
                      const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6);
                      const ey = endDate.getFullYear();
                      const em = String(endDate.getMonth() + 1).padStart(2, '0');
                      const ed = String(endDate.getDate()).padStart(2, '0');
                      setWeekEnd(`${ey}-${em}-${ed}`);
                    }
                  }
                }}
                className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent disabled:bg-subsurface text-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-primary mb-1.5">
                Week End <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={weekEnd}
                disabled={isEditMode || isLocked}
                onChange={(e) => setWeekEnd(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent disabled:bg-subsurface text-primary"
                required
              />
            </div>
          </div>
        </div>

        {/* Section 2: Tasks Completed */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-primary">Tasks Completed This Week</h2>
              <p className="text-xs text-muted">Log activities, completion percentages, and spent hours</p>
            </div>
            {!isLocked && (
              <button
                type="button"
                onClick={addTask}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent bg-accent-subtle hover:bg-blue-100 rounded-card transition-colors border border-accent-border"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Task
              </button>
            )}
          </div>

          {tasks.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-border rounded-card text-xs text-muted">
              No tasks added yet. Click "Add Task" to record your progress.
            </div>
          ) : (
            <div>
              {tasks.map((task, idx) => (
                <TaskRow
                  key={idx}
                  index={idx}
                  task={task}
                  onChange={updateTask}
                  onRemove={removeTask}
                  isReadOnly={isLocked}
                />
              ))}
            </div>
          )}
        </div>

        {/* Section 3: Planned Next Week */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-primary">Planned for Next Week</h2>
              <p className="text-xs text-muted">Key objectives and targets for the upcoming sprint</p>
            </div>
            {!isLocked && (
              <button
                type="button"
                onClick={addPlannedTask}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent bg-accent-subtle hover:bg-blue-100 rounded-card transition-colors border border-accent-border"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Objective
              </button>
            )}
          </div>

          {tasksPlannedNextWeek.length === 0 ? (
            <div className="py-6 text-center border border-dashed border-border rounded-card text-xs text-muted">
              No upcoming items specified.
            </div>
          ) : (
            <div className="space-y-2">
              {tasksPlannedNextWeek.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled={isLocked}
                    value={item}
                    onChange={(e) => updatePlannedTask(idx, e.target.value)}
                    placeholder="e.g. Conduct end-to-end load testing"
                    className="flex-1 px-3.5 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
                  />
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => removePlannedTask(idx)}
                      className="p-2 text-muted hover:text-red-600 rounded-card hover:bg-subsurface transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 4: Blockers & Key Issues */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-primary">Blockers & Roadblocks</h2>
              <p className="text-xs text-muted">
                Document friction or blockers (at most ONE can be flagged as Key Issue)
              </p>
            </div>
            {!isLocked && (
              <button
                type="button"
                onClick={addBlocker}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent bg-accent-subtle hover:bg-blue-100 rounded-card transition-colors border border-accent-border"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Blocker
              </button>
            )}
          </div>

          {blockers.length === 0 ? (
            <div className="py-6 text-center border border-dashed border-border rounded-card text-xs text-muted">
              No blockers reported for this week.
            </div>
          ) : (
            <div className="space-y-3">
              {blockers.map((b, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 border rounded-card space-y-2 transition-colors ${
                    b.is_key_issue ? 'border-red-300 bg-red-50/50' : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      disabled={isLocked}
                      value={b.text}
                      onChange={(e) => updateBlockerText(idx, e.target.value)}
                      placeholder="Describe the blocker or dependency..."
                      className="flex-1 px-3 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
                    />
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => removeBlocker(idx)}
                        className="p-2 text-muted hover:text-red-600 rounded-card hover:bg-subsurface transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-primary">
                    <input
                      type="checkbox"
                      disabled={isLocked}
                      checked={b.is_key_issue}
                      onChange={() => toggleKeyIssue(idx)}
                      className="rounded border-border text-red-600 focus:ring-0"
                    />
                    <span className={b.is_key_issue ? 'text-red-700 font-semibold' : 'text-muted'}>
                      Flag as Key Issue (Max 1 across report)
                    </span>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 5: Achievements */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-primary">Achievements & Highlights</h2>
              <p className="text-xs text-muted">
                Key wins and milestones (at most ONE can be flagged as Key Achievement)
              </p>
            </div>
            {!isLocked && (
              <button
                type="button"
                onClick={addAchievement}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent bg-accent-subtle hover:bg-blue-100 rounded-card transition-colors border border-accent-border"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Achievement
              </button>
            )}
          </div>

          {achievements.length === 0 ? (
            <div className="py-6 text-center border border-dashed border-border rounded-card text-xs text-muted">
              No milestones recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {achievements.map((a, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 border rounded-card space-y-2 transition-colors ${
                    a.is_key_achievement ? 'border-emerald-300 bg-emerald-50/50' : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      disabled={isLocked}
                      value={a.text}
                      onChange={(e) => updateAchievementText(idx, e.target.value)}
                      placeholder="Describe the milestone or achievement..."
                      className="flex-1 px-3 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
                    />
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => removeAchievement(idx)}
                        className="p-2 text-muted hover:text-red-600 rounded-card hover:bg-subsurface transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-primary">
                    <input
                      type="checkbox"
                      disabled={isLocked}
                      checked={a.is_key_achievement}
                      onChange={() => toggleKeyAchievement(idx)}
                      className="rounded border-border text-emerald-600 focus:ring-0"
                    />
                    <span
                      className={a.is_key_achievement ? 'text-emerald-700 font-semibold' : 'text-muted'}
                    >
                      Flag as Key Achievement (Max 1 across report)
                    </span>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 6: Hours by Activity Type */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <h2 className="text-base font-semibold text-primary mb-1">Time Allocation (Hours)</h2>
          <p className="text-xs text-muted mb-4">Estimated hours distributed by category</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary mb-1.5">Development</label>
              <input
                type="number"
                min="0"
                step="0.5"
                disabled={isLocked}
                value={hoursByType.development || 0}
                onChange={(e) =>
                  setHoursByType((prev) => ({ ...prev, development: Number(e.target.value) }))
                }
                className="w-full px-3.5 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-primary mb-1.5">Testing</label>
              <input
                type="number"
                min="0"
                step="0.5"
                disabled={isLocked}
                value={hoursByType.testing || 0}
                onChange={(e) =>
                  setHoursByType((prev) => ({ ...prev, testing: Number(e.target.value) }))
                }
                className="w-full px-3.5 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-primary mb-1.5">Meetings</label>
              <input
                type="number"
                min="0"
                step="0.5"
                disabled={isLocked}
                value={hoursByType.meetings || 0}
                onChange={(e) =>
                  setHoursByType((prev) => ({ ...prev, meetings: Number(e.target.value) }))
                }
                className="w-full px-3.5 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-primary mb-1.5">Documentation</label>
              <input
                type="number"
                min="0"
                step="0.5"
                disabled={isLocked}
                value={hoursByType.documentation || 0}
                onChange={(e) =>
                  setHoursByType((prev) => ({ ...prev, documentation: Number(e.target.value) }))
                }
                className="w-full px-3.5 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
              />
            </div>
          </div>
        </div>

        {/* Section 7: Notes */}
        <div className="bg-surface border border-border rounded-card p-6 shadow-sm">
          <label className="block text-base font-semibold text-primary mb-1">General Notes</label>
          <p className="text-xs text-muted mb-3">Additional comments, context, or shout-outs</p>
          <textarea
            rows={3}
            disabled={isLocked}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any other updates for the team..."
            className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent text-primary"
          />
        </div>

        {/* Action Buttons */}
        {!isLocked && (
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSave(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-surface hover:bg-subsurface border border-border text-primary text-sm font-medium rounded-card transition-colors shadow-sm disabled:opacity-60"
            >
              <Save className="w-4 h-4 text-muted" />
              <span>Save Draft</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSave(true)}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-card transition-colors shadow-sm disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Submitting...' : 'Submit Report'}</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
