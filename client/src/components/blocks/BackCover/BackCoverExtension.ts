import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { BackCoverView } from './BackCoverView';

export interface BackCoverAttrs {
  blurb: string;
  authorBio: string;
  authorImageUrl: string;
}

export const BackCover = Node.create({
  name: 'backCover',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      blurb: { default: 'A thrilling adventure awaits! Deep in the forgotten ruins, an ancient evil stirs. Heroes must brave deadly traps, cunning monsters, and dark sorcery to save the realm from certain doom.' },
      authorBio: { default: 'Author Name is a tabletop RPG designer and storyteller.' },
      authorImageUrl: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-back-cover]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-back-cover': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BackCoverView);
  },
});
