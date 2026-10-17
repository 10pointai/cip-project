import { api } from './api';

/**
 * AWS S3 Upload Service
 *
 * One reusable function for every feature in the app: fetches a server-minted
 * pre-signed PUT URL, streams the file straight to S3 with real progress
 * events via XHR (fetch cannot observe upload progress), and resolves with
 * the permanent S3 link that callers persist into their own tables.
 *
 * S3 KEY LAYOUT (documented in documentation.txt §"S3 uploads"):
 *   <feature>/<entityType || 'general'>/<YYYY>/<MM>/<ts>-<rand>-<sanitized-name>
 * e.g. evidence/sales/2026/10/1739784000000-x7k2-sinv-26-001.pdf
 */

export interface S3UploadProgress {
  /** 0-100, rounded; 0-2 during presign and first bytes is fine to re-emit */
  percent: number;
  loaded: number;
  total: number;
  /** current phase — 'signing' while the presigned URL is requested */
  phase: 'signing' | 'uploading' | 'finalizing';
}

export interface S3UploadOptions {
  /** primary key path segment — the feature the file belongs to (evidence, sales, purchases...) */
  feature: string;
  /** optional secondary segment — entity type the file is linked to (party, sale, purchase bill, trip...) */
  entityType?: string;
  /** optional entity primary key, appended into the key for direct lookup */
  entityId?: string;
  /**
   * Verbatim S3 key override — for layouts the caller owns (user rule:
   * order documents use `<Sale|Purchase>/<orderId>/<uuid4>.<ext>` and staged
   * pre-creation uploads use `Pending/<uuid4>.<ext>`, moved server-side on link).
   */
  objectKey?: string;
  /** progress callback; may fire repeatedly — treat as render updates, never as a completion signal */
  onProgress?: (progress: S3UploadProgress) => void;
  /** hard cap in bytes (default 25MB) */
  maxBytes?: number;
}

export interface S3UploadResult {
  success: boolean;
  /** permanent S3 object URL — the value callers save into their tables */
  publicUrl?: string;
  /** the S3 object key (use with generatePresignedDownloadUrl for private reads) */
  key?: string;
  bucket?: string;
  name: string;
  size: number;
  contentType: string;
  /** set when success === false — 'not-configured' means keys are missing on the server */
  error?: 'not-configured' | 'aborted' | 'network' | 'rejected' | 'too-large';
  message?: string;
}

/** Max safe characters kept from the original filename inside the S3 key */
const MAX_NAME_CHARS = 80;

