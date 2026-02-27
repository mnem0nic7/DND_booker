import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { PageBorderView } from './PageBorderView';

export interface PageBorderAttrs {
  borderStyle: 'elvish' | 'dwarven' | 'infernal' | 'simple';
}

export const PageBorder = Node.create({
  name: 'pageBorder',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      borderStyle: { default: 'simple' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-page-border]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-page-border': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageBorderView);
  },
});
