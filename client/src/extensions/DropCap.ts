import { Extension } from '@tiptap/react';

declare module '@tiptap/react' {
  interface Commands<ReturnType> {
    dropCap: {
      toggleDropCap: () => ReturnType;
    };
  }
}

export const DropCap = Extension.create({
  name: 'dropCap',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          dropCap: {
            default: false,
            parseHTML: (element) => element.classList.contains('drop-cap'),
            renderHTML: (attributes) => {
              if (!attributes.dropCap) return {};
              return { class: 'drop-cap' };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      toggleDropCap:
        () =>
        ({ tr, state, dispatch }) => {
          const { $from } = state.selection;
          const node = $from.node($from.depth);
          if (node.type.name !== 'paragraph') return false;
          const pos = $from.before($from.depth);
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              dropCap: !node.attrs.dropCap,
            });
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
