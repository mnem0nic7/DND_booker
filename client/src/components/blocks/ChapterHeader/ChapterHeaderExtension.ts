import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ChapterHeaderView } from './ChapterHeaderView';

export interface ChapterHeaderAttrs {
  title: string;
  subtitle: string;
  chapterNumber: string;
  backgroundImage: string;
  imagePrompt: string;
}

export const ChapterHeader = Node.create({
  name: 'chapterHeader',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      title: { default: 'Chapter Title' },
      subtitle: { default: '' },
      chapterNumber: { default: '' },
      backgroundImage: { default: '' },
      imagePrompt: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-chapter-header]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-chapter-header': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChapterHeaderView);
  },
});
