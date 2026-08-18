import { describe, expect, it } from 'vitest';
import { isTransientGenerationError } from '@/app/generation-preview/error-recovery';

describe('generation preview error recovery', () => {
  it('recognizes provider and transport interruptions as retryable', () => {
    expect(isTransientGenerationError(new TypeError('fetch failed'))).toBe(true);
    expect(isTransientGenerationError(new Error('socket hang up'))).toBe(true);
    expect(isTransientGenerationError('ETIMEDOUT')).toBe(true);
  });

  it('does not hide permanent or content-validation failures', () => {
    expect(isTransientGenerationError(new Error('Unauthorized'))).toBe(false);
    expect(isTransientGenerationError(new Error('LLM response could not be parsed'))).toBe(false);
  });
});
