import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MapBlockView } from './MapBlockView';

export interface MapBlockAttrs {
  src: string;
  scale: string;
  keyEntries: string;
  imagePrompt: string;
}

export const MapBlock = Node.create({
  name: 'mapBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      scale: { default: '1 inch = 5 feet' },
      keyEntries: { default: '[]' },
      imagePrompt: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-map-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-map-block': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MapBlockView);
  },
});
