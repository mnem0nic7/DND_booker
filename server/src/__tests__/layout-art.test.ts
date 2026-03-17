import { describe, expect, it } from 'vitest';
import { materializeSparsePageArt } from '../services/layout-art.service.js';

describe('materializeSparsePageArt', () => {
  it('injects fresh prompt-bearing spot art blocks for chapter scenes', () => {
    const result = materializeSparsePageArt({
      kind: 'chapter',
      title: 'Chapter 1: Hollow\'s End',
      content: {
        type: 'doc',
        content: [
          {
            type: 'chapterHeader',
            attrs: {
              title: 'Hollow\'s End',
              chapterNumber: 'Chapter 1',
              backgroundImage: '/uploads/chapter-1.png',
              imagePrompt: 'A fog-bound frontier town.',
            },
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Meeting the Mayor' }],
          },
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'A long opening section that establishes the scene in detail, gives the Dungeon Master multiple beats to play, and provides enough concrete texture, reactions, and stakes that it should clearly count as substantial running text rather than a tiny closing note.',
            }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'A short closing paragraph that should stay after any inserted art.' }],
          },
        ],
      },
    });

    expect(result.changed).toBe(true);
    const nodes = result.content.content ?? [];
    expect(nodes.map((node) => node.type)).toEqual([
      'chapterHeader',
      'heading',
      'paragraph',
      'fullBleedImage',
      'paragraph',
    ]);
    expect(nodes[3]?.attrs?.src).toBe('');
    expect(nodes[3]?.attrs?.position).toBe('half');
    expect(nodes[3]?.attrs?.artRole).toBe('spot_art');
    expect(nodes[3]?.attrs?.layoutPlacementHint).toBe('side_panel');
    expect(nodes[3]?.attrs?.layoutSpanHint).toBe('column');
    expect(String(nodes[3]?.attrs?.imagePrompt || '')).toContain('Meeting the Mayor');
  });

  it('adds a sparse-page repair panel when review codes call for it', () => {
    const result = materializeSparsePageArt({
      kind: 'chapter',
      title: 'Chapter 2: The Mine',
      reviewCodes: ['EXPORT_UNUSED_PAGE_REGION'],
      content: {
        type: 'doc',
        content: [
          {
            type: 'chapterHeader',
            attrs: {
              title: 'The Mine',
              chapterNumber: 'Chapter 2',
              backgroundImage: '/uploads/chapter-2.png',
            },
          },
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'The miners\' trail descends through broken stone and old lantern hooks before the scene fades into a short closing summary.',
            }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Closing notes that are too short to fill the page well.' }],
          },
        ],
      },
    });

    expect(result.changed).toBe(true);
    const inserted = (result.content.content ?? []).filter((node) => node.type === 'fullBleedImage');
    expect(inserted).toHaveLength(1);
    const sparseRepair = inserted.find((node) => node.attrs?.artRole === 'sparse_page_repair');
    expect(sparseRepair?.attrs?.position).toBe('full');
    expect(sparseRepair?.attrs?.layoutSpanHint).toBe('both_columns');
    expect(sparseRepair?.attrs?.layoutPlacementHint).toBe('bottom_panel');
  });

  it('treats missed art opportunities as column-fill repair, not a wide sparse-page panel', () => {
    const result = materializeSparsePageArt({
      kind: 'front_matter',
      title: 'Front Matter',
      reviewCodes: ['EXPORT_MISSED_ART_OPPORTUNITY', 'EXPORT_UNBALANCED_COLUMNS'],
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'DM Brief' }],
          },
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'A front-matter summary sets the stakes, likely flow, and likely point of failure for the Dungeon Master.',
            }],
          },
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'A second block gives scaling advice and likely pressure points for the final confrontation.',
            }],
          },
        ],
      },
    });

    const inserted = (result.content.content ?? []).filter((node) => node.type === 'fullBleedImage');
    expect(inserted.some((node) => node.attrs?.artRole === 'column_fill_art')).toBe(true);
    expect(inserted.some((node) => node.attrs?.artRole === 'sparse_page_repair')).toBe(false);
  });

  it('treats a pure missed-art page as column-fill repair even without an unbalanced-column finding', () => {
    const result = materializeSparsePageArt({
      kind: 'front_matter',
      title: 'Front Matter',
      reviewCodes: ['EXPORT_MISSED_ART_OPPORTUNITY'],
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Adventure Flow' }],
          },
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'The brief overview explains how the session should escalate from rumor and investigation into confrontation underground.',
            }],
          },
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'A final setup paragraph leaves plenty of reclaimable blank space on the page.',
            }],
          },
        ],
      },
    });

    const inserted = (result.content.content ?? []).filter((node) => node.type === 'fullBleedImage');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.attrs?.artRole).toBe('column_fill_art');
    expect(inserted[0]?.attrs?.layoutSpanHint).toBe('column');
    expect(inserted[0]?.attrs?.layoutPlacementHint).toBe('side_panel');
  });

  it('dedupes repeated sparse-page repair art on later review passes', () => {
    const result = materializeSparsePageArt({
      kind: 'chapter',
      title: 'Chapter 1: The Town',
      reviewCodes: ['EXPORT_UNUSED_PAGE_REGION'],
      content: {
        type: 'doc',
        content: [
          {
            type: 'chapterHeader',
            attrs: {
              title: 'The Town',
              chapterNumber: 'Chapter 1',
              backgroundImage: '/uploads/chapter-1.png',
            },
          },
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'A long paragraph of scene framing that should remain before any repair art is placed.',
            }],
          },
          {
            type: 'fullBleedImage',
            attrs: {
              nodeId: 'repair-old',
              artRole: 'sparse_page_repair',
              src: '/uploads/repair-old.png',
              position: 'full',
              layoutSpanHint: 'both_columns',
              layoutPlacementHint: 'bottom_panel',
            },
          },
          {
            type: 'fullBleedImage',
            attrs: {
              nodeId: 'repair-new',
              artRole: 'sparse_page_repair',
              src: '/uploads/repair-new.png',
              position: 'full',
              layoutSpanHint: 'both_columns',
              layoutPlacementHint: 'bottom_panel',
            },
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'A short closing paragraph.' }],
          },
        ],
      },
    });

    expect(result.changed).toBe(true);
    const remainingRepairs = (result.content.content ?? []).filter((node) =>
      node.type === 'fullBleedImage' && node.attrs?.artRole === 'sparse_page_repair',
    );
    expect(remainingRepairs).toHaveLength(1);
    expect(remainingRepairs[0]?.attrs?.src).toBe('/uploads/repair-new.png');
  });

  it('does not layer new column-fill art onto a page that already has sparse-page repair art unless balancing is requested', () => {
    const result = materializeSparsePageArt({
      kind: 'chapter',
      title: 'Chapter 1: The Town',
      reviewCodes: ['EXPORT_MISSED_ART_OPPORTUNITY'],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'A short closing paragraph before the existing sparse-page repair art.' }],
          },
          {
            type: 'fullBleedImage',
            attrs: {
              nodeId: 'repair-existing',
              artRole: 'sparse_page_repair',
              src: '/uploads/repair-existing.png',
              position: 'full',
              layoutSpanHint: 'both_columns',
              layoutPlacementHint: 'bottom_panel',
            },
          },
        ],
      },
    });

    const inserted = (result.content.content ?? []).filter((node) => node.type === 'fullBleedImage');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.attrs?.artRole).toBe('sparse_page_repair');
  });

  it('removes stale column-fill art when a sparse-page repair panel already exists and balancing is not requested', () => {
    const result = materializeSparsePageArt({
      kind: 'chapter',
      title: 'Chapter 1: The Town',
      reviewCodes: ['EXPORT_MISSED_ART_OPPORTUNITY'],
      content: {
        type: 'doc',
        content: [
          {
            type: 'fullBleedImage',
            attrs: {
              nodeId: 'repair-existing',
              artRole: 'sparse_page_repair',
              src: '/uploads/repair-existing.png',
              position: 'full',
              layoutSpanHint: 'both_columns',
              layoutPlacementHint: 'bottom_panel',
            },
          },
          {
            type: 'fullBleedImage',
            attrs: {
              nodeId: 'overflow-existing',
              artRole: 'column_fill_art',
              src: '/uploads/overflow-existing.png',
              position: 'full',
              layoutSpanHint: 'column',
              layoutPlacementHint: 'side_panel',
            },
          },
        ],
      },
    });

    const inserted = (result.content.content ?? []).filter((node) => node.type === 'fullBleedImage');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.attrs?.artRole).toBe('sparse_page_repair');
  });

  it('retunes existing sparse repair art into column recovery art when sparse pages also need column balancing', () => {
    const result = materializeSparsePageArt({
      kind: 'chapter',
      title: 'Chapter 1: The Town',
      reviewCodes: ['EXPORT_UNUSED_PAGE_REGION', 'EXPORT_UNBALANCED_COLUMNS'],
      content: {
        type: 'doc',
        content: [
          {
            type: 'chapterHeader',
            attrs: {
              title: 'The Town',
              chapterNumber: 'Chapter 1',
              backgroundImage: '/uploads/chapter-1.png',
            },
          },
          {
            type: 'fullBleedImage',
            attrs: {
              nodeId: 'spot-art-1',
              artRole: 'spot_art',
              src: '/uploads/spot-art.png',
              position: 'half',
              layoutSpanHint: 'column',
              layoutPlacementHint: 'side_panel',
            },
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'The final rumors in town foreshadow the danger beneath the mine.' }],
          },
          {
            type: 'fullBleedImage',
            attrs: {
              nodeId: 'repair-1',
              artRole: 'sparse_page_repair',
              src: '/uploads/repair-wide.png',
              imageAssetId: 'repair-asset',
              position: 'full',
              layoutSpanHint: 'both_columns',
              layoutPlacementHint: 'bottom_panel',
            },
          },
        ],
      },
    });

    expect(result.changed).toBe(true);
    expect(result.insertedNodeIds).toContain('repair-1');
    const repaired = (result.content.content ?? []).find((node) => node?.attrs?.nodeId === 'repair-1');
    expect(repaired?.attrs?.artRole).toBe('column_fill_art');
    expect(repaired?.attrs?.layoutSpanHint).toBe('column');
    expect(repaired?.attrs?.layoutPlacementHint).toBe('side_panel');
    expect(repaired?.attrs?.position).toBe('full');
    expect(repaired?.attrs?.src).toBe('');
    expect(repaired?.attrs?.imageAssetId).toBe('');
  });

  it('retunes existing overflow art back into a sparse repair panel for pure sparse pages', () => {
    const result = materializeSparsePageArt({
      kind: 'chapter',
      title: 'Chapter 1: The Town',
      reviewCodes: ['EXPORT_UNUSED_PAGE_REGION'],
      content: {
        type: 'doc',
        content: [
          {
            type: 'chapterHeader',
            attrs: {
              title: 'The Town',
              chapterNumber: 'Chapter 1',
              backgroundImage: '/uploads/chapter-1.png',
            },
          },
          {
            type: 'fullBleedImage',
            attrs: {
              nodeId: 'spot-art-1',
              artRole: 'spot_art',
              src: '/uploads/spot-art.png',
              position: 'half',
              layoutSpanHint: 'column',
              layoutPlacementHint: 'side_panel',
            },
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'The final rumors in town foreshadow the danger beneath the mine.' }],
          },
          {
            type: 'fullBleedImage',
            attrs: {
              nodeId: 'overflow-1',
              artRole: 'overflow_spot_art',
              src: '/uploads/overflow-art.png',
              imageAssetId: 'overflow-asset',
              position: 'half',
              layoutSpanHint: 'column',
              layoutPlacementHint: 'side_panel',
            },
          },
        ],
      },
    });

    expect(result.changed).toBe(true);
    expect(result.insertedNodeIds).toContain('overflow-1');
    const repaired = (result.content.content ?? []).find((node) => node?.attrs?.nodeId === 'overflow-1');
    expect(repaired?.attrs?.artRole).toBe('sparse_page_repair');
    expect(repaired?.attrs?.layoutSpanHint).toBe('both_columns');
    expect(repaired?.attrs?.layoutPlacementHint).toBe('bottom_panel');
    expect(repaired?.attrs?.position).toBe('full');
    expect(repaired?.attrs?.src).toBe('');
    expect(repaired?.attrs?.imageAssetId).toBe('');
  });
});
