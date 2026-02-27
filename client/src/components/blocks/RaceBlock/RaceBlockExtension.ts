import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { RaceBlockView } from './RaceBlockView';

export interface RaceFeature {
  name: string;
  description: string;
}

export interface RaceBlockAttrs {
  name: string;
  abilityScoreIncreases: string;
  size: string;
  speed: string;
  languages: string;
  features: string;
}

export const RaceBlock = Node.create({
  name: 'raceBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      name: { default: 'Race Name' },
      abilityScoreIncreases: { default: '+2 Constitution, +1 Wisdom' },
      size: { default: 'Medium' },
      speed: { default: '30 ft.' },
      languages: { default: 'Common' },
      features: {
        default: JSON.stringify([
          { name: 'Darkvision', description: 'You can see in dim light within 60 feet of you as if it were bright light.' },
        ]),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-race-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-race-block': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(RaceBlockView);
  },
});
