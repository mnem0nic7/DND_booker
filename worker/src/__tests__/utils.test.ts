import { describe, it, expect } from 'vitest';
import { escapeHtml, normalizeChapterHeaderTitle, safeCssUrl, safeUrl } from '../renderers/utils.js';
import { renderNode } from '../renderers/tiptap-to-html.js';

describe('Worker Renderer Utils', () => {
  describe('escapeHtml', () => {
    it('should escape ampersands', () => {
      expect(escapeHtml('a&b')).toBe('a&amp;b');
    });

    it('should escape angle brackets', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('should escape double quotes', () => {
      expect(escapeHtml('a"b')).toBe('a&quot;b');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("a'b")).toBe('a&#39;b');
    });

    it('should handle multiple special characters', () => {
      expect(escapeHtml('<div class="a" data-x=\'b\'>&')).toBe(
        '&lt;div class=&quot;a&quot; data-x=&#39;b&#39;&gt;&amp;'
      );
    });

    it('should pass through safe text unchanged', () => {
      expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
    });
  });

  describe('safeUrl', () => {
    it('should allow normal HTTP URLs', () => {
      expect(safeUrl('https://example.com/image.png')).toBe('https://example.com/image.png');
    });

    it('should allow relative URLs', () => {
      expect(safeUrl('/uploads/project/image.png')).toBe('/uploads/project/image.png');
    });

    it('should block javascript: URIs', () => {
      expect(safeUrl('javascript:alert(1)')).toBe('#');
    });

    it('should block JavaScript: URIs (case insensitive)', () => {
      expect(safeUrl('JavaScript:alert(1)')).toBe('#');
    });

    it('should block javascript: with leading whitespace', () => {
      expect(safeUrl('  javascript:alert(1)')).toBe('#');
    });

    it('should block non-image data: URIs', () => {
      expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
    });

    it('should allow data:image URIs', () => {
      expect(safeUrl('data:image/png;base64,iVBOR...')).toBe('data:image/png;base64,iVBOR...');
    });

    it('should escape HTML entities in output', () => {
      expect(safeUrl('https://example.com/a&b')).toBe('https://example.com/a&amp;b');
    });
  });

  describe('safeCssUrl', () => {
    it('should allow normal HTTPS URLs', () => {
      expect(safeCssUrl('https://example.com/bg.jpg')).toBe('https://example.com/bg.jpg');
    });

    it('should allow relative URLs', () => {
      expect(safeCssUrl('/uploads/project/bg.png')).toBe('/uploads/project/bg.png');
    });

    it('should block javascript: URIs', () => {
      expect(safeCssUrl('javascript:void(0)')).toBeNull();
    });

    it('should block non-image data: URIs', () => {
      expect(safeCssUrl('data:text/css,*{}')).toBeNull();
    });

    it('should block data:image URIs with semicolons (CSS safety)', () => {
      // Semicolons in CSS url() context can be used for CSS injection,
      // so data URIs with semicolons are blocked even if they are images
      expect(safeCssUrl('data:image/jpeg;base64,/9j...')).toBeNull();
    });

    it('should block URLs with parentheses (CSS injection)', () => {
      expect(safeCssUrl('https://example.com/a(b)')).toBeNull();
    });

    it('should block URLs with single quotes (CSS injection)', () => {
      expect(safeCssUrl("https://example.com/a'b")).toBeNull();
    });

    it('should block URLs with double quotes (CSS injection)', () => {
      expect(safeCssUrl('https://example.com/a"b')).toBeNull();
    });

    it('should block URLs with backslashes (CSS injection)', () => {
      expect(safeCssUrl('https://example.com/a\\b')).toBeNull();
    });

    it('should block URLs with semicolons (CSS injection)', () => {
      expect(safeCssUrl('https://example.com/a;b')).toBeNull();
    });

    it('should block URLs with braces (CSS injection)', () => {
      expect(safeCssUrl('https://example.com/a{b}')).toBeNull();
    });

    it('should escape HTML entities in output', () => {
      expect(safeCssUrl('https://example.com/a&b')).toBe('https://example.com/a&amp;b');
    });
  });

  describe('normalizeChapterHeaderTitle', () => {
    it('should strip a matching chapter prefix from the title', () => {
      expect(normalizeChapterHeaderTitle('Chapter 2: Approaching the Mine', 'Chapter 2')).toBe('Approaching the Mine');
    });

    it('should preserve titles that do not duplicate the chapter number', () => {
      expect(normalizeChapterHeaderTitle('The Village', 'Chapter 1')).toBe('The Village');
    });
  });
});

