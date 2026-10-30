import { afterAll, beforeAll, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { toAdts } from "./convert.ts";
import { parseAdts, splitAdts } from "./adts.ts";

let dir: string;
let m4a: Uint8Array;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "classnevis-test-"));
  const file = path.join(dir, "lecture.m4a");
  const p = Bun.spawn(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=250", "-c:a", "aac", "-b:a", "64k", file], { stdout: "ignore", stderr: "pipe" });
  const error = await new Response(p.stderr).text();
  if (await p.exited !== 0) throw new Error(error);
  m4a = new Uint8Array(await fs.readFile(file));
});

afterAll(async () => { if (dir) await fs.rm(dir, { recursive: true, force: true }); });

test("M4A with trailing moov index converts completely and splits without losing frames", async () => {
  const data = Buffer.from(m4a);
  expect(data.indexOf("moov")).toBeGreaterThan(data.indexOf("mdat") + 32_768);
  const audio = await toAdts(m4a);
  expect(audio).not.toBeNull();
  const info = parseAdts(audio!);
  expect(Math.abs(info.durationMs - 250_000)).toBeLessThan(200);
  const chunks = splitAdts(audio!, info, 120_000, 15_000, 8 * 1024 * 1024);
  expect(chunks.length).toBe(2);
  expect(chunks.reduce((sum, chunk) => sum + parseAdts(chunk).frames, 0)).toBe(info.frames);
  expect(Buffer.concat(chunks)).toEqual(Buffer.from(audio!));
});

test("byte cap still holds when a short tail would otherwise be merged", async () => {
  const audio = (await toAdts(m4a))!;
  const chunks = splitAdts(audio, parseAdts(audio), 120_000, 60_000, 100_000);
  expect(chunks.length).toBeGreaterThan(2);
  expect(chunks.every(chunk => chunk.byteLength <= 100_000)).toBe(true);
  expect(Buffer.concat(chunks)).toEqual(Buffer.from(audio));
});

test("invalid audio fails conversion instead of being sent as one original file", async () => {
  await expect(toAdts(new TextEncoder().encode("not audio"))).rejects.toThrow("ffmpeg");
});
