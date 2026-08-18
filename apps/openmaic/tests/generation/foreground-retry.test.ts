import { describe, expect, it } from 'vitest';
import {
  FOREGROUND_SCENE_RETRY_OPTIONS,
  OUTLINE_STREAM_RETRY_OPTIONS,
} from '@/app/generation-preview/foreground-retry';

describe('foreground scene retry budget', () => {
  it('allows the visible first scene to recover across a longer outage window', () => {
    expect(FOREGROUND_SCENE_RETRY_OPTIONS).toEqual({
      maxRetries: 4,
      baseDelayMs: 1_500,
      maxDelayMs: 12_000,
    });
  });

  it('retries the whole outline stream after server-side retries are exhausted', () => {
    expect(OUTLINE_STREAM_RETRY_OPTIONS).toEqual({
      maxRetries: 2,
      baseDelayMs: 3_000,
      maxDelayMs: 10_000,
    });
  });
});
