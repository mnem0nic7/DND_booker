import { useEffect, useMemo, useRef } from 'react';
import type { ConsoleMessage } from '../../lib/forgeConsole';

interface MessageListProps {
  messages: ConsoleMessage[];
  thinkingLabel: string | null;
}

export function MessageList({ messages, thinkingLabel }: MessageListProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const signature = useMemo(
    () => `${messages[messages.length - 1]?.id ?? 'empty'}:${thinkingLabel ?? 'idle'}`,
    [messages, thinkingLabel],
  );

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    if (typeof node.scrollTo === 'function') {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [signature]);

  return (
    <div className="forge-message-list" ref={listRef}>
      {messages.map((message) => {
        if (message.kind === 'system') {
          return (
            <div className="forge-message-row forge-message-row--system" key={message.id}>
              <span className="forge-message-system-rule" />
              <span className="forge-message-system-text">{message.text}</span>
              <span className="forge-message-system-rule" />
            </div>
          );
        }

        const isUser = message.kind === 'user';
        return (
          <div
            className={`forge-message-row${isUser ? ' forge-message-row--user' : ' forge-message-row--agent'}`}
            key={message.id}
          >
            <article className={`forge-message-bubble${isUser ? ' forge-message-bubble--user' : ' forge-message-bubble--agent'}`}>
              {!isUser ? <p className="forge-message-sender">{message.fromLabel}</p> : null}
              {!isUser && message.responseMode === 'fallback' ? (
                <p className="forge-message-mode">Fallback reply</p>
              ) : null}
              <p className="forge-message-text">{message.text}</p>
              <span className="forge-message-timestamp">{message.timestamp}</span>
            </article>
          </div>
        );
      })}

      {thinkingLabel ? (
        <div className="forge-thinking-indicator" aria-live="polite">
          <span className="forge-thinking-indicator__dot" />
          <span className="forge-thinking-indicator__label">{thinkingLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
