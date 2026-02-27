import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { SidebarCalloutView } from './SidebarCalloutView';

export type CalloutType = 'info' | 'warning' | 'lore';

export interface SidebarCalloutAttrs {
  title: string;
  calloutType: CalloutType;
}

export const SidebarCallout = Node.create({
  name: 'sidebarCallout',
  group: 'block',
  draggable: true,
  content: 'block+',

  addAttributes() {
    return {
      title: { default: 'Note' },
      calloutType: { default: 'info' as CalloutType },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-sidebar-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-sidebar-callout': '' }, HTMLAttributes),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SidebarCalloutView);
  },
});
