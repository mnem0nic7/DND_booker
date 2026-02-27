import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { SpellCardView } from './SpellCardView';

export interface SpellCardAttrs {
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  higherLevels: string;
}

export const SpellCard = Node.create({
  name: 'spellCard',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      name: { default: 'Spell Name' },
      level: { default: 0 },
      school: { default: 'evocation' },
      castingTime: { default: '1 action' },
      range: { default: '60 feet' },
      components: { default: 'V, S' },
      duration: { default: 'Instantaneous' },
      description: { default: 'Describe the spell effect here.' },
      higherLevels: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-spell-card]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-spell-card': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SpellCardView);
  },
});
