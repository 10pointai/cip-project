import { CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getS3BucketName, getS3Region } from './storage';

/**
 * Server-side S3 object LIFECYCLE for the order-documents key structure:
 *   existing order  →  <Sale|Purchase>/<orderId>/<uuid4>.<ext>   (final at upload)
 *   staged upload   →  Pending/<uuid4>.<ext>                     (moved on link)
 *
 * "Moved on link": when the order is created/the document is linked, the
 * Pending object is COPIED into the final key (CopyObject — server-to-server,
 * no re-upload round-trip) and the temp source is deleted. The documents row
 * (s3_key + url) is updated by the caller. Policy: bucket files are never
 * deleted as a *document* — deleting the temp copy here is the same object
 * moving home, not a deletion (user directive 2026-10-17).
 */

export interface S3MoveResult {
  ok: boolean;
  publicUrl?: string;
  error?: string;
}

export async function moveS3Object(fromKey: string, toKey: string): Promise<S3MoveResult> {
  const client = getS3Client();
  const bucket = getS3BucketName();
  const from = String(fromKey).replace(/^\/+/, '');
  const to = String(toKey).replace(/^\/+/, '');

  if (!client || !bucket) {
    return { ok: false, error: 'S3 not configured' };
  }

  try {
    // CopySource must be /bucket/key with the key URL-encoded
    const encodedFrom = `/${bucket}/${from.split('/').map(encodeURIComponent).join('/')}`;
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: encodedFrom,
        Key: to,
      })
    );
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: from }));

    const region = getS3Region();
    const customDomain = (process.env.AWS_S3_CUSTOM_DOMAIN || '').replace(/\/+$/, '');
    const publicUrl = customDomain
      ? `https://${customDomain}/${to}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${to}`;

    return { ok: true, publicUrl };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'S3 move failed' };
  }
}

/** Root folder per feature — every later feature adds its own root here */
export function orderDocumentRoot(kind: 'sale' | 'purchase' | 'party' | 'item' | 'employee' | 'vehicle'): string {
  switch (kind) {
    case 'sale':
      return 'Sale';
    case 'purchase':
      return 'Purchase';
    case 'party':
      return 'Party';
    case 'item':
      return 'Inventory';
    case 'employee':
      return 'Employee';
    case 'vehicle':
      return 'Vehicle';
  }
}