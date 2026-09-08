import React from 'react';

export type ReportStatus = 'draft' | 'submitted' | 'needs_correction' | 'approved';

interface StatusBadgeProps {
  status: ReportStatus | string;
  className?: string;
}

const statusConfig: Record<
  ReportStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  draft: {
    label: 'Draft',
    bg: 'bg-[#F1F3F5]',
    text: 'text-[#475467]',
    border: 'border-[#D0D5DD]',
    dot: 'bg-[#667085]',
  },
  submitted: {
    label: 'Submitted',
    bg: 'bg-[#EFF6FF]',
    text: 'text-[#1D4ED8]',
    border: 'border-[#BFDBFE]',
    dot: 'bg-[#2563EB]',
  },
  needs_correction: {
    label: 'Needs Correction',
    bg: 'bg-[#FEF3F2]',
    text: 'text-[#B42318]',
    border: 'border-[#FECDCA]',
    dot: 'bg-[#D92D20]',
  },
  approved: {
    label: 'Approved',
    bg: 'bg-[#ECFDF3]',
    text: 'text-[#027A48]',
    border: 'border-[#A6F4C5]',
    dot: 'bg-[#12B76A]',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const normalizedStatus = (status?.toLowerCase() || 'draft') as ReportStatus;
  const config = statusConfig[normalizedStatus] || statusConfig.draft;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};
