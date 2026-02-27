import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TableOfContentsView } from './TableOfContentsView';

export interface TableOfContentsAttrs {
  title: string;
}

export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      title: { default: 'Table of Contents' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-table-of-contents]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-table-of-contents': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsView);
  },
});
