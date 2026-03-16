import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

const RATE_LIMIT_MESSAGE =
  "You've been chatting a lot! Email us at hello@orchestrator-ai.com for more help.";

/**
 * Per-session and per-IP usage caps for guest sessions.
 * All counters are in-memory and reset daily.
 *
 * Limits enforced:
 *   - 50 messages per session
 *   - 10 sessions created per IP per day
 *   - 10,000 TTS characters per session
 *   - 1,000 total messages across all guest sessions per day (global cap)
 */

interface SessionUsage {
  messageCount: number;
  ttsCharCount: number;
  dayKey: string; // "YYYY-MM-DD" — used to detect day rollover
}

interface IpUsage {
  sessionCount: number;
  dayKey: string;
}

interface GlobalUsage {
  messageCount: number;
  dayKey: string;
}

const PER_SESSION_MESSAGE_LIMIT = 50;
const PER_SESSION_TTS_CHAR_LIMIT = 10_000;
const PER_IP_SESSION_LIMIT = 10;
const DAILY_GLOBAL_MESSAGE_CAP = 1_000;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// Module-level singletons — shared across all guard instances in the process.
// NestJS creates one guard instance per injection scope; using module-level Maps
// ensures state is truly shared regardless of injection scope.
const sessionUsageMap = new Map<string, SessionUsage>();
const ipUsageMap = new Map<string, IpUsage>();
let globalUsage: GlobalUsage = { messageCount: 0, dayKey: todayKey() };

/**
 * Reset counters when the calendar day rolls over.
 */
function refreshDayIfNeeded(today: string): void {
  if (globalUsage.dayKey !== today) {
    globalUsage = { messageCount: 0, dayKey: today };
  }
}

export function incrementSessionMessageCount(sessionId: string): void {
  const today = todayKey();
  refreshDayIfNeeded(today);
  const usage = getSessionUsage(sessionId);
  usage.messageCount += 1;
  globalUsage.messageCount += 1;
}

/**
 * Rollback a prior incrementSessionMessageCount. Used when reserve-then-validate
 * finds the limit would be exceeded after the increment.
 */
function decrementSessionMessageCount(sessionId: string): void {
  const usage = sessionUsageMap.get(sessionId);
  if (usage && usage.messageCount > 0) {
    usage.messageCount -= 1;
  }
  if (globalUsage.messageCount > 0) {
    globalUsage.messageCount -= 1;
  }
}

export function incrementSessionTtsChars(
  sessionId: string,
  charCount: number,
): void {
  const today = todayKey();
  refreshDayIfNeeded(today);
  const usage = getSessionUsage(sessionId);
  usage.ttsCharCount += charCount;
}

/**
 * Rollback a prior incrementSessionTtsChars. Used when reserve-then-validate
 * finds the TTS limit would be exceeded after the increment.
 */
function decrementSessionTtsChars(sessionId: string, charCount: number): void {
  const usage = sessionUsageMap.get(sessionId);
  if (usage && usage.ttsCharCount >= charCount) {
    usage.ttsCharCount -= charCount;
  }
}

function getSessionUsage(sessionId: string): SessionUsage {
  const today = todayKey();
  let usage = sessionUsageMap.get(sessionId);
  if (!usage || usage.dayKey !== today) {
    usage = { messageCount: 0, ttsCharCount: 0, dayKey: today };
    sessionUsageMap.set(sessionId, usage);
  }
  return usage;
}

