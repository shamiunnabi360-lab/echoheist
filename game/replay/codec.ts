import type { Direction, GhostRecording } from '../sim/types';

/**
 * Compact, URL-safe encoding for a whole winning solution.
 *
 * Bundle JSON is deliberately tiny (change-only frames), then deflate-raw
 * compressed and base64url encoded:
 *
 *   /replay/z<base64url(deflateRaw(JSON))>
 *
 * Browsers without CompressionStream fall back to prefix "u" + base64url(JSON),
 * which every modern browser can decode. The server rejects oversized payloads
 * and caps decompressed output so a crafted link cannot exhaust memory.
 */
export const SHARE_VERSION = 1;
export const MAX_SHARE_ID_LENGTH = 12_000;

const PREFIX_DEFLATE = 'z';
const PREFIX_PLAIN = 'u';

const MAX_RUNS = 8;
const MAX_FRAMES_PER_RUN = 20_000;
const MAX_FRAMES_TOTAL = 60_000;
const MAX_END_TICK = 1_000_000;
const MAX_RAW_BYTES = 256 * 1024;

/** [tick, dx, dy] or [tick, dx, dy, 1] when the action key is held. */
export type CompactFrame = [number, number, number] | [number, number, number, 1];

export interface ShareRun {
  /** First tick the run is no longer simulated (the ghost holds still). */
  end: number;
  frames: CompactFrame[];
}

export interface ShareBundle {
  v: 1;
  level: number;
  runs: ShareRun[];
}

export class ShareCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareCodecError';
  }
}

export function packShare(levelId: number, recordings: GhostRecording[]): ShareBundle {
  const runs: ShareRun[] = recordings.map((recording) => ({
    end: recording.endTick,
    frames: recording.frames.map((frame) =>
      frame.action
        ? ([frame.tick, frame.dx, frame.dy, 1] as CompactFrame)
        : ([frame.tick, frame.dx, frame.dy] as CompactFrame),
    ),
  }));
  return validateBundle({ v: SHARE_VERSION, level: levelId, runs });
}

export function unpackShare(bundle: ShareBundle): GhostRecording[] {
  return bundle.runs.map((run) => ({
    endTick: run.end,
    frames: run.frames.map(([tick, dx, dy, action]) => ({
      tick,
      dx: dx as Direction,
      dy: dy as Direction,
      action: action === 1,
    })),
  }));
}

export async function encodeShareId(bundle: ShareBundle): Promise<string> {
  const clean = validateBundle(bundle);
  const raw = new TextEncoder().encode(JSON.stringify(clean));
  if (raw.byteLength > MAX_RAW_BYTES) {
    throw new ShareCodecError('This solution is too large to share.');
  }

  let id: string;
  if (supportsCompression()) {
    const compressed = await deflateRaw(raw);
    id = PREFIX_DEFLATE + toBase64Url(compressed);
  } else {
    id = PREFIX_PLAIN + toBase64Url(raw);
  }

  if (id.length > MAX_SHARE_ID_LENGTH) {
    // Compressed solutions are only a few hundred bytes; this means the input
    // is pathological, not just a busy level.
    throw new ShareCodecError('This solution is too large to share as a link.');
  }
  return id;
}

