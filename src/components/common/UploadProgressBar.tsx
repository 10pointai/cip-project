import React from 'react';
import { UploadCloud, CheckCircle2, XCircle, X, Loader2 } from 'lucide-react';
import { S3UploadProgress, formatBytes } from '../../services/s3Upload';

export type UploadRowState =
  | { status: 'queued' }
  | { status: 'uploading'; progress: S3UploadProgress }
  | { status: 'awaiting-name' }
  | { status: 'done'; url?: string }
  | { status: 'failed'; message?: string }
  | { status: 'aborted' }
  | { status: 'local'; message?: string };

interface UploadProgressBarProps {
  name: string;
  size: number;
  state: UploadRowState;
  onCancel?: () => void;
  onRemove?: () => void;
  /** Slot under the row body — used for the per-upload document-name input */
  extra?: React.ReactNode;
}

/**
 * M3-styled upload progress row for feature-agnostic S3 uploads.
 * Renders: file identity → phase label → determinate linear progress with
 * live bytes/percent, and terminal states (done/error/aborted).
 */
export function UploadProgressBar({ name, size, state, onCancel, onRemove, extra }: UploadProgressBarProps) {
  const uploading = state.status === 'uploading';
  const percent = state.status === 'uploading' ? state.progress.percent : 0;
  const phaseLabel =
    state.status === 'uploading'
      ? state.progress.phase === 'signing'
        ? 'Securing upload link…'
        : state.progress.phase === 'finalizing'
        ? 'Finalizing on AWS S3…'
        : 'Uploading to AWS S3…'
      : state.status === 'queued'
      ? 'Queued'
      : state.status === 'awaiting-name'
      ? 'Uploaded — name it to save'
      : state.status === 'done'
      ? 'Uploaded to AWS S3'
      : state.status === 'local'
      ? 'Stored locally (S3 unavailable)'
      : state.status === 'failed'
      ? 'Upload failed'
      : state.status === 'aborted'
      ? 'Cancelled'
      : '';

  const tone =
    state.status === 'done' || state.status === 'awaiting-name'
      ? 'text-[var(--color-warning)]'
      : state.status === 'failed' || state.status === 'aborted'
      ? 'text-[var(--color-error)]'
      : state.status === 'local'
      ? 'text-[var(--color-warning)]'
      : 'text-[var(--color-on-surface-variant)]';

  return null
}