describe('renderNode — inline marks', () => {
  it('should render bold marks as <strong>', () => {
    const html = renderNode({
      type: 'text',
      text: 'hello',
      marks: [{ type: 'bold' }],
    } as any);
    expect(html).toBe('<strong>hello</strong>');
  });

  it('should render italic marks as <em>', () => {
    const html = renderNode({
      type: 'text',
      text: 'hello',
      marks: [{ type: 'italic' }],
    } as any);
    expect(html).toBe('<em>hello</em>');
  });

  it('should render underline marks as <u>', () => {
    const html = renderNode({
      type: 'text',
      text: 'hello',
      marks: [{ type: 'underline' }],
    } as any);
    expect(html).toBe('<u>hello</u>');
  });

  it('should render strike marks as <s>', () => {
    const html = renderNode({
      type: 'text',
      text: 'hello',
      marks: [{ type: 'strike' }],
    } as any);
    expect(html).toBe('<s>hello</s>');
  });

  it('should render link marks as <a>', () => {
    const html = renderNode({
      type: 'text',
      text: 'click',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    } as any);
    expect(html).toBe('<a href="https://example.com">click</a>');
  });

  it('should nest multiple marks correctly', () => {
    const html = renderNode({
      type: 'text',
      text: 'hello',
      marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }],
    } as any);
    expect(html).toBe('<u><em><strong>hello</strong></em></u>');
  });

  it('should escape HTML in text content', () => {
    const html = renderNode({
      type: 'text',
      text: '<script>alert("xss")</script>',
      marks: [{ type: 'bold' }],
    } as any);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('renderNode — stat block compatibility', () => {
  it('should render legacy desc fields in stat block entries', () => {
    const html = renderNode({
      type: 'statBlock',
      attrs: {
        name: 'Gravel Guardian',
        traits: JSON.stringify([{ name: 'Immutable Form', desc: 'The guardian cannot be reshaped.' }]),
        actions: JSON.stringify([{ name: 'Slam', desc: 'Melee Weapon Attack: +6 to hit.' }]),
        reactions: JSON.stringify([{ name: 'Stone Shield', desc: 'Gain +2 AC until the start of its next turn.' }]),
      },
    } as any);

    expect(html).toContain('Immutable Form');
    expect(html).toContain('The guardian cannot be reshaped.');
    expect(html).toContain('Melee Weapon Attack: +6 to hit.');
    expect(html).toContain('Gain +2 AC until the start of its next turn.');
  });

  it('should render legacy stat block aliases for numbers and reaction names', () => {
    const html = renderNode({
      type: 'statBlock',
      attrs: {
        name: 'Phantom Apparition',
        armorClass: 13,
        hitPoints: 10,
        strength: 1,
        dexterity: 15,
        reactions: JSON.stringify([{ type: 'Incorporeal Movement', description: 'The apparition moves through creatures and objects.' }]),
      },
    } as any);

    expect(html).toContain('Armor Class</span> 13');
    expect(html).toContain('Hit Points</span> 10');
    expect(html).toContain('1 (-5)');
    expect(html).toContain('15 (+2)');
    expect(html).toContain('Incorporeal Movement');
  });
});

describe('renderNode — legacy block aliases', () => {
  it('should render legacy random table results arrays', () => {
    const html = renderNode({
      type: 'randomTable',
      attrs: {
        title: 'Hidden Path Discoveries',
        dieType: 'd6',
        results: JSON.stringify([
          { result: 1, description: 'A cracked lantern still flickers.' },
          { result: 2, description: 'Footprints end at a cave wall.' },
        ]),
      },
    } as any);

    expect(html).toContain('Hidden Path Discoveries');
    expect(html).toContain('A cracked lantern still flickers.');
    expect(html).toContain('Footprints end at a cave wall.');
  });

  it('should render legacy npc profile role, traits, and notes fields', () => {
    const html = renderNode({
      type: 'npcProfile',
      attrs: {
        name: 'Eldira Voss',
        race: 'Human',
        role: 'Tavern Keeper',
        traits: 'Superstitious, distrustful',
        notes: 'Knows about the previous mining operations.',
      },
    } as any);

    expect(html).toContain('Human Tavern Keeper');
    expect(html).toContain('Superstitious, distrustful');
    expect(html).toContain('Knows about the previous mining operations.');
  });
});
