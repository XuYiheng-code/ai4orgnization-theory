import type { AgentInfo } from '@openmaic/generation';
import type { PdfImage } from '@/lib/types/generation';

const RECOVERY_PREFIX = 'openmaic:generation-recovery:';
const RECOVERY_VERSION = 1;

export type GenerationRecoveryStatus = 'generating' | 'paused' | 'failed' | 'completed';
export type GenerationFailurePhase = 'content' | 'actions' | 'tts' | 'persistence' | 'unknown';

export interface PersistedGenerationParams {
  pdfImages?: PdfImage[];
  stageInfo: {
    name: string;
    description?: string;
    language?: string;
    style?: string;
  };
  agents?: AgentInfo[];
  userProfile?: string;
  languageDirective?: string;
}

export interface GenerationRecoveryFailure {
  outlineId: string;
  phase: GenerationFailurePhase;
  message: string;
  errorCode?: string;
  statusCode?: number;
}

export interface GenerationRecoveryRecord {
  version: typeof RECOVERY_VERSION;
  stageId: string;
  status: GenerationRecoveryStatus;
  params: PersistedGenerationParams;
  completedOrders: number[];
  totalOutlines: number;
  currentOutlineId?: string;
  failure?: GenerationRecoveryFailure;
  updatedAt: number;
}

function storageKey(stageId: string): string {
  return `${RECOVERY_PREFIX}${stageId}`;
}

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function sanitizePdfImages(images?: PdfImage[]): PdfImage[] | undefined {
  if (!images) return undefined;
  return images.map((image) => ({
    ...image,
    // Extracted images are kept in IndexedDB. Do not duplicate base64 payloads
    // in localStorage; recovery reconstructs imageMapping from storageId.
    src: image.storageId ? '' : image.src,
  }));
}

export function sanitizeRecoveryParams(
  params: PersistedGenerationParams,
): PersistedGenerationParams {
  return {
    ...params,
    pdfImages: sanitizePdfImages(params.pdfImages),
  };
}

function isRecoveryRecord(value: unknown, stageId: string): value is GenerationRecoveryRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<GenerationRecoveryRecord>;
  return (
    record.version === RECOVERY_VERSION &&
    record.stageId === stageId &&
    typeof record.updatedAt === 'number' &&
    typeof record.totalOutlines === 'number' &&
    Array.isArray(record.completedOrders) &&
    !!record.params?.stageInfo
  );
}

export function readGenerationRecovery(
  stageId: string,
  storage?: Storage,
): GenerationRecoveryRecord | null {
  const target = resolveStorage(storage);
  if (!target) return null;
  try {
    const raw = target.getItem(storageKey(stageId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRecoveryRecord(parsed, stageId) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeGenerationRecovery(
  record: Omit<GenerationRecoveryRecord, 'version' | 'updatedAt'> & {
    updatedAt?: number;
  },
  storage?: Storage,
): GenerationRecoveryRecord | null {
  const target = resolveStorage(storage);
  if (!target) return null;
  const next: GenerationRecoveryRecord = {
    ...record,
    version: RECOVERY_VERSION,
    params: sanitizeRecoveryParams(record.params),
    completedOrders: [...new Set(record.completedOrders)].sort((a, b) => a - b),
    updatedAt: record.updatedAt ?? Date.now(),
  };
  try {
    target.setItem(storageKey(record.stageId), JSON.stringify(next));
    return next;
  } catch {
    // A legacy image without an IndexedDB storageId can still contain a large
    // data URL. Keep the recovery manifest usable by dropping only image bytes;
    // course generation can continue without vision attachments.
    const compact = {
      ...next,
      params: {
        ...next.params,
        pdfImages: next.params.pdfImages?.map((image) => ({ ...image, src: '' })),
      },
    };
    try {
      target.setItem(storageKey(record.stageId), JSON.stringify(compact));
      return compact;
    } catch {
      return null;
    }
  }
}

export function removeGenerationRecovery(stageId: string, storage?: Storage): void {
  const target = resolveStorage(storage);
  if (!target) return;
  target.removeItem(storageKey(stageId));
}

export function completedSceneOrders(scenes: ReadonlyArray<{ order: number }>): number[] {
  return [...new Set(scenes.map((scene) => scene.order))].sort((a, b) => a - b);
}

export function missingOutlineIds(
  outlines: ReadonlyArray<{ id: string; order: number }>,
  scenes: ReadonlyArray<{ order: number }>,
): string[] {
  const completed = new Set(scenes.map((scene) => scene.order));
  return outlines.filter((outline) => !completed.has(outline.order)).map((outline) => outline.id);
}
