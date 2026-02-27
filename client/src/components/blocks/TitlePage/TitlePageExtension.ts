import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TitlePageView } from './TitlePageView';

export interface TitlePageAttrs {
  title: string;
  subtitle: string;
  author: string;
  coverImageUrl: string;
}

export const TitlePage = Node.create({
  name: 'titlePage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      title: { default: 'Adventure Title' },
      subtitle: { default: 'A D&D 5e Adventure' },
      author: { default: 'Author Name' },
      coverImageUrl: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-title-page]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-title-page': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TitlePageView);
  },
});
