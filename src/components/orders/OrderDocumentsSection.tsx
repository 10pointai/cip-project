import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, ExternalLink, FilePlus2, Loader2 } from 'lucide-react';
import { AppDocument } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../common/Toast';
import { uploadFileToS3, formatBytes, randomUuid, extractFileExtension } from '../../services/s3Upload';
import { UploadProgressBar, UploadRowState } from '../common/UploadProgressBar';

/**
 * Order Documents — N-documents-per-order S3 upload feature (sales & purchase).
 *
 * Two modes:
 *  - orderId given  → uploads link to the order IMMEDIATELY (used in the
 *    detail modal — works even when the order is locked — and while
 *    editing/issuing a stage of an existing order).
 *  - orderId omitted (a brand-new order) → uploads register document records
 *    immediately (owner = signed-in user) and STAGE them here via
 *    onStagedChange; the parent carries `documentIds` on the create payload
 *    and the server links them in the same transaction as the order.
 *
 * There is NO upload limit and NO delete (upload-only per user directive —
 * document rows keep a status flag for a future soft-delete policy).
 */

export interface StagedDocument {
  id: string;
  name: string;
  sizeBytes?: number;
  contentType?: string;
}

interface OrderDocumentsSectionProps {
  feature: 'sale' | 'purchase';
  /** existing order id — omit while creating a brand-new order */
  orderId?: string;
  /** create-mode staging (controlled by the parent modal) */
  staged?: StagedDocument[];
  onStagedChange?: (docs: StagedDocument[]) => void;
}

interface QueueRow {
  qid: string;
  name: string;
  size: number;
  state: UploadRowState;
}

