import { describe, expect, it } from 'vitest';
import { analyzeEstimatedArtifactLayout } from '../../services/generation/layout-estimate.service.js';

describe('generation layout-estimate service', () => {
  it('detects consecutive page breaks and chapter headings starting mid-page', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A'.repeat(2500) }] },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chapter 2' }] },
        { type: 'pageBreak' },
        { type: 'pageBreak' },
      ],
    };

    const result = analyzeEstimatedArtifactLayout(content);
    expect(result).not.toBeNull();

    const codes = result!.findings.map((finding) => finding.code);
    expect(codes).toContain('CHAPTER_HEADING_MID_PAGE');
    expect(codes).toContain('CONSECUTIVE_PAGE_BREAKS');
  });

  it('detects reference blocks stranded behind removable manual page breaks', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A'.repeat(900) }] },
        { type: 'pageBreak' },
        { type: 'statBlock', attrs: { name: 'Goblin Skirmisher' } },
      ],
    };

    const result = analyzeEstimatedArtifactLayout(content);
    expect(result).not.toBeNull();

    expect(result!.findings).toContainEqual(expect.objectContaining({
      code: 'REFERENCE_BLOCK_STRANDED_AFTER_BREAK',
      affectedScope: 'node-2',
    }));
  });

  it('treats chapterHeader blocks as chapter openers for mid-page detection', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A'.repeat(2400) }] },
        { type: 'chapterHeader', attrs: { title: 'Chapter Two', chapterNumber: '2' } },
      ],
    };

    const result = analyzeEstimatedArtifactLayout(content);
    expect(result).not.toBeNull();

    expect(result!.findings).toContainEqual(expect.objectContaining({
      code: 'CHAPTER_HEADING_MID_PAGE',
      affectedScope: 'node-1',
    }));
  });

  it('uses the shared text layout engine path in pretext mode without crashing on supported prose-heavy content', () => {
    const previousMode = process.env.TEXT_LAYOUT_ENGINE_MODE;
    process.env.TEXT_LAYOUT_ENGINE_MODE = 'pretext';

    try {
      const content = {
        type: 'doc',
        content: [
          { type: 'tableOfContents', attrs: { title: 'Contents' } },
          { type: 'chapterHeader', attrs: { chapterNumber: '1', title: 'A Black Banner Rises' } },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'A'.repeat(1800) }],
          },
          {
            type: 'readAloudBox',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'The ruined tollhouse leans over the road like a crooked watchman.' }],
              },
            ],
          },
        ],
      };

      const result = analyzeEstimatedArtifactLayout(content);
      expect(result).not.toBeNull();
      expect(result!.estimatedPages).toBeGreaterThan(0);
      expect(result!.pageSummaries).toHaveLength(result!.estimatedPages);
    } finally {
      if (previousMode === undefined) {
        delete process.env.TEXT_LAYOUT_ENGINE_MODE;
      } else {
        process.env.TEXT_LAYOUT_ENGINE_MODE = previousMode;
      }
    }
  });
});
