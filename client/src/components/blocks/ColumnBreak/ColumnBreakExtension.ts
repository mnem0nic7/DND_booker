import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ColumnBreakView } from './ColumnBreakView';

export const ColumnBreak = Node.create({
  name: 'columnBreak',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {};
  },

  parseHTML() {
    return [{ tag: 'div[data-column-break]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-column-break': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnBreakView);
  },
});
