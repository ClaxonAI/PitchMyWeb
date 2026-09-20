import { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// S3-compatible object storage for demo recordings.
//
//   Local:       MinIO from infrastructure/docker (STORAGE_ENDPOINT=http://127.0.0.1:9100)
//   Production:  Cloudflare R2 or AWS S3
//
// Objects are private. Anything a browser or a WhatsApp recipient opens goes
// through a short-lived signed URL. STORAGE_PUBLIC_ENDPOINT lets signing use
// a different host than the server-to-server endpoint (e.g. a container
// network name vs. the public hostname).

export type StorageConfig = {
  endpoint?: string;
  publicEndpoint?: string;
  region: string;
  bucket: string;
  /** Omitted when the host supplies credentials itself, e.g. an EC2 instance role. */
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
};

type Env = Record<string, string | undefined>;

/** Reads STORAGE_* variables. Returns null when storage is not configured. */
export function storageConfigFromEnv(env: Env = process.env): StorageConfig | null {
  const bucket = env.STORAGE_BUCKET?.trim();
  const accessKeyId = env.STORAGE_ACCESS_KEY?.trim();
  const secretAccessKey = env.STORAGE_SECRET_KEY?.trim();
  // Only the bucket is required. Static keys are for MinIO and R2; on EC2 the
  // instance role already supplies credentials, and demanding them here meant
  // issuing a second, long-lived set for an identity the host already has.
  if (!bucket) return null;
  const endpoint = env.STORAGE_ENDPOINT?.trim() || undefined;
  return {
    endpoint,
    publicEndpoint: env.STORAGE_PUBLIC_ENDPOINT?.trim() || endpoint,
    region: env.STORAGE_REGION?.trim() || "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    // MinIO needs path-style addressing; R2 and S3 accept it too.
    forcePathStyle: (env.STORAGE_FORCE_PATH_STYLE ?? "true").toLowerCase() !== "false",
  };
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Object storage is not configured (STORAGE_BUCKET is required; STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY only when the host has no credentials of its own)");
    this.name = "StorageNotConfiguredError";
  }
}

function client(config: StorageConfig, endpoint: string | undefined): S3Client {
  return new S3Client({
    region: config.region,
    endpoint,
    forcePathStyle: config.forcePathStyle,
    // Left unset when no static keys are configured, which is what makes the
    // SDK walk its default provider chain and pick up the instance role.
    ...(config.accessKeyId && config.secretAccessKey
      ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
      : {}),
  });
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }
  const withTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof withTransform.transformToByteArray === "function") {
    return Buffer.from(await withTransform.transformToByteArray());
  }
  throw new Error("Unsupported object body type");
}

export class ObjectStorage {
  private readonly s3: S3Client;
  private readonly signer: S3Client;

  constructor(readonly config: StorageConfig) {
    this.s3 = client(config, config.endpoint);
    this.signer = config.publicEndpoint === config.endpoint ? this.s3 : client(config, config.publicEndpoint);
  }

  static fromEnv(env: Env = process.env): ObjectStorage {
    const config = storageConfigFromEnv(env);
    if (!config) throw new StorageNotConfiguredError();
    return new ObjectStorage(config);
  }

  /** Creates the bucket if it does not exist yet (local MinIO convenience). */
  async ensureBucket(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
    }
  }

  async put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "private, max-age=86400",
      }),
    );
  }

  async getBuffer(key: string): Promise<Buffer> {
    const result = await this.s3.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
    return streamToBuffer(result.Body);
  }

  /** Time-limited GET URL a browser or phone can open directly. */
  async signedGetUrl(key: string, expiresInSeconds = 3600, options: { downloadFilename?: string } = {}): Promise<string> {
    // Asking S3 for `attachment` makes the browser save the file instead of
    // playing it; it works cross-origin, unlike the HTML `download` attribute.
    const disposition = options.downloadFilename ? `attachment; filename="${options.downloadFilename.replace(/[^\w.\- ]/g, "_")}"` : undefined;
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.config.bucket, Key: key, ResponseContentDisposition: disposition }), {
      expiresIn: expiresInSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

/** Object keys, defined in one place so the recorder and the API agree. */
export const storageKeys = {
  recording: (campaignId: string, recordingId: string) => `recordings/${campaignId}/${recordingId}.mp4`,
  poster: (campaignId: string, recordingId: string) => `recordings/${campaignId}/${recordingId}.jpg`,
};
