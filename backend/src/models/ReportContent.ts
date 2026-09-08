import mongoose, { Schema, Document } from 'mongoose';

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'not_started' | 'in_progress' | 'done' | 'blocked';

export interface ITaskCompleted {
  task_name: string;
  priority: TaskPriority;
  planned_percent: number;
  actual_percent: number;
  status: TaskStatus;
  time_planned_hours: number;
  time_spent_hours: number;
  output_deliverable?: string;
}

export interface IBlocker {
  text: string;
  is_key_issue: boolean;
}

export interface IAchievement {
  text: string;
  is_key_achievement: boolean;
}

export interface IHoursByType {
  development?: number;
  testing?: number;
  meetings?: number;
  documentation?: number;
}

export interface IReportContent extends Document {
  report_id: string; // Matches PostgreSQL reports.id (UUID)
  tasks_completed: ITaskCompleted[];
  tasks_planned_next_week: string[];
  blockers: IBlocker[];
  achievements: IAchievement[];
  hours_by_type?: IHoursByType;
  notes?: string;
  updated_at: Date;
}

// Subdocument Schemas
export const TaskCompletedSchema = new Schema<ITaskCompleted>(
  {
    task_name: { type: String, required: true, trim: true },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    planned_percent: { type: Number, min: 0, max: 100, default: 0 },
    actual_percent: { type: Number, min: 0, max: 100, default: 0 },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'done', 'blocked'],
      default: 'not_started',
    },
    time_planned_hours: { type: Number, default: 0, min: 0 },
    time_spent_hours: { type: Number, default: 0, min: 0 },
    output_deliverable: { type: String, default: '' },
  },
  { _id: false }
);

export const BlockerSchema = new Schema<IBlocker>(
  {
    text: { type: String, required: true, trim: true },
    is_key_issue: { type: Boolean, default: false },
  },
  { _id: false }
);

export const AchievementSchema = new Schema<IAchievement>(
  {
    text: { type: String, required: true, trim: true },
    is_key_achievement: { type: Boolean, default: false },
  },
  { _id: false }
);

export const HoursByTypeSchema = new Schema<IHoursByType>(
  {
    development: { type: Number, default: 0, min: 0 },
    testing: { type: Number, default: 0, min: 0 },
    meetings: { type: Number, default: 0, min: 0 },
    documentation: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

export const ReportContentSchema = new Schema<IReportContent>(
  {
    report_id: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    tasks_completed: {
      type: [TaskCompletedSchema],
      default: [],
    },
    tasks_planned_next_week: {
      type: [String],
      default: [],
    },
    blockers: {
      type: [BlockerSchema],
      default: [],
      validate: [
        {
          validator: function (blockers: IBlocker[]) {
            if (!blockers || blockers.length === 0) return true;
            const keyCount = blockers.filter((b) => b.is_key_issue === true).length;
            return keyCount <= 1;
          },
          message: 'At most one blocker can have is_key_issue=true',
        },
      ],
    },
    achievements: {
      type: [AchievementSchema],
      default: [],
      validate: [
        {
          validator: function (achievements: IAchievement[]) {
            if (!achievements || achievements.length === 0) return true;
            const keyCount = achievements.filter((a) => a.is_key_achievement === true).length;
            return keyCount <= 1;
          },
          message: 'At most one achievement can have is_key_achievement=true',
        },
      ],
    },
    hours_by_type: {
      type: HoursByTypeSchema,
      default: () => ({ development: 0, testing: 0, meetings: 0, documentation: 0 }),
    },
    notes: {
      type: String,
      default: '',
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'report_content',
    timestamps: { createdAt: false, updatedAt: 'updated_at' },
  }
);

export const ReportContent = mongoose.model<IReportContent>(
  'ReportContent',
  ReportContentSchema
);
