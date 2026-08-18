/**
 * Give the outline stream a second recovery window after its server-side retries.
 * A slightly longer delay avoids immediately re-entering the same transient outage.
 */
export const OUTLINE_STREAM_RETRY_OPTIONS = {
  maxRetries: 2,
  baseDelayMs: 3_000,
  maxDelayMs: 10_000,
} as const;

/** Keep the first visible scene resilient when an upstream provider is unhealthy. */
export const FOREGROUND_SCENE_RETRY_OPTIONS = {
  maxRetries: 4,
  baseDelayMs: 1_500,
  maxDelayMs: 12_000,
} as const;