/** RFC4122 v4 uuid — crypto.randomUUID when available, fallback otherwise */
export function randomUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // uuid v4 shape from secure RNG-ish sources (crypto.getRandomValues when present)
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 32; i++) {
    const slot = crypto?.getRandomValues?.(new Uint8Array(1))[0];
    const byte = slot ?? Math.floor(Math.random() * 256);
    out += hex[byte % 16];
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-a${out.slice(17, 20)}-${out.slice(20, 32)}`;
}

function getFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '');
}

export function extractFileExtension(fileName: string): string {
  return getFileExtension(fileName);
}

function sanitizeFilename(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
  const clean = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_NAME_CHARS);
  const cleanExt = ext.replace(/[^a-z0-9.]/g, '');
  return `${clean || 'file'}${cleanExt}`;
}

function buildS3Key(file: File, options: S3UploadOptions): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6);
  const segments = [
    options.feature,
    options.entityType || 'general',
    String(yyyy),
    mm,
    `${now.getTime()}-${rand}-${sanitizeFilename(file.name)}`,
  ];
  return segments.join('/');
}

/**
 * Uploads a file to AWS S3 through a server-minted pre-signed PUT URL with
 * live progress events.
 *
 * Returns a promise (never throws — resolve with success:false on any
 * failure so per-feature callers can toast, fall back, or block) plus an
 * abort() handle for cancel buttons.
 */
export function uploadFileToS3(
  file: File,
  options: S3UploadOptions
): { promise: Promise<S3UploadResult>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  let aborted = false;

  const abort = () => {
    aborted = true;
    try {
      xhr.abort();
    } catch {
      // aborting before XHR open is a no-op
    }
  };

  const promise = new Promise<S3UploadResult>(async (resolve) => {
    const maxBytes = options.maxBytes ?? 25 * 1024 * 1024;
    const meta = {
      name: file.name,
      size: file.size,
      contentType: file.type || 'application/octet-stream',
      bucket: undefined,
    };

    if (file.size > maxBytes) {
      resolve({
        ...meta,
        success: false,
        error: 'too-large',
        message: `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB — above the ${(maxBytes / (1024 * 1024)).toFixed(0)}MB limit.`,
      });
      return;
    }

    const contentType = file.type || 'application/octet-stream';

    try {
      options.onProgress?.({ percent: 0, loaded: 0, total: file.size, phase: 'signing' });
      const objectKey = options.objectKey || buildS3Key(file, options);
      const signRes = await api.getPresignedUploadUrl(objectKey, contentType);

      if (!signRes.success || !signRes.data) {
        // fallbackMode means the server has no S3 keys — a permanent state
        // callers should surface as a real error, not a transient failure.
        if (signRes.fallbackMode) {
          resolve({
            ...meta,
            success: false,
            error: 'not-configured',
            message: signRes.message || 'AWS S3 is not configured on the server.',
          });
          return;
        }
        resolve({
          ...meta,
          success: false,
          error: 'rejected',
          message: signRes.message || 'Upload sign-in failed.',
        });
        return;
      }

      const { uploadUrl, publicUrl, key } = signRes.data as {
        uploadUrl: string;
        publicUrl: string;
        key: string;
      };

      options.onProgress?.({ percent: 0, loaded: 0, total: file.size, phase: 'uploading' });

      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', contentType);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          options.onProgress?.({
            percent: Math.round((e.loaded / e.total) * 100),
            loaded: e.loaded,
            total: e.total,
            phase: 'uploading',
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          options.onProgress?.({ percent: 100, loaded: file.size, total: file.size, phase: 'finalizing' });
          resolve({ ...meta, success: true, publicUrl, key, bucket: undefined });
        } else {
          resolve({
            ...meta,
            success: false,
            error: 'rejected',
            message: `S3 rejected the upload (HTTP ${xhr.status}).`,
          });
        }
      };

      xhr.onerror = () => {
        // XHR network-level failure: status 0 = CORS-blocked or DNS failure
        // (the browser never got a response to read); an HTTP status means
        // S3 answered but the request failed (region/bucket/perms).
        const detail =
          xhr.status === 0
            ? 'The connection to S3 never completed — usually missing bucket CORS for this origin, or a wrong bucket name/region.'
            : `HTTP ${xhr.status} during the S3 PUT.`;
        console.error(`[S3Upload] PUT to "${window.location.origin}" failed:`, {
          status: xhr.status,
          responseSnippet: typeof xhr.responseText === 'string' ? xhr.responseText.slice(0, 300) : '',
          key,
        });
        resolve({
          ...meta,
          success: false,
          error: 'network',
          message: `Network error while uploading to AWS S3. ${detail}`,
        });
      };

      xhr.onabort = () =>
        resolve({ ...meta, success: false, error: 'aborted', message: 'Upload cancelled.' });

      xhr.send(file);
    } catch (err: any) {
      if (aborted) {
        resolve({ ...meta, success: false, error: 'aborted', message: 'Upload cancelled.' });
        return;
      }
      resolve({
        ...meta,
        success: false,
        error: 'network',
        message: err?.message || 'Upload failed before the file reached AWS S3.',
      });
    }
  });

  return { promise, abort };
}

/** Formats bytes for the progress loader ("1.4 MB", "320 KB") */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}