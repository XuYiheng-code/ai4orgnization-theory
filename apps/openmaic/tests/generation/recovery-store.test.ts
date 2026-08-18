import { describe, expect, it } from 'vitest';
import {
  completedSceneOrders,
  missingOutlineIds,
  readGenerationRecovery,
  writeGenerationRecovery,
} from '@/lib/generation/recovery-store';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const params = {
  stageInfo: { name: 'Recoverable course' },
  pdfImages: [
    {
      id: 'image-1',
      src: 'data:image/png;base64,large-payload',
      pageNumber: 1,
      storageId: 'stored-image-1',
    },
  ],
};

describe('generation recovery manifest', () => {
  it('survives a new reader and does not duplicate IndexedDB image bytes', () => {
    const storage = new MemoryStorage();
    writeGenerationRecovery(
      {
        stageId: 'stage-1',
        status: 'generating',
        params,
        completedOrders: [2, 1, 2],
        totalOutlines: 3,
        currentOutlineId: 'outline-3',
      },
      storage,
    );

    const restored = readGenerationRecovery('stage-1', storage);

    expect(restored).toMatchObject({
      status: 'generating',
      completedOrders: [1, 2],
      currentOutlineId: 'outline-3',
    });
    expect(restored?.params.pdfImages?.[0]).toMatchObject({
      storageId: 'stored-image-1',
      src: '',
    });
  });

  it('identifies only missing outlines after an interrupted run', () => {
    const outlines = [
      { id: 'outline-1', order: 1 },
      { id: 'outline-2', order: 2 },
      { id: 'outline-3', order: 3 },
    ];
    const scenes = [{ order: 1 }, { order: 3 }, { order: 3 }];

    expect(completedSceneOrders(scenes)).toEqual([1, 3]);
    expect(missingOutlineIds(outlines, scenes)).toEqual(['outline-2']);
  });

  it('persists the exact failed phase for a later manual continuation', () => {
    const storage = new MemoryStorage();
    writeGenerationRecovery(
      {
        stageId: 'stage-2',
        status: 'failed',
        params,
        completedOrders: [1],
        totalOutlines: 4,
        currentOutlineId: 'outline-2',
        failure: {
          outlineId: 'outline-2',
          phase: 'actions',
          message: 'quota exhausted',
          errorCode: 'QUOTA_EXHAUSTED',
          statusCode: 429,
        },
      },
      storage,
    );

    expect(readGenerationRecovery('stage-2', storage)?.failure).toEqual({
      outlineId: 'outline-2',
      phase: 'actions',
      message: 'quota exhausted',
      errorCode: 'QUOTA_EXHAUSTED',
      statusCode: 429,
    });
  });
});