export function OrderDocumentsSection({ feature, orderId, staged = [], onStagedChange }: OrderDocumentsSectionProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<AppDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const abortsRef = useRef<Map<string, () => void>>(new Map());

  const s3FeatureKey = feature === 'sale' ? 'sale_orders' : 'purchase_orders';

  // Load the linked docs for an existing order — detail modal passes the id
  // through an inline refresh counter so re-links re-render immediately.
  const [listVersion, setListVersion] = useState(0);
  useEffect(() => {
    if (!orderId) return;
    let active = true;
    setIsLoadingDocs(true);
    const loader = feature === 'sale' ? api.getSaleDocuments(orderId) : api.getPurchaseDocuments(orderId);
    loader
      .then((res) => {
        if (active && res.success) setDocs(res.data || []);
      })
      .catch(() => {
        if (active) showToast('Failed to load order documents.', 'error');
      })
      .finally(() => {
        if (active) setIsLoadingDocs(false);
      });
    return () => {
      active = false;
    };
  }, [orderId, feature, listVersion]);

  const effectiveStaged = staged.filter((s) => !docs.some((d) => d.id === s.id));

  const openDocument = async (docId: string) => {
    try {
      const res = await api.getDocumentDownloadUrl(docId);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener');
      } else {
        showToast('Could not create a view link for this document.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Could not open the document.', 'error');
    }
  };

  const handlePickFiles = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0 || isUploading) return;
    setIsUploading(true);

    Array.from(filesList).forEach((file) => {
      const qid = `od-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      // S3 KEY STRUCTURE (user rule): existing order → `<Sale|Purchase>/<orderId>/<uuid4>.<ext>`;
      // staged upload while creating (order id not minted yet) → `Pending/<uuid4>.<ext>`,
      // moved server-side under the final key when the order is linked.
      const s3Key = orderId
        ? `${feature === 'sale' ? 'Sale' : 'Purchase'}/${orderId}/${randomUuid()}${extractFileExtension(file.name)}`
        : `Pending/${randomUuid()}${extractFileExtension(file.name)}`;
      setRows((prev) => [
        ...prev,
        { qid, name: file.name, size: file.size, state: { status: 'uploading', progress: { percent: 0, loaded: 0, total: file.size, phase: 'signing' } } },
      ]);

      const { promise, abort } = uploadFileToS3(file, {
        feature: s3FeatureKey,
        objectKey: s3Key,
        onProgress: (p) =>
          setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'uploading', progress: p } } : r))),
      });
      abortsRef.current.set(qid, abort);

      promise
        .then(async (res) => {
          abortsRef.current.delete(qid);
          if (!res.success || !res.publicUrl || !res.key) {
            setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: res.error === 'aborted' ? 'aborted' : 'failed', message: res.message } } : r)));
            setIsUploading(false);
            return;
          }

          try {
            const rec = await api.createDocument({
              name: res.name,
              s3Key: res.key,
              url: res.publicUrl,
              contentType: res.contentType,
              sizeBytes: res.size,
            });
            if (!rec.success || !rec.data) {
              setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'failed', message: 'Upload succeeded but the record could not be saved.' } } : r)));
              showToast(`Uploaded "${res.name}" to S3 but failed to register it.`, 'error');
              setIsUploading(false);
              return;
            }

            if (orderId) {
              // Existing order — link immediately (works on locked orders too)
              const link = feature === 'sale'
                ? await api.linkSaleDocuments(orderId, [rec.data.id])
                : await api.linkPurchaseDocuments(orderId, [rec.data.id]);
              if (link.success) {
                setDocs((prev) => [rec.data as AppDocument, ...prev]);
                setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'done', url: res.publicUrl } } : r)));
                setListVersion((v) => v + 1);
              } else {
                setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'failed', message: 'Uploaded — but linking to the order failed.' } } : r)));
              }
            } else {
              // New-order flow — stage; parent attaches documentIds on create
              setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'done', url: res.publicUrl } } : r)));
              onStagedChange?.([
                ...staged,
                { id: rec.data.id, name: res.name, sizeBytes: res.size, contentType: res.contentType },
              ]);
            }
          } catch (err: any) {
            setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'failed', message: err.message || 'Registration failed.' } } : r)));
          }
          setIsUploading(false);
        })
        .catch(() => {
          setIsUploading(false);
        });
    });
  };

  const removeRow = (qid: string) => {
    abortsRef.current.delete(qid);
    setRows((prev) => prev.filter((r) => r.qid !== qid));
  };

  const hasAnyDocs = docs.length > 0 || effectiveStaged.length > 0 || rows.length > 0;

  return (
    <div className="rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)] p-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Paperclip className="w-4 h-4 text-[var(--color-primary)]" />
          <span className="text-xs font-extrabold text-[var(--color-on-surface)] uppercase tracking-wider">
            Documents
          </span>
          {(docs.length > 0 || effectiveStaged.length > 0) && (
            <span className="text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary-container)] px-1.5 py-0.5 rounded-full">
              {docs.length + effectiveStaged.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[var(--color-surface-container-high)] hover:bg-[var(--color-primary-container)] text-[10px] font-bold text-[var(--color-on-surface)] disabled:opacity-50 transition-colors"
          title={hasAnyDocs ? 'Upload more documents — no limit' : 'Upload documents'}
        >
          {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}
          {hasAnyDocs ? 'Upload more documents' : 'Upload documents'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            handlePickFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      

      {/* Attached / staged documents */}
      {(docs.length > 0 || effectiveStaged.length > 0) && (
        <div className="space-y-1 mb-1.5">
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-surface-container)] text-xs"
            >
              <div className="min-w-0 flex items-center gap-2">
                <Paperclip className="w-3.5 h-3.5 text-[var(--color-on-surface-variant)] shrink-0" />
                <span className="font-bold text-[var(--color-on-surface)] truncate max-w-[240px]" title={d.name}>
                  {d.name}
                </span>
                <span className="text-[9px] text-[var(--color-on-surface-variant)] shrink-0">
                  {formatBytes(d.sizeBytes || 0)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => openDocument(d.id)}
                className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary)] hover:underline shrink-0"
              >
                <ExternalLink className="w-3 h-3" /> Open
              </button>
            </div>
          ))}
          {effectiveStaged.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-surface-container)] text-xs border border-dashed border-[var(--color-outline-variant)]"
            >
              <div className="min-w-0 flex items-center gap-2">
                <Paperclip className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                <span className="font-bold text-[var(--color-on-surface)] truncate max-w-[240px]" title={s.name}>
                  {s.name}
                </span>
                <span className="text-[9px] text-[var(--color-on-surface-variant)] shrink-0">
                  {formatBytes(s.sizeBytes || 0)}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] font-semibold text-[var(--color-primary)] bg-[var(--color-primary-container)] px-2 py-0.5 rounded-full">
                  Attach on save
                </span>
                <button
                  type="button"
                  onClick={() => onStagedChange?.(staged.filter((x) => x.id !== s.id))}
                  className="text-[9px] font-bold text-[var(--color-error)] hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* In-flight upload progress (loader) */}
      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <UploadProgressBar
              key={r.qid}
              name={r.name}
              size={r.size}
              state={r.state}
              onCancel={
                r.state.status === 'uploading'
                  ? () => {
                      abortsRef.current.get(r.qid)?.();
                      abortsRef.current.delete(r.qid);
                    }
                  : undefined
              }
              onRemove={
                ['done', 'failed', 'aborted'].includes(r.state.status) ? () => removeRow(r.qid) : undefined
              }
            />
          ))}
        </div>
      )}

      {isLoadingDocs && (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-on-surface-variant)]">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading documents…
        </div>
      )}
    </div>
  );
}