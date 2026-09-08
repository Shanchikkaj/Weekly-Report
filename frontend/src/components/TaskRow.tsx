import React from 'react';
import { TaskCompletedItem } from '../api/client';
import { Trash2 } from 'lucide-react';

interface TaskRowProps {
  index: number;
  task: TaskCompletedItem;
  onChange: (index: number, updated: TaskCompletedItem) => void;
  onRemove: (index: number) => void;
  isReadOnly?: boolean;
}

export const TaskRow: React.FC<TaskRowProps> = ({
  index,
  task,
  onChange,
  onRemove,
  isReadOnly = false,
}) => {
  const updateField = (field: keyof TaskCompletedItem, value: any) => {
    onChange(index, {
      ...task,
      [field]: value,
    });
  };

  if (isReadOnly) {
    return (
      <tr className="border-b border-border text-sm hover:bg-canvas">
        <td className="py-3 px-4 font-medium text-primary">{task.task_name || 'Untitled task'}</td>
        <td className="py-3 px-4 capitalize">
          <span
            className={`px-2 py-0.5 text-xs rounded-badge font-medium ${
              task.priority === 'high'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : task.priority === 'medium'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-slate-50 text-slate-700 border border-slate-200'
            }`}
          >
            {task.priority}
          </span>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <div className="w-16 bg-subsurface rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-accent h-1.5 rounded-full"
                style={{ width: `${Math.min(100, task.actual_percent || 0)}%` }}
              />
            </div>
            <span className="text-xs text-muted">
              {task.actual_percent}% / {task.planned_percent}%
            </span>
          </div>
        </td>
        <td className="py-3 px-4 capitalize">
          <span className="text-xs text-primary font-medium">
            {task.status.replace('_', ' ')}
          </span>
        </td>
        <td className="py-3 px-4 text-xs text-muted">
          {task.time_spent_hours}h / {task.time_planned_hours}h
        </td>
        <td className="py-3 px-4 text-xs text-muted max-w-xs truncate">
          {task.output_deliverable || '—'}
        </td>
      </tr>
    );
  }

  return (
    <div className="p-4 bg-surface border border-border rounded-card mb-3 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-primary mb-1">
            Task Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={task.task_name}
            onChange={(e) => updateField('task_name', e.target.value)}
            placeholder="e.g. Implement user authentication endpoints"
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent"
            required
          />
        </div>

        <button
          type="button"
          onClick={() => onRemove(index)}
          className="mt-6 text-muted hover:text-red-600 p-1.5 rounded-card hover:bg-subsurface transition-colors"
          title="Remove Task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-primary mb-1">Priority</label>
          <select
            value={task.priority}
            onChange={(e) => updateField('priority', e.target.value as any)}
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-primary mb-1">Status</label>
          <select
            value={task.status}
            onChange={(e) => updateField('status', e.target.value as any)}
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent"
          >
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-primary mb-1">Planned %</label>
          <input
            type="number"
            min="0"
            max="100"
            value={task.planned_percent}
            onChange={(e) => updateField('planned_percent', Math.max(0, Math.min(100, Number(e.target.value))))}
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-primary mb-1">Actual %</label>
          <input
            type="number"
            min="0"
            max="100"
            value={task.actual_percent}
            onChange={(e) => updateField('actual_percent', Math.max(0, Math.min(100, Number(e.target.value))))}
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-primary mb-1">Planned Hours</label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={task.time_planned_hours}
            onChange={(e) => updateField('time_planned_hours', Math.max(0, Number(e.target.value)))}
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-primary mb-1">Spent Hours</label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={task.time_spent_hours}
            onChange={(e) => updateField('time_spent_hours', Math.max(0, Number(e.target.value)))}
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-primary mb-1">Deliverable / PR Link</label>
          <input
            type="text"
            value={task.output_deliverable || ''}
            onChange={(e) => updateField('output_deliverable', e.target.value)}
            placeholder="e.g. PR #42 or Design Doc"
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-input focus:outline-none focus:border-accent"
          />
        </div>
      </div>
    </div>
  );
};
