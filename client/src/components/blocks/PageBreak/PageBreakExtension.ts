import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { PageBreakView } from './PageBreakView';

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {};
  },

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-page-break': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageBreakView);
  },
});
