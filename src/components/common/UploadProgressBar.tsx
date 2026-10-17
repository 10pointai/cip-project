import React from 'react';
import { UploadCloud, CheckCircle2, XCircle, X, Loader2 } from 'lucide-react';
import { S3UploadProgress, formatBytes } from '../../services/s3Upload';

export type UploadRowState =
  | { status: 'queued' }
  | { status: 'uploading'; progress: S3UploadProgress }
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
}

/**
 * M3-styled upload progress row for feature-agnostic S3 uploads.
 * Renders: file identity → phase label → determinate linear progress with
 * live bytes/percent, and terminal states (done/error/aborted).
 */
export function UploadProgressBar({ name, size, state, onCancel, onRemove }: UploadProgressBarProps) {
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
    state.status === 'done'
      ? 'text-[var(--color-success)]'
      : state.status === 'failed' || state.status === 'aborted'
      ? 'text-[var(--color-error)]'
      : state.status === 'local'
      ? 'text-[var(--color-warning)]'
      : 'text-[var(--color-on-surface-variant)]';

  return (
    <div className="flex items-center gap-2.5 p-2.5 bg-[var(--color-surface-container)] rounded-xl text-xs">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          state.status === 'done'
            ? 'bg-[var(--color-success-container)] text-[var(--color-success)]'
            : state.status === 'failed' || state.status === 'aborted'
            ? 'bg-[var(--color-error-container)] text-[var(--color-error)]'
            : 'bg-[var(--color-primary-container)] text-[var(--color-primary)]'
        }`}
      >
        {state.status === 'done' ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : state.status === 'failed' || state.status === 'aborted' ? (
          <XCircle className="w-4 h-4" />
        ) : uploading && state.progress.phase === 'uploading' && percent > 0 ? (
          <span className="text-[9px] font-black">{percent}%</span>
        ) : uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <UploadCloud className="w-4 h-4" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[var(--color-on-surface)] truncate max-w-[220px]" title={name}>
            {name}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-semibold ${tone}`}>{phaseLabel}</span>
            {(uploading || ['done', 'failed', 'aborted'].includes(state.status)) && (onRemove || (uploading ? onCancel : null)) ? (
              uploading && onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  title="Cancel upload"
                  className="p-1 rounded text-[var(--color-error)] hover:bg-[var(--color-error-container)]"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : onRemove ? (
                <button
                  type="button"
                  onClick={onRemove}
                  title="Remove from list"
                  className="p-1 rounded text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : null
            ) : null}
          </div>
        </div>

        {uploading ? (
          <div className="mt-1.5">
            <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  state.progress.phase === 'signing'
                    ? 'bg-[var(--color-on-surface-variant)] animate-pulse w-full opacity-40'
                    : 'bg-[var(--color-primary)]'
                }`}
                style={
                  state.progress.phase === 'signing'
                    ? undefined
                    : { width: `${Math.min(100, Math.max(2, percent))}%` }
                }
              />
            </div>
            <p className="text-[9px] text-[var(--color-on-surface-variant)] mt-0.5 font-mono">
              {state.progress.phase === 'signing'
                ? 'preparing…'
                : `${formatBytes(state.progress.loaded)} / ${formatBytes(state.progress.total)}`}
            </p>
          </div>
        ) : (
          <p className="text-[9px] text-[var(--color-on-surface-variant)]">{formatBytes(size)}</p>
        )}

        {state.status === 'failed' && state.message && (
          <p className="text-[9px] text-[var(--color-error)] mt-0.5">{state.message}</p>
        )}
        {state.status === 'local' && state.message && (
          <p className="text-[9px] text-[var(--color-warning)] mt-0.5">{state.message}</p>
        )}
      </div>
    </div>
  );
}