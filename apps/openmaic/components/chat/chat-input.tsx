'use client';

import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

export interface ChatInputRef {
  focus: () => void;
}

interface ChatInputProps {
  /** Sends a user message; resolves once the caller has handed it off.
   *  This component intentionally does not know about sessions — that contract
   *  belongs to `useChatSessions.sendMessage`, which auto-creates a Q&A
   *  session when none is active (see use-chat-sessions.ts:1689/1696). */
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
  /** Override the i18n'd placeholder for context-specific copy. */
  placeholder?: string;
  autoFocus?: boolean;
  /** Tone down the visual chrome when used inside empty-state containers. */
  variant?: 'panel' | 'inline';
}

/**
 * ChatInput — free-form Q&A input that drives `useChatSessions.sendMessage`.
 *
 * In upstream OpenMAIC v0.3.2 the `sendMessage` API is fully exposed via
 * `ChatAreaRef` (see chat-area.tsx ChatAreaRef.sendMessage) and is invoked
 * internally by the SSE discussion flow (`PlaybackChromeRoot.tsx:784/1493`).
 * However no UI calls it directly, leaving the chat tab with a no-input
 * empty state. This component is the missing user-facing entry point: it
 * consumes the same `sendMessage` channel, so the user-initiated Q&A and
 * the engine-initiated discussion share storage, streaming and abort logic.
 */
export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(function ChatInput(
  { onSend, disabled = false, className, placeholder, autoFocus = false, variant = 'panel' },
  ref,
) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch {
      // Keep the draft on failure so the user doesn't lose their input.
    } finally {
      setSending(false);
    }
  }, [value, sending, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  };

  // Auto-resize the textarea as content grows, capped to keep the panel compact.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const containerClass =
    variant === 'panel'
      ? 'flex items-end gap-2 border-t border-gray-100/80 dark:border-gray-800/80 bg-white/70 dark:bg-gray-900/70 backdrop-blur-md p-2.5'
      : 'flex items-end gap-2 w-full';

  return (
    <div className={cn(containerClass, className)}>
      <div
        className={cn(
          'flex-1 min-w-0 rounded-xl border bg-white dark:bg-gray-800/80 transition-all',
          'border-gray-200/80 dark:border-gray-700/80',
          'focus-within:border-purple-400 dark:focus-within:border-purple-500',
          'focus-within:ring-2 focus-within:ring-purple-100/60 dark:focus-within:ring-purple-900/40',
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? t('chat.inputPlaceholder')}
          autoFocus={autoFocus}
          disabled={disabled || sending}
          rows={1}
          className="w-full resize-none bg-transparent border-none focus:ring-0 focus:outline-none outline-none shadow-none ring-0 text-gray-700 dark:text-gray-200 text-[13px] placeholder:text-gray-400 dark:placeholder:text-gray-500 px-3 py-2 min-h-[36px] max-h-[120px]"
          style={{ fieldSizing: 'content' } as Record<string, string>}
        />
      </div>
      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={disabled || sending || !value.trim()}
        aria-label={t('chat.send')}
        title={t('chat.keyboardHint')}
        className={cn(
          'shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all',
          disabled || sending || !value.trim()
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            : 'bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-md shadow-purple-300/30 dark:shadow-purple-900/40 active:scale-95',
        )}
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </button>
    </div>
  );
});