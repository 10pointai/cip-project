import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * AWS S3 Cloud Storage Service
 * Provides pre-signed upload & download URLs for high-volume operational documents:
 * weighbridge tickets, bitumen lab quality test reports, vehicle fitness certificates, and challans.
 */

export interface StorageConfigInfo {
  isConfigured: boolean;
  provider: 'aws_s3' | 'local_storage';
  bucket?: string;
  region?: string;
  mode: 'cloud' | 'local_fallback';
  endpoint?: string;
  error?: string;
}

let s3Client: S3Client | null = null;
let lastS3Error: string | null = null;

export function getS3BucketName(): string | undefined {
  return (
    process.env.AWS_S3_BUCKET ||
    process.env.AWS_BUCKET_NAME ||
    process.env.S3_BUCKET_NAME
  );
}

export function getS3Region(): string {
  return (
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    'ap-south-1' // Defaulting to Asia Pacific (Mumbai) commonly used for Indian infrastructure
  );
}

export function isS3Configured(): boolean {
  return !!(
    getS3BucketName() &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

export function isCloudStorageConfigured(): boolean {
  return isS3Configured();
}

/**
 * Lazy initialization of AWS S3 Client with proper exception handling.
 * Prevents app crashing at boot if keys are missing or unconfigured.
 */
export function getS3Client(): S3Client | null {
  if (s3Client) return s3Client;

  const bucket = getS3BucketName();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  try {
    const region = getS3Region();
    s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      },
      endpoint: process.env.AWS_S3_ENDPOINT || undefined,
      forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true',
    });
    return s3Client;
  } catch (err: any) {
    console.error('[AWS S3] Failed to initialize S3Client:', err.message);
    lastS3Error = err.message;
    return null;
  }
}

/**
 * Tests connectivity and bucket access on AWS S3.
 */
export async function testS3Connection(): Promise<{ ok: boolean; message: string }> {
  if (!isS3Configured()) {
    return {
      ok: false,
      message: 'AWS S3 credentials not configured (Requires AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY)',
    };
  }

  const client = getS3Client();
  const bucket = getS3BucketName();

  if (!client || !bucket) {
    return {
      ok: false,
      message: 'Could not instantiate S3 client with current credentials',
    };
  }

  try {
    const command = new HeadBucketCommand({ Bucket: bucket });
    await client.send(command);
    lastS3Error = null;
    return {
      ok: true,
      message: `Successfully verified AWS S3 Bucket "${bucket}" in region ${getS3Region()}`,
    };
  } catch (err: any) {
    lastS3Error = err.message || 'Error connecting to AWS S3 bucket';
    console.warn('[AWS S3] HeadBucket failed:', lastS3Error);
    return {
      ok: false,
      message: `AWS S3 Connection failed: ${lastS3Error}`,
    };
  }
}

/**
 * Returns current status of AWS S3 storage configuration.
 */
export function getStorageStatus(): StorageConfigInfo {
  if (isS3Configured()) {
    const bucket = getS3BucketName();
    const region = getS3Region();
    return {
      isConfigured: true,
      provider: 'aws_s3',
      bucket,
      region,
      mode: 'cloud',
      endpoint: process.env.AWS_S3_ENDPOINT || `s3.${region}.amazonaws.com`,
      error: lastS3Error || undefined,
    };
  }

  return {
    isConfigured: false,
    provider: 'local_storage',
    bucket: undefined,
    region: undefined,
    mode: 'local_fallback',
  };
}

/**
 * Generates an AWS S3 pre-signed upload URL (PUT) for direct client-to-S3 uploads.
 * Offloads heavy documents (weighbridge photos, test certificates, and challans) directly to AWS S3.
 */
export async function generatePresignedUploadUrl(
  filePath: string,
  contentType: string
): Promise<{ uploadUrl: string; publicUrl: string; key: string; bucket: string; provider: string } | null> {
  if (!isS3Configured()) {
    return null;
  }

  const client = getS3Client();
  const bucket = getS3BucketName();
  const region = getS3Region();

  if (!client || !bucket) {
    return null;
  }

  // Clean the S3 object key
  const cleanKey = filePath.startsWith('/') ? filePath.slice(1) : filePath;

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: cleanKey,
      ContentType: contentType,
    });

    // 1-hour pre-signed URL expiration
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
    
    // Construct public or accessible S3 URL
    const publicUrl = process.env.AWS_S3_CUSTOM_DOMAIN
      ? `https://${process.env.AWS_S3_CUSTOM_DOMAIN}/${cleanKey}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${cleanKey}`;

    return {
      uploadUrl,
      publicUrl,
      key: cleanKey,
      bucket,
      provider: 'aws_s3',
    };
  } catch (err: any) {
    console.error('[AWS S3] Error generating pre-signed upload URL:', err.message);
    return null;
  }
}

/**
 * Generates a pre-signed download URL (GET) for secure, private S3 objects.
 */
export async function generatePresignedDownloadUrl(key: string): Promise<string | null> {
  if (!isS3Configured()) return null;
  const client = getS3Client();
  const bucket = getS3BucketName();
  if (!client || !bucket) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    return await getSignedUrl(client, command, { expiresIn: 3600 });
  } catch (err: any) {
    console.error('[AWS S3] Error generating pre-signed download URL:', err.message);
    return null;
  }
}
