const TRANSIENT_GENERATION_ERROR =
  /fetch failed|failed to fetch|network|timeout|timed out|ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|ENOTFOUND|EPIPE|socket hang up/i;

/** Detect transport/provider interruptions that are safe to retry without changing user input. */
export function isTransientGenerationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return TRANSIENT_GENERATION_ERROR.test(message);
}
