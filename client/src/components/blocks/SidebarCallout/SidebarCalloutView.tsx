import { useState } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { CalloutType } from './SidebarCalloutExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';

const CALLOUT_TYPES: { value: CalloutType; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'lore', label: 'Lore' },
];

export function SidebarCalloutView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const title = node.attrs.title as string;
  const calloutType = node.attrs.calloutType as CalloutType;
  const [editingTitle, setEditingTitle] = useState(false);

  return (
    <NodeViewWrapper>
      <div
        className={`sidebar-callout sidebar-callout--${calloutType}${selected ? ' sidebar-callout--selected' : ''}`}
      >
        {/* Delete button */}
        <button
          className="sidebar-callout__delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete callout"
          contentEditable={false}
        >
          Delete
        </button>

        {/* Header with drag handle */}
        <div className="sidebar-callout__header" data-drag-handle="">
          <div className="sidebar-callout__title-area">
            {selected && editingTitle ? (
              <input
                className="sidebar-callout__title-input"
                value={title}
                onChange={(e) => updateAttributes({ title: e.target.value })}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingTitle(false);
                }}
                autoFocus
              />
            ) : (
              <span
                className="sidebar-callout__title"
                onClick={() => selected && setEditingTitle(true)}
              >
                {title}
              </span>
            )}
          </div>

          {/* AI + Type selector (visible when selected) */}
          {selected && (
            <div
              className="sidebar-callout__type-selector"
              contentEditable={false}
            >
              <AiGenerateButton blockType="sidebarCallout" onGenerated={updateAttributes} />
              <AiAutoFillButton blockType="sidebarCallout" currentAttrs={{ title, calloutType }} onApply={updateAttributes} />
              {CALLOUT_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  className={`sidebar-callout__type-btn${calloutType === ct.value ? ' sidebar-callout__type-btn--active' : ''}`}
                  onClick={() => updateAttributes({ calloutType: ct.value })}
                  type="button"
                >
                  {ct.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Editable content area */}
        <NodeViewContent className="sidebar-callout__content" />
      </div>
    </NodeViewWrapper>
  );
}
