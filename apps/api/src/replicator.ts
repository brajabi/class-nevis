import { prisma } from "./db.ts";
import { deleteObject, getObject, objectKey, objectStoreEnabled, putObject } from "./objectStore.ts";
import { absPath, fileExists, mimeForFormat, writeFileAtomic } from "./storage.ts";
import fs from "node:fs/promises";

/**
 * Copies every segment file to object storage, in the background, forever retrying.
 * Nothing is ever deleted locally because of replication.
 */

const queue = new Set<string>();
const backoff = new Map<string, { attempts: number; until: number }>();
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function enqueueReplication(segmentId: string): void {
  if (!objectStoreEnabled()) return;
  queue.add(segmentId);
  void drain();
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (true) {
      const now = Date.now();
      const next = [...queue].find((id) => (backoff.get(id)?.until ?? 0) <= now);
      if (!next) break;
      queue.delete(next);
      await replicateOne(next);
    }
  } finally {
    running = false;
  }
  // something is waiting on backoff: check again later
  if (queue.size && !timer) {
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, 15_000);
  }
}

async function replicateOne(id: string): Promise<void> {
  const seg = await prisma.segment.findUnique({ where: { id } });
  if (!seg || seg.remoteAt) return;
  try {
    if (!(await fileExists(seg.filePath))) throw new Error("local file missing");
    const bytes = new Uint8Array(await fs.readFile(absPath(seg.filePath)));
    const key = objectKey(seg.filePath);
    await putObject(key, bytes, mimeForFormat(seg.format));
    await prisma.segment.update({ where: { id }, data: { remoteKey: key, remoteAt: new Date() } });
    backoff.delete(id);
    console.log(`[r2] ✓ ${seg.recordingId}#${seg.index} → ${key} (${bytes.byteLength}B)`);
  } catch (e) {
    const b = backoff.get(id) ?? { attempts: 0, until: 0 };
    b.attempts += 1;
    b.until = Date.now() + Math.min(10 * 60_000, 5_000 * 2 ** (b.attempts - 1));
    backoff.set(id, b);
    queue.add(id);
    console.warn(`[r2] ✗ ${seg.recordingId}#${seg.index} attempt ${b.attempts}: ${(e as Error).message}`);
  }
}

/** On boot: queue everything not yet in object storage. */
export async function startReplicator(): Promise<void> {
  if (!objectStoreEnabled()) {
    console.warn("⚠️  CF_ACCESS_KEY_ID / CF_SECRET_ACCESS_KEY تنظیم نشده‌اند — فایل‌ها فقط روی دیسک سرور ذخیره می‌شوند.");
    return;
  }
  const pending = await prisma.segment.findMany({ where: { remoteAt: null }, select: { id: true }, orderBy: { createdAt: "asc" } });
  for (const p of pending) queue.add(p.id);
  console.log(`[r2] replicator started; ${pending.length} segment(s) to copy`);
  void drain();
}

/**
 * Makes sure the segment's file exists on local disk, restoring it from object storage
 * if needed. Returns false if neither copy exists.
 */
export async function ensureLocalFile(seg: { filePath: string; remoteKey: string | null }): Promise<boolean> {
  if (await fileExists(seg.filePath)) return true;
  if (!objectStoreEnabled()) return false;
  try {
    const bytes = await getObject(seg.remoteKey ?? objectKey(seg.filePath));
    if (!bytes.byteLength) return false;
    await writeFileAtomic(seg.filePath, bytes);
    console.log(`[r2] restored ${seg.filePath} from object storage`);
    return true;
  } catch (e) {
    console.warn(`[r2] restore failed for ${seg.filePath}: ${(e as Error).message}`);
    return false;
  }
}

export async function deleteRemoteFiles(keys: string[]): Promise<void> {
  if (!objectStoreEnabled()) return;
  for (const key of keys) {
    try {
      await deleteObject(key);
    } catch (e) {
      console.warn(`[r2] delete failed for ${key}: ${(e as Error).message}`);
    }
  }
}
