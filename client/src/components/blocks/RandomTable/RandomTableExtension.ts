import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { RandomTableView } from './RandomTableView';

export interface RandomTableEntry {
  roll: string;
  result: string;
}

export interface RandomTableAttrs {
  title: string;
  dieType: string;
  entries: string;
}

export const RandomTable = Node.create({
  name: 'randomTable',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      title: { default: 'Random Table' },
      dieType: { default: 'd6' },
      entries: {
        default: JSON.stringify([
          { roll: '1', result: 'Result one' },
          { roll: '2', result: 'Result two' },
          { roll: '3', result: 'Result three' },
          { roll: '4', result: 'Result four' },
          { roll: '5', result: 'Result five' },
          { roll: '6', result: 'Result six' },
        ]),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-random-table]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-random-table': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(RandomTableView);
  },
});
