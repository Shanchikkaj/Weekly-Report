import mongoose, { Schema, Document } from 'mongoose';
import {
  ITaskCompleted,
  IBlocker,
  IAchievement,
  IHoursByType,
  TaskCompletedSchema,
  BlockerSchema,
  AchievementSchema,
  HoursByTypeSchema,
} from './ReportContent';

export interface IContentSnapshot {
  tasks_completed: ITaskCompleted[];
  tasks_planned_next_week: string[];
  blockers: IBlocker[];
  achievements: IAchievement[];
  hours_by_type?: IHoursByType;
  notes?: string;
}

export interface IReportVersion extends Document {
  report_id: string; // Matches PostgreSQL reports.id (UUID)
  version_number: number;
  content_snapshot: IContentSnapshot;
  submitted_at: Date;
}

export const ContentSnapshotSchema = new Schema<IContentSnapshot>(
  {
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
  },
  { _id: false }
);

export const ReportVersionSchema = new Schema<IReportVersion>(
  {
    report_id: {
      type: String,
      required: true,
      index: true,
    },
    version_number: {
      type: Number,
      required: true,
    },
    content_snapshot: {
      type: ContentSnapshotSchema,
      required: true,
    },
    submitted_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'report_versions',
  }
);

// Compound index on report_id + version_number for fast unique lookups
ReportVersionSchema.index({ report_id: 1, version_number: 1 }, { unique: true });

export const ReportVersion = mongoose.model<IReportVersion>(
  'ReportVersion',
  ReportVersionSchema
);
