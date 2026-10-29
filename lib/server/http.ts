import { createHash } from 'node:crypto';
import type { RateLimitInfo } from './store';

export type JsonBodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

/**
 * Reads a JSON object body with a hard byte cap. Streams rather than trusting
 * Content-Length, because chunked requests can lie about (or omit) their size.
 */
export async function readJsonObject(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return { ok: false, status: 415, error: 'Content-Type must be application/json.' };
  }

  const lengthHeader = request.headers.get('content-length');
  if (lengthHeader !== null) {
    const length = Number(lengthHeader);
    if (!Number.isFinite(length) || length < 0) {
      return { ok: false, status: 400, error: 'Invalid Content-Length header.' };
    }
    if (length > maxBytes) {
      return { ok: false, status: 413, error: `Request body must be at most ${maxBytes} bytes.` };
    }
  }

  const body = request.body;
  if (!body) return { ok: false, status: 400, error: 'Request body is required.' };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413, error: `Request body must be at most ${maxBytes} bytes.` };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: 'Could not read the request body.' };
  }

  if (total === 0) return { ok: false, status: 400, error: 'Request body is required.' };

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, status: 400, error: 'Request body must be valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: 'Request body must be a JSON object.' };
  }

  return { ok: true, value: parsed as Record<string, unknown> };
}

/** Vercel sets x-forwarded-for; the first entry is the client. Best effort only. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Raw IPs never enter the store; a salted hash is enough for rate limiting. */
export function hashClientIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_SALT ?? 'echo-heist-v1';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 24);
}

export function rateLimitHeaders(info: RateLimitInfo): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(info.limit),
    'X-RateLimit-Remaining': String(info.remaining),
    'X-RateLimit-Reset': String(Math.ceil(info.resetAt / 1000)),
  };
}

export function retryAfterSeconds(info: RateLimitInfo): number {
  return Math.max(1, Math.ceil((info.resetAt - Date.now()) / 1000));
}
