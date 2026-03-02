import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { useThemeStore } from '../../stores/themeStore';
import type { ThemeName } from '../../stores/themeStore';

interface ToolbarProps {
  editor: Editor | null;
  columnCount: 1 | 2;
  setColumnCount: (n: 1 | 2) => void;
  showTexture: boolean;
  setShowTexture: (v: boolean) => void;
  onOpenBlockPicker: () => void;
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function Btn({
  onClick, isActive, disabled, title, children,
}: {
  onClick: () => void; isActive?: boolean; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`px-1.5 py-1 rounded text-xs transition-colors flex-shrink-0 ${
        isActive ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] text-gray-400 uppercase tracking-wider text-center mt-0.5 select-none">{children}</div>;
}

function GroupDivider() {
  return <div className="w-px self-stretch bg-gray-200 mx-1.5 flex-shrink-0" />;
}

const THEMES: { value: ThemeName; label: string; swatch: string }[] = [
  { value: 'classic-parchment', label: 'Classic Parchment', swatch: '#f4e4c1' },
  { value: 'dmguild', label: 'DMGuild', swatch: '#EEE5CE' },
  { value: 'dark-tome', label: 'Dark Tome', swatch: '#1a1a2e' },
  { value: 'clean-modern', label: 'Clean Modern', swatch: '#ffffff' },
  { value: 'fey-wild', label: 'Fey Wild', swatch: '#e8f5e9' },
  { value: 'infernal', label: 'Infernal', swatch: '#1a0a0a' },
];

const FONT_SIZES = [
  { label: 'Small', value: '8pt' },
  { label: 'Normal', value: null },
  { label: 'Large', value: '12pt' },
  { label: 'Extra Large', value: '16pt' },
];

const HIGHLIGHT_COLORS = [
  { color: '#fef08a', label: 'Yellow' },
  { color: '#bbf7d0', label: 'Green' },
  { color: '#bfdbfe', label: 'Blue' },
  { color: '#fecdd3', label: 'Pink' },
];

export function Toolbar({ editor, columnCount, setColumnCount, showTexture, setShowTexture, onOpenBlockPicker }: ToolbarProps) {
  const { currentTheme, setTheme } = useThemeStore();
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [showHighlightDropdown, setShowHighlightDropdown] = useState(false);
  const [showFontSizeDropdown, setShowFontSizeDropdown] = useState(false);
  const themeBtnRef = useRef<HTMLDivElement>(null);
  const highlightBtnRef = useRef<HTMLDivElement>(null);
  const fontSizeBtnRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const handler = () => setTick((t) => t + 1);
    editor.on('transaction', handler);
    return () => { editor.off('transaction', handler); };
  }, [editor]);

  useEffect(() => {
    if (!showThemeDropdown) return;
    const close = (e: MouseEvent) => {
      if (themeBtnRef.current && !themeBtnRef.current.contains(e.target as Node)) {
        setShowThemeDropdown(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showThemeDropdown]);

  useEffect(() => {
    if (!showHighlightDropdown) return;
    const close = (e: MouseEvent) => {
      if (highlightBtnRef.current && !highlightBtnRef.current.contains(e.target as Node)) {
        setShowHighlightDropdown(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showHighlightDropdown]);

  useEffect(() => {
    if (!showFontSizeDropdown) return;
    const close = (e: MouseEvent) => {
      if (fontSizeBtnRef.current && !fontSizeBtnRef.current.contains(e.target as Node)) {
        setShowFontSizeDropdown(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showFontSizeDropdown]);

  if (!editor) return null;

  const is = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  return (
    <div className="border-b bg-white">
      <div className="flex items-start gap-0 px-2 py-1.5 flex-wrap">

        {/* Text Group */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-0.5">
            <Btn onClick={() => editor.chain().focus().toggleBold().run()} isActive={is('bold')} title="Bold (Ctrl+B)">
              <span className="font-bold text-sm">B</span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleItalic().run()} isActive={is('italic')} title="Italic (Ctrl+I)">
              <span className="italic text-sm">I</span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={is('underline')} title="Underline (Ctrl+U)">
              <span className="underline text-sm">U</span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleStrike().run()} isActive={is('strike')} title="Strikethrough (Ctrl+Shift+S)">
              <span className="line-through text-sm">S</span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleSuperscript().run()} isActive={is('superscript')} title="Superscript">
              <span className="text-sm">X<sup className="text-[8px]">2</sup></span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleSubscript().run()} isActive={is('subscript')} title="Subscript">
              <span className="text-sm">X<sub className="text-[8px]">2</sub></span>
            </Btn>
            <Btn
              onClick={() => {
                if (is('link')) { editor.chain().focus().unsetLink().run(); return; }
                const url = window.prompt('URL:');
                if (url) {
                  const trimmed = url.trim().toLowerCase();
                  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) return;
                  const safe = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
                  editor.chain().focus().setLink({ href: safe }).run();
                }
              }}
              isActive={is('link')}
              title="Link"
            >
              <Icon d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.388a4.5 4.5 0 00-6.364-6.364L4.5 8.25" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Clear formatting">
              <Icon d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </Btn>
            <div className="relative" ref={highlightBtnRef}>
              <Btn onClick={() => setShowHighlightDropdown(!showHighlightDropdown)} isActive={is('highlight')} title="Highlight">
                <div className="flex items-center gap-0.5">
                  <span className="text-[10px] font-bold px-0.5 rounded" style={{ background: '#fef08a' }}>A</span>
                  <Icon d="M19 9l-7 7-7-7" />
                </div>
              </Btn>
              {showHighlightDropdown && createPortal(
                <div
                  className="fixed bg-white rounded-lg shadow-lg border py-1 w-32"
                  style={{
                    zIndex: 9999,
                    top: (highlightBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                    left: highlightBtnRef.current?.getBoundingClientRect().left ?? 0,
                  }}
                >
                  {HIGHLIGHT_COLORS.map((h) => (
                    <button
                      key={h.color}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        editor.chain().focus().toggleHighlight({ color: h.color }).run();
                        setShowHighlightDropdown(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700"
                    >
                      <span className="w-4 h-4 rounded border" style={{ background: h.color }} />
                      {h.label}
                    </button>
                  ))}
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editor.chain().focus().unsetHighlight().run();
                      setShowHighlightDropdown(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700"
                  >
                    <span className="w-4 h-4 rounded border bg-white relative">
                      <span className="absolute inset-0 flex items-center justify-center text-red-400 text-[10px]">✕</span>
                    </span>
                    None
                  </button>
                </div>,
                document.body
              )}
            </div>
            <div className="relative" ref={fontSizeBtnRef}>
              <Btn onClick={() => setShowFontSizeDropdown(!showFontSizeDropdown)} title="Font size">
                <div className="flex items-center gap-0.5">
                  <span className="text-[10px]">Size</span>
                  <Icon d="M19 9l-7 7-7-7" />
                </div>
              </Btn>
              {showFontSizeDropdown && createPortal(
                <div
                  className="fixed bg-white rounded-lg shadow-lg border py-1 w-32"
                  style={{
                    zIndex: 9999,
                    top: (fontSizeBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                    left: fontSizeBtnRef.current?.getBoundingClientRect().left ?? 0,
                  }}
                >
                  {FONT_SIZES.map((fs) => (
                    <button
                      key={fs.label}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (fs.value) {
                          editor.chain().focus().setFontSize(fs.value).run();
                        } else {
                          editor.chain().focus().unsetFontSize().run();
                        }
                        setShowFontSizeDropdown(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700"
                    >
                      {fs.label}{fs.value ? ` (${fs.value})` : ''}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
          </div>
          <GroupLabel>Text</GroupLabel>
        </div>

        <GroupDivider />

        {/* Paragraph Group */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-0.5">
            <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Align left">
              <Icon d="M3 6h18M3 12h12M3 18h18" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Align center">
              <Icon d="M3 6h18M6 12h12M3 18h18" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Align right">
              <Icon d="M3 6h18M9 12h12M3 18h18" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} title="Justify">
              <Icon d="M3 6h18M3 12h18M3 18h18" />
            </Btn>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={is('heading', { level: 1 })} title="Heading 1">
              <span className="text-[11px] font-bold">H1</span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={is('heading', { level: 2 })} title="Heading 2">
              <span className="text-[11px] font-bold">H2</span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={is('heading', { level: 3 })} title="Heading 3">
              <span className="text-[11px] font-bold">H3</span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} isActive={is('heading', { level: 4 })} title="Heading 4">
              <span className="text-[11px] font-bold">H4</span>
            </Btn>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={is('bulletList')} title="Bullet list">
              <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={is('orderedList')} title="Ordered list">
              <Icon d="M8 6h13M8 12h13M8 18h13M3.5 6V3l-1 .5M4 18.5H2.5l1.25-1.5c.5-.5.75-1 .25-1.5s-1.25 0-1.5.5" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={is('blockquote')} title="Blockquote">
              <Icon d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.2 48.2 0 005.024-.516c1.577-.233 2.713-1.612 2.713-3.228V6.741c0-1.616-1.136-2.995-2.713-3.228A48.4 48.4 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </Btn>
            <Btn
              onClick={() => editor.chain().focus().toggleDropCap().run()}
              isActive={editor.isActive('paragraph', { dropCap: true })}
              title="Drop cap"
            >
              <span className="text-[13px] font-serif font-bold leading-none">D</span>
            </Btn>
          </div>
          <GroupLabel>Paragraph</GroupLabel>
        </div>

        <GroupDivider />

        {/* Insert Group */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-0.5">
            <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Ornamental divider">
              <Icon d="M3 12h18" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().insertContent({ type: 'columnBreak' }).run()} title="Column break">
              <Icon d="M9 4v16M15 4v16" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()} title="Page break">
              <Icon d="M3 10h18M3 14h18" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()} isActive={is('codeBlock')} title="Code block">
              <Icon d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table">
              <Icon d="M3 10h18M3 14h18M10 3v18M14 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" />
            </Btn>
            <Btn onClick={() => onOpenBlockPicker()} title="Insert block">
              <span className="text-[10px] font-bold">Block</span>
            </Btn>
          </div>
          <GroupLabel>Insert</GroupLabel>
        </div>

        <GroupDivider />

        {/* Layout Group */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-0.5">
            <Btn onClick={() => setColumnCount(1)} isActive={columnCount === 1} title="Single column">
              <span className="text-[10px] font-bold">1-Col</span>
            </Btn>
            <Btn onClick={() => setColumnCount(2)} isActive={columnCount === 2} title="Two columns">
              <span className="text-[10px] font-bold">2-Col</span>
            </Btn>
          </div>
          <GroupLabel>Layout</GroupLabel>
        </div>

        <GroupDivider />

        {/* Theme Group */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-0.5">
            <div className="relative" ref={themeBtnRef}>
              <Btn onClick={() => setShowThemeDropdown(!showThemeDropdown)} title="Theme">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full border border-gray-300" style={{ background: THEMES.find(t => t.value === currentTheme)?.swatch }} />
                  <span className="text-[10px]">Theme</span>
                  <Icon d="M19 9l-7 7-7-7" />
                </div>
              </Btn>
              {showThemeDropdown && createPortal(
                <div
                  className="fixed bg-white rounded-lg shadow-lg border py-1 w-44"
                  style={{
                    zIndex: 9999,
                    top: (themeBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                    left: themeBtnRef.current?.getBoundingClientRect().left ?? 0,
                  }}
                >
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      onMouseDown={(e) => { e.preventDefault(); setTheme(t.value); setShowThemeDropdown(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 ${currentTheme === t.value ? 'bg-purple-50 text-purple-700' : 'text-gray-700'}`}
                    >
                      <span className="w-4 h-4 rounded-full border" style={{ background: t.swatch }} />
                      {t.label}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
            <Btn onClick={() => setShowTexture(!showTexture)} isActive={showTexture} title="Toggle page texture">
              <Icon d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </Btn>
          </div>
          <GroupLabel>Theme</GroupLabel>
        </div>

        <GroupDivider />

        {/* History */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-0.5">
            <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!canUndo} title="Undo">
              <Icon d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!canRedo} title="Redo">
              <Icon d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
            </Btn>
          </div>
          <GroupLabel>History</GroupLabel>
        </div>

      </div>
    </div>
  );
}
