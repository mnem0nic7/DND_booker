import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ReadAloudBoxView } from './ReadAloudBoxView';

export type ReadAloudBoxStyle = 'parchment' | 'dark';

export interface ReadAloudBoxAttrs {
  style: ReadAloudBoxStyle;
}

export const ReadAloudBox = Node.create({
  name: 'readAloudBox',
  group: 'block',
  draggable: true,
  content: 'block+',

  addAttributes() {
    return {
      style: { default: 'parchment' as ReadAloudBoxStyle },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-read-aloud-box]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-read-aloud-box': '' }, HTMLAttributes),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReadAloudBoxView);
  },
});
