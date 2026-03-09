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
});
