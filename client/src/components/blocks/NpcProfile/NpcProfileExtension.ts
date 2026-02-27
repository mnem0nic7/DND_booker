import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NpcProfileView } from './NpcProfileView';

export interface NpcProfileAttrs {
  name: string;
  race: string;
  class: string;
  description: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  portraitUrl: string;
}

export const NpcProfile = Node.create({
  name: 'npcProfile',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      name: { default: 'NPC Name' },
      race: { default: 'Human' },
      class: { default: 'Commoner' },
      description: { default: 'A brief description of the NPC.' },
      personalityTraits: { default: '' },
      ideals: { default: '' },
      bonds: { default: '' },
      flaws: { default: '' },
      portraitUrl: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-npc-profile]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-npc-profile': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NpcProfileView);
  },
});
