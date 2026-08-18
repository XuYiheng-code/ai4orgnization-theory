import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { defaultTheme } from '../fixtures/test-data/scene-content';

const STAGE_ID = 'e2e-generation-checkpoint-resume';
const OUTLINE_COUNT = 10;
const SAVED_SCENE_COUNT = 8;

function makeOutline(order: number) {
  return {
    id: `outline-${order}`,
    type: 'slide' as const,
    title: `Checkpoint scene ${order}`,
    description: `Resume checkpoint scene ${order}.`,
    keyPoints: [`Point ${order}`],
    order,
  };
}

function makeScene(stageId: string, order: number) {
  return {
    id: `scene-${order}`,
    stageId,
    type: 'slide' as const,
    title: `Checkpoint scene ${order}`,
    order,
    content: {
      type: 'slide' as const,
      canvas: {
        id: `slide-${order}`,
        viewportSize: 1000,
        viewportRatio: 0.5625,
        theme: defaultTheme,
        elements: [
          {
            id: `title-${order}`,
            type: 'text',
            content: `Checkpoint scene ${order}`,
            left: 80,
            top: 80,
            width: 820,
            height: 80,
          },
        ],
      },
    },
    actions: [
      {
        id: `speech-${order}`,
        type: 'speech' as const,
        agent: 'teacher',
        text: `This is checkpoint scene ${order}.`,
      },
    ],
  };
}

async function seedCheckpointCourse(page: Page) {
  await page.addInitScript(
    (settings) => {
      localStorage.setItem('maic:account:settings-storage', settings);
    },
    createSettingsStorage({ ttsEnabled: false, parallelSceneConcurrency: 0 }),
  );

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(
    async ({ stageId, outlineCount, savedSceneCount }) => {
      const open = indexedDB.open('maic-documents', 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        db.createObjectStore('stages', { keyPath: 'id' });
        const scenes = db.createObjectStore('scenes', { keyPath: ['stageId', 'id'] });
        scenes.createIndex('by-stage', 'stageId');
        db.createObjectStore('outlines', { keyPath: 'stageId' });
      };

      const db: IDBDatabase = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });

      const now = Date.now();
      const outlines = Array.from({ length: outlineCount }, (_, index) => {
        const order = index + 1;
        return {
          id: `outline-${order}`,
          type: 'slide',
          title: `Checkpoint scene ${order}`,
          description: `Resume checkpoint scene ${order}.`,
          keyPoints: [`Point ${order}`],
          order,
        };
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['stages', 'scenes', 'outlines'], 'readwrite');
        tx.objectStore('stages').put({
          id: stageId,
          name: 'Checkpoint resume deck',
          description: 'A partially generated course used to verify checkpoint resume.',
          language: 'en-US',
          style: 'professional',
          createdAt: now,
          updatedAt: now,
          dslVersion: '0.1.0',
        });
        for (let order = 1; order <= savedSceneCount; order += 1) {
          tx.objectStore('scenes').put({
            id: `scene-${order}`,
            stageId,
            type: 'slide',
            title: `Checkpoint scene ${order}`,
            order,
            content: {
              type: 'slide',
              canvas: {
                id: `slide-${order}`,
                viewportSize: 1000,
                viewportRatio: 0.5625,
                theme: {
                  backgroundColor: '#ffffff',
                  themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
                  fontColor: '#333333',
                  fontName: 'Microsoft Yahei',
                },
                elements: [],
              },
            },
            actions: [
              {
                id: `speech-${order}`,
                type: 'speech',
                agent: 'teacher',
                text: `This is checkpoint scene ${order}.`,
              },
            ],
            createdAt: now,
            updatedAt: now,
          });
        }
        tx.objectStore('outlines').put({
          stageId,
          outline: {
            outlines,
            generationComplete: false,
            createdAt: now,
            updatedAt: now,
          },
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();

      localStorage.setItem(
        `openmaic:generation-recovery:${stageId}`,
        JSON.stringify({
          version: 1,
          stageId,
          status: 'failed',
          params: {
            stageInfo: {
              name: 'Checkpoint resume deck',
              description: 'A partially generated course used to verify checkpoint resume.',
              language: 'en-US',
              style: 'professional',
            },
            languageDirective: 'Use English for the generated course.',
          },
          completedOrders: Array.from({ length: savedSceneCount }, (_, index) => index + 1),
          totalOutlines: outlineCount,
          currentOutlineId: `outline-${savedSceneCount + 1}`,
          failure: {
            outlineId: `outline-${savedSceneCount + 1}`,
            phase: 'content',
            message: 'Quota exhausted',
            errorCode: 'QUOTA_EXHAUSTED',
            statusCode: 429,
          },
          updatedAt: now,
        }),
      );
    },
    { stageId: STAGE_ID, outlineCount: OUTLINE_COUNT, savedSceneCount: SAVED_SCENE_COUNT },
  );
}

test('continues a paused classroom from the durable checkpoint', async ({ page }) => {
  const generatedOrders: number[] = [];

  await page.route('**/api/generate/scene-content', async (route) => {
    const body = route.request().postDataJSON() as { outline?: { order?: number } };
    const order = Number(body.outline?.order);
    generatedOrders.push(order);
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        content: makeScene(STAGE_ID, order).content,
        effectiveOutline: makeOutline(order),
      }),
    });
  });

  await page.route('**/api/generate/scene-actions', async (route) => {
    const body = route.request().postDataJSON() as {
      stageId?: string;
      outline?: { order?: number };
    };
    const stageId = body.stageId ?? STAGE_ID;
    const order = Number(body.outline?.order);
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        scene: makeScene(stageId, order),
        previousSpeeches: [],
      }),
    });
  });

  await seedCheckpointCourse(page);
  await page.goto(`/classroom/${STAGE_ID}`);

  await expect(page.locator('h1').filter({ hasText: 'Checkpoint scene 1' })).toBeVisible({
    timeout: 30_000,
  });
  for (let i = 0; i < SAVED_SCENE_COUNT; i += 1) {
    await page.getByLabel('Next scene').click();
  }

  await expect(page.getByRole('heading', { name: /生成已暂停|generation paused/i })).toBeVisible();
  await expect(page.getByText(`${SAVED_SCENE_COUNT}/${OUTLINE_COUNT}`)).toBeVisible();

  await page.getByRole('button', { name: /从断点继续|continue from checkpoint/i }).click();

  await expect
    .poll(() => generatedOrders, {
      timeout: 30_000,
      message: 'resume should generate only the missing checkpoint scenes',
    })
    .toEqual([9, 10]);

  await expect
    .poll(async () => {
      return page.evaluate(async (stageId) => {
        const open = indexedDB.open('maic-documents', 1);
        const db: IDBDatabase = await new Promise((resolve, reject) => {
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => reject(open.error);
        });
        const count = await new Promise<number>((resolve, reject) => {
          const tx = db.transaction(['scenes'], 'readonly');
          const req = tx.objectStore('scenes').index('by-stage').count(stageId);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        db.close();
        return count;
      }, STAGE_ID);
    })
    .toBe(OUTLINE_COUNT);

  await expect
    .poll(async () => {
      return page.evaluate((stageId) => {
        const raw = localStorage.getItem(`openmaic:generation-recovery:${stageId}`);
        return raw ? JSON.parse(raw).status : null;
      }, STAGE_ID);
    })
    .toBe('completed');
});
