import { markdownToTipTap } from '../ai-wizard.service.js';

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown markdown conversion failure';
}

process.on('message', (payload: unknown) => {
  try {
    const markdown = typeof (payload as { markdown?: unknown })?.markdown === 'string'
      ? (payload as { markdown: string }).markdown
      : '';
    const content = markdownToTipTap(markdown);
    process.send?.({ ok: true, content });
  } catch (error) {
    process.send?.({ ok: false, error: serializeError(error) });
  }
});