export async function decodeShareId(id: string): Promise<ShareBundle> {
  if (typeof id !== 'string' || id.length < 2 || id.length > MAX_SHARE_ID_LENGTH) {
    throw new ShareCodecError('Replay link has an invalid length.');
  }

  const prefix = id[0];
  const bytes = fromBase64Url(id.slice(1));

  let raw: Uint8Array;
  if (prefix === PREFIX_DEFLATE) {
    if (!supportsCompression()) {
      throw new ShareCodecError('This browser cannot open compressed replay links.');
    }
    try {
      raw = await inflateRawCapped(bytes);
    } catch (error) {
      if (error instanceof ShareCodecError) throw error;
      throw new ShareCodecError('Replay data is corrupted or incomplete.');
    }
  } else if (prefix === PREFIX_PLAIN) {
    if (bytes.byteLength > MAX_RAW_BYTES) {
      throw new ShareCodecError('Replay data is too large.');
    }
    raw = bytes;
  } else {
    throw new ShareCodecError('Replay link has an unknown format.');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    throw new ShareCodecError('Replay data is not valid UTF-8.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ShareCodecError('Replay data is not valid JSON.');
  }
  return validateBundle(parsed);
}

/** Structural validation and normalization. Never trusts the input shape. */
export function validateBundle(raw: unknown): ShareBundle {
  if (!isRecord(raw)) throw new ShareCodecError('Replay data must be an object.');
  if (raw.v !== SHARE_VERSION) throw new ShareCodecError('Unsupported replay version.');
  if (!isInt(raw.level) || raw.level < 1 || raw.level > 999) {
    throw new ShareCodecError('Replay data has an invalid level.');
  }
  if (!Array.isArray(raw.runs) || raw.runs.length < 1 || raw.runs.length > MAX_RUNS) {
    throw new ShareCodecError(`Replay data must contain 1-${MAX_RUNS} runs.`);
  }

  const runs: ShareRun[] = [];
  let totalFrames = 0;

  for (let r = 0; r < raw.runs.length; r += 1) {
    const rawRun = raw.runs[r];
    if (!isRecord(rawRun)) throw new ShareCodecError(`Run ${r + 1} is not an object.`);
    if (!isInt(rawRun.end) || rawRun.end < 0 || rawRun.end > MAX_END_TICK) {
      throw new ShareCodecError(`Run ${r + 1} has an invalid end tick.`);
    }
    if (!Array.isArray(rawRun.frames) || rawRun.frames.length > MAX_FRAMES_PER_RUN) {
      throw new ShareCodecError(`Run ${r + 1} has too many input frames.`);
    }

    totalFrames += rawRun.frames.length;
    if (totalFrames > MAX_FRAMES_TOTAL) throw new ShareCodecError('Replay data has too many input frames.');

    const frames: CompactFrame[] = [];
    let lastTick = -1;

    for (let f = 0; f < rawRun.frames.length; f += 1) {
      const rawFrame = rawRun.frames[f];
      if (!Array.isArray(rawFrame) || (rawFrame.length !== 3 && rawFrame.length !== 4)) {
        throw new ShareCodecError(`Run ${r + 1} has a malformed input frame.`);
      }
      const tick = rawFrame[0];
      const dx = rawFrame[1];
      const dy = rawFrame[2];
      const action = rawFrame[3];

      if (!isInt(tick) || tick < 0 || tick >= rawRun.end) {
        throw new ShareCodecError(`Run ${r + 1} has an out-of-range frame tick.`);
      }
      if (tick <= lastTick) {
        throw new ShareCodecError(`Run ${r + 1} has unordered frame ticks.`);
      }
      if (!isInt(dx) || dx < -1 || dx > 1 || !isInt(dy) || dy < -1 || dy > 1) {
        throw new ShareCodecError(`Run ${r + 1} has an invalid direction.`);
      }
      if (rawFrame.length === 4 && action !== 1) {
        throw new ShareCodecError(`Run ${r + 1} has an invalid action flag.`);
      }

      frames.push(rawFrame.length === 4 ? [tick, dx, dy, 1] : [tick, dx, dy]);
      lastTick = tick;
    }

    runs.push({ end: rawRun.end, frames });
  }

  return { v: SHARE_VERSION, level: raw.level, runs };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function supportsCompression(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

function arrayBufferBacked(bytes: Uint8Array) {
  // A fresh view guarantees an ArrayBuffer (not SharedArrayBuffer) backing,
  // which is what Response/Blob accept.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const body = new Response(arrayBufferBacked(bytes)).body;
  if (!body) throw new ShareCodecError('Could not compress replay data.');
  const stream = body.pipeThrough(new CompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function inflateRawCapped(bytes: Uint8Array): Promise<Uint8Array> {
  const body = new Response(arrayBufferBacked(bytes)).body;
  if (!body) throw new ShareCodecError('Replay data is empty.');

  const reader = body.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RAW_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ShareCodecError('Replay data is too large.');
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (text.length === 0 || !/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new ShareCodecError('Replay link is not valid base64url.');
  }

  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  if (padding === 3) throw new ShareCodecError('Replay link is not valid base64url.');

  let binary: string;
  try {
    binary = atob(base64 + '='.repeat(padding));
  } catch {
    throw new ShareCodecError('Replay link is not valid base64url.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
