import { createHash, randomUUID } from "node:crypto";
import { getRedisClient } from "@/lib/redis";

const limit = 5;
const windowMs = 60 * 60_000;

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  reset: number;
  reason?: "limited" | "unavailable";
};

/**
 * Production Caddy overwrites X-Real-IP with the connecting client. Prefer
 * that hop; fall back to the left-most X-Forwarded-For only for local stacks
 * that do not set X-Real-IP. Direct-to-app traffic can still spoof these
 * headers — the trusted edge is the gate.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return realIp || forwardedFor || "unknown";
}

const slidingWindowScript = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, ARGV[1] - ARGV[2])
local count = redis.call("ZCARD", KEYS[1])
if count >= tonumber(ARGV[3]) then
  local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
  return {0, 0, tonumber(oldest[2]) + tonumber(ARGV[2])}
end
redis.call("ZADD", KEYS[1], ARGV[1], ARGV[4])
redis.call("PEXPIRE", KEYS[1], ARGV[2])
return {1, tonumber(ARGV[3]) - count - 1, tonumber(ARGV[1]) + tonumber(ARGV[2])}
`;

/**
 * Sliding-window limit on the caller's IP, in its own Redis key namespace so two
 * public endpoints cannot exhaust each other's budget. Fails *closed* in
 * production when Redis is missing or unreachable and open in development —
 * that asymmetry predates this function and is preserved deliberately: an
 * unmetered public write path is worse than a temporary outage.
 */
async function limitByIp(
  request: Request,
  options: { namespace: string; limit: number; windowMs: number },
): Promise<RateLimitResult> {
  return limitByIdentity(clientIpFromHeaders(request.headers), options);
}

async function limitByIdentity(
  identity: string,
  options: { namespace: string; limit: number; windowMs: number },
): Promise<RateLimitResult> {
  if (!process.env.REDIS_URL) {
    if (process.env.NODE_ENV === "production") {
      return {
        success: false,
        remaining: 0,
        reset: Date.now() + 60_000,
        reason: "unavailable",
      };
    }
    return {
      success: true,
      remaining: options.limit,
      reset: Date.now() + options.windowMs,
    };
  }

  const key = rateLimitIdentityKey(options.namespace, identity);
  try {
    const now = Date.now();
    const redis = await getRedisClient();
    const result = await redis.eval(slidingWindowScript, {
      keys: [key],
      arguments: [
        String(now),
        String(options.windowMs),
        String(options.limit),
        `${now}:${randomUUID()}`,
      ],
    });
    if (!Array.isArray(result) || result.length !== 3) {
      throw new Error("Redis returned an invalid rate-limit result");
    }
    const [success, remaining, reset] = result.map(Number);
    if (
      !Number.isFinite(success) ||
      !Number.isFinite(remaining) ||
      !Number.isFinite(reset)
    ) {
      throw new Error("Redis returned an invalid rate-limit result");
    }
    return {
      success: success === 1,
      remaining,
      reset,
      reason: success === 1 ? undefined : "limited",
    };
  } catch {
    return {
      success: false,
      remaining: 0,
      reset: Date.now() + 60_000,
      reason: "unavailable",
    };
  }
}

export function rateLimitIdentityKey(
  namespace: string,
  identity: string,
): string {
  const identifier = createHash("sha256").update(identity).digest("hex");
  return `cornershopdev:${namespace}:${identifier}`;
}

export function limitPublicPreview(request: Request): Promise<RateLimitResult> {
  return limitByIp(request, { namespace: "preview", limit, windowMs });
}

/**
 * Booking requests get a separate, slightly looser bucket: a household
 * legitimately sends more than one (a correction, a second party) and the write
 * is far cheaper than an import, but it still ends in an email to the owner, so
 * it stays metered.
 */
export function limitBookingRequest(
  request: Request,
): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "booking-request",
    limit: 8,
    windowMs,
  });
}

/**
 * Analytics has a deliberately generous, short bucket. A limiter outage or a
 * full bucket makes the ingest route drop the event with a successful empty
 * response; customer navigation never inherits Redis availability.
 */
export function limitAnalyticsEvent(
  request: Request,
): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "analytics-event",
    limit: 120,
    windowMs: 60_000,
  });
}

export function limitClaimInvitationRequest(
  request: Request,
): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "claim-invitation",
    limit: 5,
    windowMs,
  });
}

export function limitClaimCheckout(request: Request): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "claim-checkout",
    limit: 10,
    windowMs,
  });
}

export function limitTranslationRegeneration(
  request: Request,
): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "translation-regeneration",
    limit: 12,
    windowMs,
  });
}

export function limitOperatorClaimInvitation(
  request: Request,
): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "operator-claim-invitation",
    limit: 30,
    windowMs,
  });
}

export function limitOperatorLeadMutation(
  request: Request,
): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "operator-lead",
    limit: 30,
    windowMs,
  });
}

/**
 * Laptop discovery posts one prospect per restaurant. A 50-city run plus a
 * safe retry budget has to fit the hourly window without sharing the cookie
 * admin-import bucket.
 */
export function limitOperatorLeadIngest(
  request: Request,
): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "operator-lead-ingest",
    limit: 80,
    windowMs,
  });
}

export async function limitMagicLinkRequest(
  request: Request,
  normalizedEmail: string,
): Promise<RateLimitResult> {
  const options = { limit: 5, windowMs: 15 * 60_000 };
  const [ip, email] = await Promise.all([
    limitByIp(request, { ...options, namespace: "magic-link-ip" }),
    limitByIdentity(normalizedEmail, {
      ...options,
      namespace: "magic-link-email",
    }),
  ]);
  if (!ip.success || !email.success) {
    const unavailable = [ip, email].find(
      (result) => result.reason === "unavailable",
    );
    const failure = unavailable ?? (!ip.success ? ip : email);
    return {
      success: false,
      remaining: 0,
      reset: Math.max(ip.reset, email.reset),
      reason: failure.reason,
    };
  }
  return {
    success: true,
    remaining: Math.min(ip.remaining, email.remaining),
    reset: Math.max(ip.reset, email.reset),
  };
}

export function limitOperatorAuthRetry(
  request: Request,
): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "operator-auth-retry",
    limit: 20,
    windowMs,
  });
}

/**
 * A batch import can carry many leads in one request, so this stays looser
 * than `limitOperatorLeadMutation` (which meters one lead per request) while
 * still bounding how many batches an operator session can kick off per hour.
 */
export function limitOperatorLeadBatch(
  request: Request,
): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "operator-lead-batch",
    limit: 30,
    windowMs,
  });
}

export function limitOperatorOutreachPause(
  request: Request,
): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "operator-outreach-pause",
    limit: 30,
    windowMs,
  });
}

export function limitOperatorOutreachSend(
  request: Request,
): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "operator-outreach-send",
    limit: 20,
    windowMs,
  });
}

/** Image edits are provider-billed and can fan out into a bounded batch. */
export function limitPhotoEnhancement(request: Request): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "photo-enhancement",
    limit: 6,
    windowMs: 60_000,
  });
}

/** Owner uploads/references are cheaper but still write durable object storage. */
export function limitPhotoIngest(request: Request): Promise<RateLimitResult> {
  return limitByIp(request, {
    namespace: "photo-ingest",
    limit: 20,
    windowMs: 60 * 60_000,
  });
}
