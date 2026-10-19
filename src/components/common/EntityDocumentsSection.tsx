import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, ExternalLink, FilePlus2, Loader2 } from 'lucide-react';
// isUploading: any XHR live (row-level Upload buttons do the real gating)
import { AppDocument } from '../../types';
import { api } from '../../services/api';
import { useToast } from './Toast';
import { uploadFileToS3, formatBytes, randomUuid, extractFileExtension } from '../../services/s3Upload';
import { UploadProgressBar, UploadRowState } from './UploadProgressBar';

/**
 * Entity Documents — N-documents-per-owner S3 upload feature (sales,
 * purchases, parties, inventory items). One component, four feature kinds.
 *
 * Two modes:
 *  - entityId given → uploads link to the record IMMEDIATELY (used in the
 *    detail modals — works even when the record is locked — and while
 *    editing an existing record).
 *  - entityId omitted (a brand-new record) → uploads register document records
 *    immediately (owner = signed-in user) and STAGE them here via
 *    onStagedChange; the parent carries `documentIds` on the create payload
 *    and the server links them in the same create flow.
 *
 * S3 KEY STRUCTURE (user rule): existing record →
 * `<Sale|Purchase|Party|Inventory>/<entityId>/<uuid4>.<ext>`;
 * staged upload while creating (owner id not minted yet) →
 * `Pending/<uuid4>.<ext>`, moved server-side under the final key on link.
 *
 * There is NO upload limit and NO delete (upload-only per user directive —
 * document rows keep a status flag for a future soft-delete policy).
 */

export type DocumentsFeature = 'sale' | 'purchase' | 'party' | 'item';

export interface StagedDocument {
  id: string;
  /** original file name */
  name: string;
  /** user-entered document name (required at registration) */
  documentName: string;
  sizeBytes?: number;
  contentType?: string;
}

interface FeatureConfig {
  /** bucket-space feature tag sent with the presign request */
  s3Feature: string;
  /** S3 key root folder (user-specified paths) */
  root: string;
  /** entity word for toasts / row copy */
  noun: string;
}

const FEATURE_CONFIG: Record<DocumentsFeature, FeatureConfig> = {
  sale: { s3Feature: 'sale_orders', root: 'Sale', noun: 'order' },
  purchase: { s3Feature: 'purchase_orders', root: 'Purchase', noun: 'order' },
  party: { s3Feature: 'party_documents', root: 'Party', noun: 'party' },
  item: { s3Feature: 'inventory_documents', root: 'Inventory', noun: 'item' },
};

/** What an upload row holds once the file reached AWS S3 but has no name yet */
interface PendingRegistration {
  fileName: string;
  s3Key: string;
  url: string;
  contentType?: string;
  sizeBytes?: number;
}

interface QueueRow {
  qid: string;
  name: string;
  size: number;
  state: UploadRowState;
  /** per-upload user-entered document name (required before the Upload button activates) */
  documentName: string;
  /** picked file — held until the user presses Upload (staging model) */
  file?: File;
  /** precomputed S3 key for this file (final path with entityId, else Pending/) */
  s3Key?: string;
  /** set the moment the file lands on S3 — registration proceeds with the typed name */
  uploadResult?: PendingRegistration;
}

export interface EntityDocumentsSectionProps {
  feature: DocumentsFeature;
  /** existing record id — omit while creating a brand-new record */
  entityId?: string;
  /** create-mode staging (controlled by the parent modal) */
  staged?: StagedDocument[];
  onStagedChange?: (docs: StagedDocument[]) => void;
}

