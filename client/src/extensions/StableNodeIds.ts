import { Extension } from '@tiptap/core';

const NODE_ID_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'table',
  'statBlock',
  'readAloudBox',
  'sidebarCallout',
  'chapterHeader',
  'spellCard',
  'magicItem',
  'randomTable',
  'npcProfile',
  'encounterTable',
  'classFeature',
  'raceBlock',
  'fullBleedImage',
  'mapBlock',
  'handout',
  'pageBorder',
  'pageBreak',
  'columnBreak',
  'titlePage',
  'tableOfContents',
  'creditsPage',
  'backCover',
] as const;

export const StableNodeIds = Extension.create({
  name: 'stableNodeIds',

  addGlobalAttributes() {
    return [
      {
        types: [...NODE_ID_TYPES],
        attributes: {
          nodeId: {
            default: null,
            renderHTML: (attributes: Record<string, unknown>) => {
              if (!attributes.nodeId) return {};
              return { 'data-node-id': String(attributes.nodeId) };
            },
            parseHTML: (element: HTMLElement) => element.getAttribute('data-node-id'),
          },
        },
      },
    ];
  },
});
