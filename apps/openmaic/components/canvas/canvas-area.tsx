'use client';

import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CircleAlert, Loader2, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SceneRenderer } from '@/components/stage/scene-renderer';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { Whiteboard } from '@/components/whiteboard';
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar';
import type { CanvasToolbarProps } from '@/components/canvas/canvas-toolbar';
import type { Scene, StageMode } from '@/lib/types/stage';
import { useI18n } from '@/lib/hooks/use-i18n';
import { ClassroomCompletePageConnected } from '@/components/scene-renderers/classroom-complete';
import type { GenerationRecoveryRecord } from '@/lib/generation/recovery-store';

const RETRY_COOLDOWN_MS = 1500;

interface CanvasAreaProps extends CanvasToolbarProps {
  readonly currentScene: Scene | null;
  readonly mode: StageMode;
  readonly hideToolbar?: boolean;
  readonly isPendingScene?: boolean;
  readonly isCourseComplete?: boolean;
  readonly isGenerationFailed?: boolean;
  /**
   * Resume generation from the persisted checkpoint. Returns a promise so the
   * UI can reflect the in-flight state — historically this callback was
   * synchronous and the user could not tell whether a click had taken effect
   * when the underlying retry failed immediately (state machine silently
   * snapped back to `paused`).
   */
  readonly onRetryGeneration?: () => void | Promise<void>;
  readonly generationRecovery?: GenerationRecoveryRecord | null;
}

