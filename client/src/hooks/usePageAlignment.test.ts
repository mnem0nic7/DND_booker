import {
  resolvePageBreakFillHeight,
  shouldCompactNearBlankPageBreaks,
} from './usePageAlignment';

describe('usePageAlignment helpers', () => {
  it('does not compact near-blank manual page breaks on the live parity editor surface', () => {
    const shell = document.createElement('div');
    shell.className = 'parity-live-editor-shell';
    const proseMirror = document.createElement('div');
    proseMirror.className = 'ProseMirror';
    shell.appendChild(proseMirror);
    document.body.appendChild(shell);

    expect(shouldCompactNearBlankPageBreaks(proseMirror)).toBe(false);
    expect(resolvePageBreakFillHeight(820, 864, false)).toBe(820);

    shell.remove();
  });

  it('keeps compact separators for the legacy page-canvas path', () => {
    const canvas = document.createElement('div');
    canvas.className = 'page-canvas';
    const proseMirror = document.createElement('div');
    proseMirror.className = 'ProseMirror';
    canvas.appendChild(proseMirror);
    document.body.appendChild(canvas);

    expect(shouldCompactNearBlankPageBreaks(proseMirror)).toBe(true);
    expect(resolvePageBreakFillHeight(820, 864, true)).toBe(48);

    canvas.remove();
  });
});
