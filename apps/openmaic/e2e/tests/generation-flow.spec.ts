import { test, expect } from '../fixtures/base';
import { GenerationPreviewPage } from '../pages/generation-preview.page';
import { createSettingsStorage, SETTINGS_KV_KEY } from '../fixtures/test-data/settings';
import { mockOutlines } from '../fixtures/test-data/scene-outlines';

const SETTINGS_STORAGE = createSettingsStorage();
const REVIEW_SETTINGS_STORAGE = createSettingsStorage({ reviewOutlineEnabled: true });

const GENERATION_SESSION = JSON.stringify({
  sessionId: 'e2e-test-session',
  requirements: {
    requirement: '讲解光合作用',
    language: 'zh-CN',
  },
  pdfText: '',
  pdfImages: [],
  imageStorageIds: [],
  sceneOutlines: null,
  currentStep: 'generating',
});

const WEB_SEARCH_SESSION = JSON.stringify({
  sessionId: 'e2e-web-search-fallback-session',
  requirements: {
    requirement: '讲解数字化转型',
    language: 'zh-CN',
    webSearch: true,
  },
  pdfText: '这是已上传的课程材料。',
  pdfImages: [],
  imageStorageIds: [],
  sceneOutlines: null,
  currentStep: 'generating',
});

const PERSISTED_REVIEW_SESSION = JSON.stringify({
  sessionId: 'e2e-review-session',
  requirements: {
    requirement: '讲解光合作用',
    language: 'zh-CN',
  },
  pdfText: '',
  pdfImages: [],
  imageStorageIds: [],
  sceneOutlines: mockOutlines,
  languageDirective: 'Use Chinese for the generated course.',
  currentStep: 'generating',
  previewPhase: 'review',
});

function outlineStreamBody() {
  const events = mockOutlines
    .map(
      (outline, i) => `data: ${JSON.stringify({ type: 'outline', data: outline, index: i })}\n\n`,
    )
    .join('');
  const done = `data: ${JSON.stringify({ type: 'done', outlines: mockOutlines, courseTitle: 'Mock Course' })}\n\n`;
  return events + done;
}

test.describe('Generation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ settings, session }) => {
        localStorage.setItem('maic:account:settings-storage', settings);
        sessionStorage.setItem('generationSession', session);
      },
      { settings: SETTINGS_STORAGE, session: GENERATION_SESSION },
    );
  });

  test('completes generation pipeline and redirects to classroom', async ({ page, mockApi }) => {
    // Set up all API mocks
    await mockApi.setupGenerationMocks();

    const preview = new GenerationPreviewPage(page);
    await preview.goto();

    // Generation card with progress dots should be visible
    await expect(preview.stepTitle).toBeVisible();

    // Wait for auto-redirect to classroom
    await preview.waitForRedirectToClassroom();
    expect(page.url()).toMatch(/\/classroom\//);
  });

  test('automatically recovers when the first outline request reports fetch failed', async ({
    page,
    mockApi,
  }) => {
    let outlineRequests = 0;
    await page.route('**/api/generate/scene-outlines-stream', (route) => {
      outlineRequests += 1;
      const body =
        outlineRequests === 1
          ? `data: ${JSON.stringify({ type: 'error', error: 'fetch failed' })}\n\n`
          : outlineStreamBody();
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body,
      });
    });
    await mockApi.mockSceneContent();
    await mockApi.mockSceneActions();

    const preview = new GenerationPreviewPage(page);
    await preview.goto();
    await preview.waitForRedirectToClassroom();

    expect(outlineRequests).toBe(2);
  });

  test('preserves the session and resumes in place after a manual retry', async ({
    page,
    mockApi,
  }) => {
    let shouldFail = true;
    await page.route('**/api/generate/scene-outlines-stream', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: shouldFail
          ? `data: ${JSON.stringify({ type: 'error', error: 'Unauthorized' })}\n\n`
          : outlineStreamBody(),
      }),
    );
    await mockApi.mockSceneContent();
    await mockApi.mockSceneActions();

    const preview = new GenerationPreviewPage(page);
    await preview.goto();
    await expect(page.getByRole('heading', { name: /生成失败|generation failed/i })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('generationSession')))
      .not.toBeNull();

    shouldFail = false;
    await page.getByRole('button', { name: /重试生成|retry/i }).click();
    await preview.waitForRedirectToClassroom();
  });

  test('continues classroom generation when optional web search is unavailable', async ({
    page,
    mockApi,
  }) => {
    await page.addInitScript((session) => {
      sessionStorage.setItem('generationSession', session);
    }, WEB_SEARCH_SESSION);
    await page.route('**/api/web-search', (route) =>
      route.fulfill({
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          errorCode: 'INTERNAL_ERROR',
          error: 'fetch failed',
        }),
      }),
    );
    await mockApi.setupGenerationMocks();

    const preview = new GenerationPreviewPage(page);
    await preview.goto();
    await preview.waitForRedirectToClassroom();

    expect(page.url()).toMatch(/\/classroom\//);
  });

  test('opens outline editor from preview review opportunity and resumes generation', async ({
    page,
    mockApi,
  }) => {
    await mockApi.setupGenerationMocks();

    const preview = new GenerationPreviewPage(page);
    await preview.goto();

    await preview.waitForReviewOpportunity();
    await preview.openOutlineReview();
    await expect(preview.editorTitle).toBeVisible();

    await preview.confirmOutlines();
    await preview.waitForRedirectToClassroom();
    expect(page.url()).toMatch(/\/classroom\//);
  });

  test('persists always review preference from the outline editor', async ({ page, mockApi }) => {
    await mockApi.setupGenerationMocks();

    const preview = new GenerationPreviewPage(page);
    await preview.goto();

    await preview.waitForReviewOpportunity();
    await preview.openOutlineReview();
    await preview.enableAlwaysReview();

    // The persist write goes through the KVStore and is asynchronous, so poll
    // rather than reading once straight after the toggle.
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw).state.reviewOutlineEnabled : undefined;
        }, SETTINGS_KV_KEY),
      )
      .toBe(true);

    await preview.confirmOutlines();
    await preview.waitForRedirectToClassroom();
  });

  test('automatically opens outline editor when always review is enabled', async ({
    page,
    mockApi,
  }) => {
    await page.addInitScript(
      ({ settings, session }) => {
        localStorage.setItem('maic:account:settings-storage', settings);
        sessionStorage.setItem('generationSession', session);
      },
      { settings: REVIEW_SETTINGS_STORAGE, session: GENERATION_SESSION },
    );

    await mockApi.setupGenerationMocks();

    const preview = new GenerationPreviewPage(page);
    await preview.goto();

    await preview.waitForEditor();
    await expect(preview.editorTitle).toBeVisible();

    await preview.confirmOutlines();
    await preview.waitForRedirectToClassroom();
  });
});

test('resumes generation from a persisted outline review session', async ({ page, mockApi }) => {
  await page.addInitScript(
    ({ settings, session }) => {
      localStorage.setItem('maic:account:settings-storage', settings);
      sessionStorage.setItem('generationSession', session);
    },
    { settings: SETTINGS_STORAGE, session: PERSISTED_REVIEW_SESSION },
  );

  await mockApi.setupGenerationMocks();

  const preview = new GenerationPreviewPage(page);
  await preview.goto();

  await preview.waitForEditor();
  await preview.confirmOutlines();
  await preview.waitForRedirectToClassroom();
  expect(page.url()).toMatch(/\/classroom\//);
});
