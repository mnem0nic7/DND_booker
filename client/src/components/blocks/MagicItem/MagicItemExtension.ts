import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MagicItemView } from './MagicItemView';

export interface MagicItemAttrs {
  name: string;
  type: string;
  rarity: string;
  requiresAttunement: boolean;
  attunementRequirement: string;
  description: string;
  properties: string;
}

export const MagicItem = Node.create({
  name: 'magicItem',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      name: { default: 'Magic Item' },
      type: { default: 'wondrous' },
      rarity: { default: 'uncommon' },
      requiresAttunement: { default: false },
      attunementRequirement: { default: '' },
      description: { default: 'Describe the magic item here.' },
      properties: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-magic-item]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-magic-item': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MagicItemView);
  },
});