export function EntityDocumentsSection({ feature, entityId, staged = [], onStagedChange }: EntityDocumentsSectionProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<AppDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const abortsRef = useRef<Map<string, () => void>>(new Map());
  // Registration one-shot guard: the first valid upload proceeds once;
  // further triggers before the state flips to 'done' must not duplicate.
  const registeringRef = useRef<Set<string>>(new Set());
  // Per-row uploads run independently; the counter tracks how many XHRs are live
  const activeUploadsRef = useRef(0);
  // Live rows mirror for the unmount fallback (avoiding unnamed S3 orphans)
  const rowsRef = useRef<QueueRow[]>([]);
  rowsRef.current = rows;
  const stagedRef = useRef<StagedDocument[]>([]);
  stagedRef.current = staged;

  const s3FeatureKey = FEATURE_CONFIG[feature].s3Feature;
  const s3Root = FEATURE_CONFIG[feature].root;
  const ownerNoun = FEATURE_CONFIG[feature].noun;

  // Load the linked docs for an existing record — detail modals pass the id
  // through an inline refresh counter so re-links re-render immediately.
  const [listVersion, setListVersion] = useState(0);
  useEffect(() => {
    if (!entityId) return;
    let active = true;
    setIsLoadingDocs(true);
    const loader =
      feature === 'sale'
        ? api.getSaleDocuments(entityId)
        : feature === 'purchase'
        ? api.getPurchaseDocuments(entityId)
        : feature === 'party'
        ? api.getPartyDocuments(entityId)
        : api.getItemDocuments(entityId);
    loader
      .then((res) => {
        if (active && res.success) setDocs(res.data || []);
      })
      .catch(() => {
        if (active) showToast(`Failed to load documents.`, 'error');
      })
      .finally(() => {
        if (active) setIsLoadingDocs(false);
      });
    return () => {
      active = false;
    };
  }, [entityId, feature, listVersion]);

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

  // PICK = STAGE (user rule): choosing files adds rows with a document-name
  // input; NOTHING is uploaded until the user types a name and presses the
  // row's Upload button. No unnamed object can ever reach S3 this way.
  const addQueueRows = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    Array.from(filesList).forEach((file) => {
      const qid = `od-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const s3Key = entityId
        ? `${s3Root}/${entityId}/${randomUuid()}${extractFileExtension(file.name)}`
        : `Pending/${randomUuid()}${extractFileExtension(file.name)}`;
      setRows((prev) => [
        ...prev,
        {
          qid,
          name: file.name,
          size: file.size,
          state: { status: 'queued' as const },
          documentName: '',
          file,
          s3Key,
        },
      ]);
    });
  };

  const removeRow = (qid: string) => {
    abortsRef.current.delete(qid);
    setRows((prev) => prev.filter((r) => r.qid !== qid));
  };

  /** Keystroke on the per-row name input — pure state update; the Upload button drives everything */
  const setRowDocumentName = (qid: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, documentName: value } : r)));
  };

  /** THE upload button: uploads the file, then registers it with the typed name */
  const startUpload = (qid: string) => {
    const row = rowsRef.current.find((r) => r.qid === qid);
    const docName = row?.documentName?.trim();
    if (!row || row.state.status !== 'queued' || !docName || !row.file) {
      return;
    }
    setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'uploading' as const, progress: { percent: 0, loaded: 0, total: r.size, phase: 'signing' as const } } } : r)));
    activeUploadsRef.current += 1;
    setIsUploading(true);

    const { promise, abort } = uploadFileToS3(row.file, {
      feature: s3FeatureKey,
      objectKey: row.s3Key,
      onProgress: (p) =>
        setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'uploading' as const, progress: p } } : r))),
    });
    abortsRef.current.set(qid, abort);

    promise
      .then(async (res) => {
        abortsRef.current.delete(qid);
        activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
        if (!res.success || !res.publicUrl || !res.key) {
          setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: res.error === 'aborted' ? ('aborted' as const) : ('failed' as const), message: res.message } } : r)));
          if (activeUploadsRef.current === 0) setIsUploading(false);
          return;
        }

        // Register with the name captured at button press. The upload result is
        // passed EXPLICITLY — rowsRef only refreshes on the next render, so a
        // rowsRef read here would see a stale array (no uploadResult) and the
        // registration would silently no-op. That was the stuck-at-100% bug.
        const result: PendingRegistration = {
          fileName: res.name,
          s3Key: res.key,
          url: res.publicUrl,
          contentType: res.contentType,
          sizeBytes: res.size,
        };
        setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, uploadResult: result, file: undefined } : r)));
        await registerRow(qid, docName, result);
        if (activeUploadsRef.current === 0) setIsUploading(false);
      })
      .catch(() => {
        activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
        if (activeUploadsRef.current === 0) setIsUploading(false);
      });
  };

  /** Creates the document record (server REQUIRES documentName) + link/stage */
  const registerRow = async (qid: string, docName: string, result: PendingRegistration) => {
    if (registeringRef.current.has(qid)) return;
    registeringRef.current.add(qid);
    if (!result) {
      registeringRef.current.delete(qid);
      return;
    }
    try {
      const rec = await api.createDocument({
        fileName: result.fileName,
        documentName: docName,
        s3Key: result.s3Key,
        url: result.url,
        contentType: result.contentType,
        sizeBytes: result.sizeBytes,
      });
      if (!rec.success || !rec.data) {
        setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'failed' as const, message: 'Upload succeeded but the record could not be saved.' } } : r)));
        showToast(`Uploaded "${result.fileName}" but failed to register it.`, 'error');
        return;
      }

      if (entityId) {
        // Existing record — link immediately (works on locked records too)
        const linkRes =
          feature === 'sale'
            ? await api.linkSaleDocuments(entityId, [rec.data.id])
            : feature === 'purchase'
            ? await api.linkPurchaseDocuments(entityId, [rec.data.id])
            : feature === 'party'
            ? await api.linkPartyDocuments(entityId, [rec.data.id])
            : await api.linkItemDocuments(entityId, [rec.data.id]);
        if (linkRes.success) {
          setDocs((prev) => [rec.data as AppDocument, ...prev]);
          setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'done' as const, url: result.url } } : r)));
          setListVersion((v) => v + 1);
        } else {
          setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'failed' as const, message: `Uploaded — but linking to the ${ownerNoun} failed.` } } : r)));
        }
      } else {
        // New-record flow — stage; parent attaches documentIds on create
        setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'done' as const, url: result.url } } : r)));
        onStagedChange?.([
          ...stagedRef.current,
          {
            id: rec.data.id,
            name: result.fileName,
            documentName: docName,
            sizeBytes: result.sizeBytes,
            contentType: result.contentType,
          },
        ]);
      }
    } catch (err: any) {
      setRows((prev) => prev.map((r) => (r.qid === qid ? { ...r, state: { status: 'failed' as const, message: err.message || 'Registration failed.' } } : r)));
    } finally {
      registeringRef.current.delete(qid);
    }
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
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[var(--color-surface-container-high)] hover:bg-[var(--color-primary-container)] text-[10px] font-bold text-[var(--color-on-surface)] transition-colors"
          title={hasAnyDocs ? 'Choose more files — no limit' : 'Choose files to upload'}
        >
          <FilePlus2 className="w-3.5 h-3.5" />
          Choose files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            addQueueRows(e.target.files);
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
                <div className="min-w-0">
                  {/* USER-ENTERED DOCUMENT NAME primary; original file name secondary */}
                  <span
                    className="font-bold text-[var(--color-on-surface)] truncate block max-w-[240px]"
                    title={d.documentName || d.fileName}
                  >
                    {d.documentName || d.fileName}
                  </span>
                  {d.documentName && d.documentName !== d.fileName && (
                    <span className="text-[9px] text-[var(--color-on-surface-variant)] truncate block max-w-[240px]">
                      {d.fileName}
                    </span>
                  )}
                </div>
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
                <div className="min-w-0">
                  <span className="font-bold text-[var(--color-on-surface)] truncate block max-w-[240px]" title={s.documentName || s.name}>
                    {s.documentName || s.name}
                  </span>
                  {s.documentName && s.documentName !== s.name && (
                    <span className="text-[9px] text-[var(--color-on-surface-variant)] truncate block max-w-[240px]">
                      {s.name}
                    </span>
                  )}
                </div>
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

      {/* In-flight upload progress (loader) + per-upload DOCUMENT NAME input */}
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
                ['queued', 'done', 'failed', 'aborted', 'awaiting-name'].includes(r.state.status) ? () => removeRow(r.qid) : undefined
              }
              extra={
                // DOCUMENT NAME (user rule, staging model): pick stages the row;
                // typing the name arms the row's Upload button, which then runs
                // the upload + registration. Queued rows never touched S3.
                ['queued', 'uploading'].includes(r.state.status) ? (
                  <div>
                    <label className="block text-[9px] font-extrabold uppercase tracking-wider text-[var(--color-on-surface-variant)] mb-1">
                      Document name *
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={r.documentName}
                        onChange={(e) => setRowDocumentName(r.qid, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && r.state.status === 'queued' && r.documentName.trim()) {
                            e.preventDefault();
                            startUpload(r.qid);
                          }
                        }}
                        placeholder={`Name for "${r.name}"`}
                        disabled={r.state.status === 'uploading'}
                        className="w-full px-2.5 py-1.5 bg-[var(--color-surface-container-lowest)] border border-[var(--color-outline-variant)] rounded-lg text-[11px] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)] focus:outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
                      />
                      {r.state.status === 'queued' && (
                        <button
                          type="button"
                          onClick={() => startUpload(r.qid)}
                          disabled={!r.documentName.trim()}
                          title="Upload this document to AWS S3"
                          className="px-3 py-1.5 shrink-0 rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)] text-[10px] font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
                        >
                          Upload
                        </button>
                      )}
                    </div>
                    {r.state.status === 'queued' && !r.documentName.trim() && (
                      <p className="text-[9px] text-[var(--color-on-surface-variant)] mt-1">
                        Type a document name, then press Upload.
                      </p>
                    )}
                  </div>
                ) : undefined
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