import type { KeyboardEvent } from 'react';

interface ComposerProps {
  value: string;
  placeholder: string;
  sending: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
}

export function Composer({
  value,
  placeholder,
  sending,
  disabled = false,
  onChange,
  onSend,
}: ComposerProps) {
  const isDisabled = disabled || sending || value.trim().length === 0;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isDisabled) {
        onSend();
      }
    }
  }

  return (
    <div className="forge-composer">
      <textarea
        className="forge-composer__input"
        disabled={sending || disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={4}
        value={value}
      />
      <button className="forge-composer__send" disabled={isDisabled} onClick={onSend} type="button">
        {sending ? 'Sending…' : 'Send'}
      </button>
    </div>
  );
}
