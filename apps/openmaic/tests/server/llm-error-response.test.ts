import { describe, expect, it } from 'vitest';
import { llmApiError } from '@/lib/server/llm-error-response';

describe('llmApiError', () => {
  it('distinguishes exhausted quota from temporary rate limiting', async () => {
    const response = llmApiError({
      statusCode: 429,
      message: 'Free quota exhausted. Add funds or disable free tier only mode.',
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'QUOTA_EXHAUSTED',
    });
  });

  it('keeps an ordinary 429 retryable as a rate limit', async () => {
    const response = llmApiError({ statusCode: 429, message: 'Too many requests' });

    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'RATE_LIMITED',
    });
  });
});
