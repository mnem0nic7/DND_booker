import type { DocumentContent } from '../types/document.js';
import type { LayoutPlan, PageModelFragment, PagePreset, ResolveLayoutPlanOptions } from '../types/layout-plan.js';
import { compilePageModel } from '../layout-plan.js';
import { renderNode } from './tiptap-to-html.js';

function classesForFragment(fragment: PageModelFragment): string {
  const classes = [
    'layout-fragment',
    `layout-span-${fragment.span}`,
    `layout-placement-${fragment.placement}`,
    `layout-node-${fragment.nodeType}`,
  ];

  if (fragment.keepTogether) classes.push('layout-keep-together');
  if (fragment.allowWrapBelow) classes.push('layout-allow-wrap-below');
  return classes.join(' ');
}

function isFlowFragment(fragment: PageModelFragment): boolean {
  return !fragment.groupId && fragment.span === 'column' && fragment.placement === 'inline';
}

function renderFragment(fragment: PageModelFragment): string {
  return `<div class="${classesForFragment(fragment)}" data-node-id="${fragment.nodeId}" data-node-type="${fragment.nodeType}" data-presentation-order="${fragment.presentationOrder}" draggable="true">
    ${renderNode(fragment.content)}
  </div>`;
}

function renderGroup(groupId: string, fragments: PageModelFragment[], recipe: string | null): string {
  const nodeTypes = new Set(fragments.map((fragment) => fragment.nodeType));
  const isNpcGrid = recipe === 'npc_roster_grid' || (nodeTypes.size === 1 && nodeTypes.has('npcProfile'));
  const isEncounterPacket = recipe === 'encounter_packet_spread' || nodeTypes.has('statBlock') || nodeTypes.has('encounterTable');
  const isUtilityPacket = recipe === 'utility_table_spread' || nodeTypes.has('mapBlock') || nodeTypes.has('randomTable') || nodeTypes.has('handout');

  if (isNpcGrid) {
    return `<div class="layout-group layout-group-npc-grid" data-group-id="${groupId}">
      ${fragments.map((fragment) => renderFragment(fragment)).join('\n')}
    </div>`;
  }

  if (isEncounterPacket || isUtilityPacket) {
    const sidePanel = fragments.filter((fragment) => fragment.placement === 'side_panel');
    const mainFlow = fragments.filter((fragment) => fragment.placement !== 'side_panel');
    return `<div class="layout-group layout-group-packet" data-group-id="${groupId}">
      <div class="layout-group-packet__side">${sidePanel.map((fragment) => renderFragment(fragment)).join('\n')}</div>
      <div class="layout-group-packet__main">${mainFlow.map((fragment) => renderFragment(fragment)).join('\n')}</div>
    </div>`;
  }

  return `<div class="layout-group layout-group-stack" data-group-id="${groupId}">
    ${fragments.map((fragment) => renderFragment(fragment)).join('\n')}
  </div>`;
}

export function getCanonicalLayoutCss(): string {
  return `
    .layout-root {
      column-count: var(--layout-column-count, 2);
      column-gap: var(--layout-column-gap, 32px);
      column-rule: var(--layout-column-rule, 1px solid rgba(0, 0, 0, 0.06));
      min-height: inherit;
      display: block;
    }

    .layout-root[data-document-kind="front_matter"],
    .layout-root[data-document-kind="back_matter"] {
      column-count: 1;
      column-rule: none;
    }

    .layout-fragment,
    .layout-group,
    .layout-flow {
      margin-bottom: 0.9rem;
    }

    .layout-flow > *:first-child {
      margin-top: 0;
    }

    .layout-flow > *:last-child {
      margin-bottom: 0;
    }

    .layout-span-both_columns,
    .layout-group-npc-grid,
    .layout-group-packet,
    .layout-group-stack {
      column-span: all;
    }

    .layout-span-full_page {
      column-span: all;
      break-before: page;
      break-after: page;
    }

    .layout-placement-hero_top {
      column-span: all;
      break-inside: avoid;
      margin-bottom: 1.2rem;
    }

    .layout-keep-together,
    .layout-group {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .layout-group-npc-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
      align-items: start;
    }

    .layout-group-packet {
      display: grid;
      grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
      gap: 1rem;
      align-items: start;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .layout-group-packet__side,
    .layout-group-packet__main {
      min-width: 0;
    }

    .layout-group-packet__side:empty {
      display: none;
    }

    .layout-group-stack {
      display: block;
    }

    .layout-node-chapterHeader,
    .layout-node-fullBleedImage,
    .layout-node-mapBlock,
    .layout-node-handout,
    .layout-node-titlePage,
    .layout-node-tableOfContents,
    .layout-node-creditsPage,
    .layout-node-backCover {
      break-inside: avoid;
    }
  `;
}

export function renderContentWithLayoutPlan(input: {
  content: DocumentContent;
  layoutPlan?: LayoutPlan | null;
  preset?: PagePreset;
  options?: ResolveLayoutPlanOptions;
}): { html: string; pageModel: ReturnType<typeof compilePageModel> } {
  const pageModel = compilePageModel(
    input.content,
    input.layoutPlan,
    input.preset ?? 'editor_preview',
    input.options,
  );

  const htmlParts: string[] = [];
  let groupId: string | null = null;
  let groupFragments: PageModelFragment[] = [];
  let flowHtml: string[] = [];

  const flushFlow = () => {
    if (flowHtml.length === 0) return;
    htmlParts.push(`<div class="layout-flow">${flowHtml.join('\n')}</div>`);
    flowHtml = [];
  };

  const flushGroup = () => {
    if (!groupId || groupFragments.length === 0) return;
    flushFlow();
    htmlParts.push(renderGroup(groupId, groupFragments, pageModel.pages[0]?.recipe ?? null));
    groupId = null;
    groupFragments = [];
  };

  for (const fragment of pageModel.fragments) {
    if (isFlowFragment(fragment)) {
      flushGroup();
      flowHtml.push(renderFragment(fragment));
      continue;
    }

    if (!fragment.groupId) {
      flushGroup();
      htmlParts.push(renderFragment(fragment));
      continue;
    }

    if (groupId === fragment.groupId) {
      groupFragments.push(fragment);
      continue;
    }

    flushGroup();
    groupId = fragment.groupId;
    groupFragments = [fragment];
  }

  flushGroup();
  flushFlow();

  return {
    html: `<div class="layout-root" data-layout-recipe="${pageModel.pages[0]?.recipe ?? ''}" data-document-kind="${input.options?.documentKind ?? ''}">
      ${htmlParts.join('\n')}
    </div>`,
    pageModel,
  };
}
