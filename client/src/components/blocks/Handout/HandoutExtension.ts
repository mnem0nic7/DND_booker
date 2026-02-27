import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { HandoutView } from './HandoutView';

export interface HandoutAttrs {
  title: string;
  style: 'letter' | 'scroll' | 'poster';
  content: string;
}

export const Handout = Node.create({
  name: 'handout',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      title: { default: 'Handout' },
      style: { default: 'letter' },
      content: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-handout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-handout': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HandoutView);
  },
});
