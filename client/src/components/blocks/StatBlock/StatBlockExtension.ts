import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { StatBlockView } from './StatBlockView';

export interface StatBlockAttrs {
  name: string;
  size: string;
  type: string;
  alignment: string;
  ac: number;
  acType: string;
  hp: number;
  hitDice: string;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  savingThrows: string;
  skills: string;
  damageResistances: string;
  damageImmunities: string;
  conditionImmunities: string;
  senses: string;
  languages: string;
  cr: string;
  xp: string;
  traits: string;
  actions: string;
  reactions: string;
  legendaryActions: string;
  legendaryDescription: string;
}

export const StatBlock = Node.create({
  name: 'statBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      name: { default: 'Creature Name' },
      size: { default: 'Medium' },
      type: { default: 'humanoid' },
      alignment: { default: 'neutral' },
      ac: { default: 10 },
      acType: { default: '' },
      hp: { default: 10 },
      hitDice: { default: '2d8+2' },
      speed: { default: '30 ft.' },
      str: { default: 10 },
      dex: { default: 10 },
      con: { default: 10 },
      int: { default: 10 },
      wis: { default: 10 },
      cha: { default: 10 },
      savingThrows: { default: '' },
      skills: { default: '' },
      damageResistances: { default: '' },
      damageImmunities: { default: '' },
      conditionImmunities: { default: '' },
      senses: { default: 'passive Perception 10' },
      languages: { default: 'Common' },
      cr: { default: '1' },
      xp: { default: '200' },
      traits: { default: '[]' },
      actions: { default: '[]' },
      reactions: { default: '[]' },
      legendaryActions: { default: '[]' },
      legendaryDescription: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-stat-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-stat-block': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(StatBlockView);
  },
});
