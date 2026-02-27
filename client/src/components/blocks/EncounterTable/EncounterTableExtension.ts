import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { EncounterTableView } from './EncounterTableView';

export interface EncounterEntry {
  weight: number;
  description: string;
  cr: string;
}

export interface EncounterTableAttrs {
  environment: string;
  crRange: string;
  entries: string;
}

export const EncounterTable = Node.create({
  name: 'encounterTable',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      environment: { default: 'Forest' },
      crRange: { default: '1-4' },
      entries: {
        default: JSON.stringify([
          { weight: 1, description: '1d4 wolves', cr: '1/4' },
          { weight: 2, description: '1 dire wolf', cr: '1' },
          { weight: 3, description: '1d6 bandits', cr: '1/8' },
        ]),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-encounter-table]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-encounter-table': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EncounterTableView);
  },
});
