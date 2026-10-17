import { S3Client } from "bun";
import { objectStorage, objectStorageConfigured } from "./env.ts";

/**
 * Cloudflare R2 (S3-compatible) copy of every audio file.
 * The local disk stays the first place a file is written (fast + atomic); R2 is the durable
 * off-server copy and the source for restoring files missing on disk.
 */

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      accessKeyId: objectStorage.accessKeyId,
      secretAccessKey: objectStorage.secretAccessKey,
      endpoint: objectStorage.endpoint,
      bucket: objectStorage.bucket,
      region: "auto",
    });
  }
  return client;
}

export const objectStoreEnabled = objectStorageConfigured;

/** Object key mirrors the relative path on disk: recordings/<id>/<00000>.<ext> */
export const objectKey = (relPath: string) => relPath.replace(/\\/g, "/").replace(/^\/+/, "");

export async function putObject(key: string, data: Uint8Array, type: string): Promise<void> {
  await s3().write(key, data, { type });
  // verify: size must match what we sent
  const stat = await s3().stat(key);
  if (stat.size !== data.byteLength) throw new Error(`R2 size mismatch for ${key}: ${stat.size} != ${data.byteLength}`);
}

export async function getObject(key: string): Promise<Uint8Array> {
  return new Uint8Array(await s3().file(key).arrayBuffer());
}

export async function deleteObject(key: string): Promise<void> {
  await s3().delete(key);
}
