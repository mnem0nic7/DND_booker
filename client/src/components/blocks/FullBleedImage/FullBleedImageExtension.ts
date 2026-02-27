import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { FullBleedImageView } from './FullBleedImageView';

export interface FullBleedImageAttrs {
  src: string;
  caption: string;
  position: 'full' | 'half' | 'quarter';
}

export const FullBleedImage = Node.create({
  name: 'fullBleedImage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      caption: { default: '' },
      position: { default: 'full' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-full-bleed-image]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-full-bleed-image': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FullBleedImageView);
  },
});