function getIpUsage(ip: string): IpUsage {
  const today = todayKey();
  let usage = ipUsageMap.get(ip);
  if (!usage || usage.dayKey !== today) {
    usage = { sessionCount: 0, dayKey: today };
    ipUsageMap.set(ip, usage);
  }
  return usage;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const today = todayKey();

    refreshDayIfNeeded(today);

    const path: string = request.path ?? '';
    const isSessionCreate = path.endsWith('/customer-service/session');
    const isTtsSynthesize =
      path.endsWith('/speech/synthesize') ||
      path.endsWith('/speech/synthesize-stream');

    let ip: string | null = null;
    try {
      ip = this.extractIp(request);
    } catch (err) {
      this.logger.warn(
        `Rate limit: could not determine client IP (${err instanceof Error ? err.message : String(err)}). Allowing request; rate limiting skipped for this request.`,
      );
      return true;
    }

    // --- Session creation: reserve slot first, then validate (avoids concurrent bypass) ---
    if (isSessionCreate) {
      const ipUsage = getIpUsage(ip);
      ipUsage.sessionCount += 1;
      if (ipUsage.sessionCount > PER_IP_SESSION_LIMIT) {
        ipUsage.sessionCount -= 1;
        this.logger.warn(
          `Rate limit: IP ${ip} exceeded ${PER_IP_SESSION_LIMIT} sessions/day`,
        );
        throw new HttpException(
          {
            message: RATE_LIMIT_MESSAGE,
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    }

    // For all other endpoints, extract the session token to identify the session.
    // For Bearer auth (authenticated users) without a guest session, use synthetic sessionIds
    // per endpoint so rate limits apply: same per-session and global caps as guest sessions.
    let sessionId = this.extractSessionId(request);
    if (!sessionId && ip !== null) {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        if (path.endsWith('/customer-service/save')) {
          sessionId = `save:ip:${ip}`;
        } else if (path.endsWith('/customer-service/converse')) {
          sessionId = `converse:ip:${ip}`;
        } else if (
          path.endsWith('/speech/synthesize') ||
          path.endsWith('/speech/synthesize-stream') ||
          path.endsWith('/speech/transcribe')
        ) {
          sessionId = `speech:ip:${ip}`;
        }
      }
    }

    if (!sessionId) {
      // For speech endpoints, require either a guest session token or Bearer auth.
      // Allowing unauthenticated access here would expose ElevenLabs/Deepgram keys
      // without any rate limiting. Controllers are marked @Public(), so this guard
      // is the only protection.
      if (path.startsWith('/speech/')) {
        this.logger.warn(
          `Rate limit: rejecting unauthenticated speech request to ${path} with no session token or Bearer auth`,
        );
        throw new HttpException(
          {
            message:
              'GuestSession or Bearer authorization is required for speech endpoints.',
            statusCode: HttpStatus.UNAUTHORIZED,
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      // For non-speech endpoints, let dedicated guards/controllers handle
      // authentication and validation.
      return true;
    }

    // --- TTS: reserve chars first, then validate (avoids concurrent bypass) ---
    if (isTtsSynthesize) {
      const body = request.body as Record<string, unknown> | undefined;
      const text = typeof body?.text === 'string' ? body.text : '';
      const incoming = text.length;

      incrementSessionTtsChars(sessionId, incoming);
      const usageAfter = getSessionUsage(sessionId);
      if (usageAfter.ttsCharCount > PER_SESSION_TTS_CHAR_LIMIT) {
        decrementSessionTtsChars(sessionId, incoming);
        this.logger.warn(
          `Rate limit: session ${sessionId} exceeded TTS char limit ` +
            `(used=${usageAfter.ttsCharCount}, limit=${PER_SESSION_TTS_CHAR_LIMIT})`,
        );
        throw new HttpException(
          {
            message: RATE_LIMIT_MESSAGE,
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    }

    // --- Converse / save: reserve slot first, then validate (avoids concurrent bypass) ---
    const isConverse = path.endsWith('/customer-service/converse');
    const isSave = path.endsWith('/customer-service/save');
    if (isConverse || isSave) {
      incrementSessionMessageCount(sessionId);
      const usageAfter = getSessionUsage(sessionId);
      const exceededSessionLimit =
        usageAfter.messageCount > PER_SESSION_MESSAGE_LIMIT;
      const exceededGlobalLimit =
        globalUsage.messageCount > DAILY_GLOBAL_MESSAGE_CAP;
      if (exceededSessionLimit || exceededGlobalLimit) {
        decrementSessionMessageCount(sessionId);
        if (exceededGlobalLimit) {
          this.logger.warn(
            `Rate limit: global daily cap of ${DAILY_GLOBAL_MESSAGE_CAP} messages reached`,
          );
        } else if (exceededSessionLimit) {
          this.logger.warn(
            `Rate limit: session ${sessionId} exceeded ${PER_SESSION_MESSAGE_LIMIT} messages`,
          );
        }
        throw new HttpException(
          {
            message: RATE_LIMIT_MESSAGE,
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }

  private extractIp(request: Request): string {
    return getClientIp(request);
  }

  private extractSessionId(request: Request): string | null {
    // Mirror GuestSessionGuard's extraction logic — only guest sessions
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('GuestSession ')) {
      const token = authHeader.slice('GuestSession '.length).trim();
      return token || null;
    }

    const body = request.body as Record<string, unknown> | undefined;
    if (body?.sessionToken && typeof body.sessionToken === 'string') {
      return body.sessionToken;
    }

    return null;
  }
}

/**
 * Get client IP for rate-limiting. Exported so the save handler can use the same
 * key ("save:ip:<ip>") when incrementing the count for Bearer-authenticated users.
 * Throws if the client IP cannot be determined so rate limiting is not applied to
 * a non-unique key.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const raw = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(',')[0];
    if (raw) {
      return raw.trim();
    }
  }
  const direct = request.socket?.remoteAddress;
  if (direct) {
    return direct;
  }
  throw new Error(
    'Client IP could not be determined (no x-forwarded-for header and request.socket.remoteAddress is unavailable). Rate limiting cannot be applied correctly.',
  );
}