export function CanvasArea({
  currentScene,
  currentSceneIndex,
  scenesCount,
  mode,
  engineState,
  isLiveSession,
  isSoftClosing,
  softCloseDeadline,
  whiteboardOpen,
  sidebarCollapsed,
  chatCollapsed,
  onToggleSidebar,
  onToggleChat,
  onPrevSlide,
  onNextSlide,
  onPlayPause,
  onWhiteboardClose,
  isPresenting,
  onTogglePresentation,
  showStopDiscussion,
  onStopDiscussion,
  onContinueDiscussion,
  hideToolbar,
  isPendingScene,
  isCourseComplete,
  isGenerationFailed,
  onRetryGeneration,
  generationRecovery,
}: CanvasAreaProps) {
  const { t } = useI18n();
  const [isRetrying, setIsRetrying] = useState(false);
  const lastRetryAtRef = useRef(0);
  const showControls = mode === 'playback' && !whiteboardOpen;
  const showPlayHint =
    showControls &&
    engineState !== 'playing' &&
    currentScene?.type === 'slide' &&
    !isLiveSession &&
    !isPendingScene;
  const savedScenes = generationRecovery?.completedOrders.length ?? 0;
  const totalScenes = generationRecovery?.totalOutlines || scenesCount;
  const recoveryProgress = totalScenes > 0 ? Math.round((savedScenes / totalScenes) * 100) : 0;
  const failureCode = generationRecovery?.failure?.errorCode;
  const failureStatus = generationRecovery?.failure?.statusCode;
  const recoveryReason =
    failureCode === 'QUOTA_EXHAUSTED'
      ? t('stage.generationQuotaExhausted')
      : failureCode === 'MISSING_API_KEY' || failureStatus === 401 || failureStatus === 403
        ? t('stage.generationCredentialsRequired')
        : generationRecovery?.failure?.phase === 'persistence'
          ? t('stage.generationSaveFailed')
          : failureCode === 'RATE_LIMITED' || failureStatus === 429
            ? t('stage.generationRateLimited')
            : t('stage.generationProviderInterrupted');

  /**
   * Resume generation from the persisted checkpoint. We track an in-flight flag
   * locally so the button reflects the retry instead of snapping back to the
   * static "paused" view, and a short cooldown to prevent tight re-click loops
   * when the underlying call fails immediately (e.g. quota still exhausted).
   */
  const handleRetryGeneration = useCallback(async () => {
    if (!onRetryGeneration || isRetrying) return;
    const now = Date.now();
    if (now - lastRetryAtRef.current < RETRY_COOLDOWN_MS) return;
    lastRetryAtRef.current = now;
    setIsRetrying(true);
    try {
      await Promise.resolve(onRetryGeneration());
      // Failure path is signalled upstream via the recovery record flipping back
      // to `paused/failed`; the watching effect below surfaces it as a toast.
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t('stage.generationResumeFailed'), { description: message });
    } finally {
      setIsRetrying(false);
    }
  }, [onRetryGeneration, isRetrying, t]);

  const handleSlideClick = useCallback(
    (e: React.MouseEvent) => {
      if (!showControls || isLiveSession || currentScene?.type !== 'slide') return;
      // Don't trigger page play/pause when clicking inside a video element's visual area.
      // Video elements may be visually covered by other slide elements (e.g. text),
      // so we check click coordinates against all video element bounding rects.
      const container = e.currentTarget as HTMLElement;
      const videoEls = container.querySelectorAll('[data-video-element]');
      for (const el of videoEls) {
        const rect = el.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          return;
        }
      }
      onPlayPause();
    },
    [showControls, isLiveSession, onPlayPause, currentScene?.type],
  );

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 dark:bg-gray-900 group/canvas">
      {/* Slide area — takes remaining space */}
      <div
        className={cn(
          'flex-1 min-h-0 relative overflow-hidden flex items-center justify-center p-2 transition-colors duration-500',
          currentScene?.type === 'interactive'
            ? 'bg-blue-50/30 dark:bg-blue-900/10'
            : 'bg-gray-50/30 dark:bg-gray-900/30',
        )}
      >
        <div
          className={cn(
            'aspect-[16/9] h-full max-h-full max-w-full bg-white dark:bg-gray-800 shadow-2xl rounded-lg overflow-hidden relative transition-all duration-700',
            showControls && !isLiveSession && currentScene?.type === 'slide' && 'cursor-pointer',
            currentScene?.type === 'interactive'
              ? 'shadow-blue-200/50 dark:shadow-blue-900/50 ring-1 ring-blue-900/5 dark:ring-blue-500/10'
              : 'shadow-gray-200/50 dark:shadow-gray-800/50 ring-1 ring-gray-950/5 dark:ring-white/5',
          )}
          onClick={handleSlideClick}
        >
          {/* Whiteboard Layer */}
          <div className="absolute inset-0 z-[110] pointer-events-none">
            <SceneProvider>
              <Whiteboard isOpen={whiteboardOpen} onClose={onWhiteboardClose} />
            </SceneProvider>
          </div>

          {/* Scene Content */}
          {currentScene && !whiteboardOpen && (
            <div className="absolute inset-0">
              <SceneProvider>
                <SceneRenderer scene={currentScene} mode={mode} />
              </SceneProvider>
            </div>
          )}

          {/* Pending Scene Loading / Completion Overlay */}
          <AnimatePresence>
            {isPendingScene && !currentScene && isCourseComplete && (
              <motion.div
                key="course-complete"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="absolute inset-0"
              >
                <ClassroomCompletePageConnected />
              </motion.div>
            )}
            {isPendingScene && !currentScene && !isCourseComplete && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="absolute inset-0 z-[105] flex flex-col items-center justify-center bg-white dark:bg-gray-800"
              >
                {isGenerationFailed ? (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="mx-5 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white px-6 py-6 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:px-8"
                  >
                    <div className="flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                      <CircleAlert className="size-6" aria-hidden="true" />
                    </div>
                    <div className="space-y-1.5">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {t('stage.generationPausedSafely')}
                      </h2>
                      <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                        {recoveryReason}
                      </p>
                    </div>
                    <div className="w-full rounded-xl bg-gray-50 p-4 text-left dark:bg-gray-800/80">
                      <div className="mb-2 flex items-center justify-between gap-4 text-xs font-medium text-gray-600 dark:text-gray-300">
                        <span className="inline-flex items-center gap-1.5">
                          <ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" />
                          {t('stage.generationProgressSaved')}
                        </span>
                        <span>
                          {savedScenes}/{totalScenes}
                        </span>
                      </div>
                      <div
                        className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                        role="progressbar"
                        aria-label={t('stage.generationProgressSaved')}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={recoveryProgress}
                      >
                        <div
                          className="h-full rounded-full bg-emerald-600 transition-[width] duration-200 motion-reduce:transition-none"
                          style={{ width: `${recoveryProgress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                        {t('stage.generationCompletedSafe')}
                      </p>
                    </div>
                    {onRetryGeneration && (
                      <button
                        onClick={handleRetryGeneration}
                        disabled={isRetrying}
                        className={cn(
                          'inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 active:bg-gray-800',
                          isRetrying
                            ? 'bg-gray-700 text-white cursor-not-allowed'
                            : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white',
                        )}
                      >
                        {isRetrying ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <RefreshCw className="size-4" aria-hidden="true" />
                        )}
                        {t('stage.continueFromCheckpoint')}
                      </button>
                    )}
                    <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                      {t('stage.generationResumeCardHint')}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    {/* Spinner */}
                    <div className="relative w-12 h-12">
                      <div className="absolute inset-0 rounded-full border-2 border-gray-100 dark:border-gray-700" />
                      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-purple-500 dark:border-t-purple-400 animate-spin" />
                    </div>
                    {/* Text */}
                    <motion.span
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.3 }}
                      className="text-sm text-gray-400 dark:text-gray-500 font-medium"
                    >
                      {t('stage.generatingNextPage')}
                    </motion.span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scene Number Badge */}
          {currentScene && (
            <div className="absolute top-4 right-4 text-gray-200 dark:text-gray-700 font-black text-4xl opacity-50 pointer-events-none select-none mix-blend-multiply dark:mix-blend-screen">
              {(currentSceneIndex + 1).toString().padStart(2, '0')}
            </div>
          )}

          {/* Play hint — breathing button when idle or paused (slides only) */}
          <AnimatePresence>
            {showPlayHint && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 z-[102] flex items-center justify-center pointer-events-none"
              >
                <motion.div
                  className="opacity-50 group-hover/canvas:opacity-100 transition-opacity duration-300 pointer-events-auto cursor-pointer"
                  exit={{ pointerEvents: 'none' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayPause();
                  }}
                >
                  <motion.div
                    initial={{ scale: 0.85 }}
                    animate={{ scale: [1, 1.06] }}
                    exit={{ scale: 1.15, opacity: 0 }}
                    transition={{
                      default: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                      scale: {
                        repeat: Infinity,
                        repeatType: 'mirror',
                        duration: 1,
                        ease: 'easeInOut',
                      },
                    }}
                    className="w-20 h-20 rounded-full bg-white/95 dark:bg-gray-800/95 flex items-center justify-center shadow-[0_4px_30px_rgba(147,51,234,0.15),inset_0_0_0_1px_rgba(233,213,255,0.5)] dark:shadow-[0_4px_30px_rgba(147,51,234,0.3),inset_0_0_0_1px_rgba(126,34,206,0.3)]"
                    style={{ willChange: 'transform' }}
                  >
                    <Play className="w-7 h-7 text-purple-600 dark:text-purple-400 fill-purple-600/90 dark:fill-purple-400/90 ml-0.5" />
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Canvas Toolbar — in document flow, only when not merged into roundtable ── */}
      {!hideToolbar && (
        <CanvasToolbar
          className={cn(
            'shrink-0 h-9 px-2',
            'bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl',
            'border-t border-gray-200/40 dark:border-gray-700/40',
          )}
          currentSceneIndex={currentSceneIndex}
          scenesCount={scenesCount}
          engineState={engineState}
          isLiveSession={isLiveSession}
          isSoftClosing={isSoftClosing}
          softCloseDeadline={softCloseDeadline}
          whiteboardOpen={whiteboardOpen}
          sidebarCollapsed={sidebarCollapsed}
          chatCollapsed={chatCollapsed}
          onToggleSidebar={onToggleSidebar}
          onToggleChat={onToggleChat}
          onPrevSlide={onPrevSlide}
          onNextSlide={onNextSlide}
          onPlayPause={onPlayPause}
          onWhiteboardClose={onWhiteboardClose}
          isPresenting={isPresenting}
          onTogglePresentation={onTogglePresentation}
          showStopDiscussion={showStopDiscussion}
          onStopDiscussion={onStopDiscussion}
          onContinueDiscussion={onContinueDiscussion}
        />
      )}
    </div>
  );
}
