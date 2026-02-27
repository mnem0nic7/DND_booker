import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ClassFeatureView } from './ClassFeatureView';

export interface ClassFeatureAttrs {
  name: string;
  level: number;
  className: string;
  description: string;
}

export const ClassFeature = Node.create({
  name: 'classFeature',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      name: { default: 'Feature Name' },
      level: { default: 1 },
      className: { default: 'Fighter' },
      description: { default: 'Describe the class feature here.' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-class-feature]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-class-feature': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ClassFeatureView);
  },
});
