import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CreditsPageView } from './CreditsPageView';

export interface CreditsPageAttrs {
  credits: string;
  legalText: string;
  copyrightYear: string;
}

export const CreditsPage = Node.create({
  name: 'creditsPage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      credits: { default: 'Written by Author Name\nEdited by Editor Name\nArt by Artist Name\nLayout by Layout Designer' },
      legalText: { default: 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License.' },
      copyrightYear: { default: new Date().getFullYear().toString() },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-credits-page]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-credits-page': '', ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CreditsPageView);
  },
});
