import type { DocumentContent } from '../types/document.js';
import type { LayoutFlowFragment, LayoutFlowModel, LayoutPlan, PageModel, PageModelFragment, PagePreset, ResolveLayoutPlanOptions } from '../types/layout-plan.js';
import { compileFlowModel, compilePageModel } from '../layout-plan.js';
import { renderNode } from './tiptap-to-html.js';

function classesForFragment(fragment: Pick<PageModelFragment | LayoutFlowFragment, 'span' | 'placement' | 'nodeType' | 'keepTogether' | 'allowWrapBelow'>): string {
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

function renderFragment(fragment: LayoutFlowFragment | PageModelFragment): string {
  return `<div class="${classesForFragment(fragment)}" data-node-id="${fragment.nodeId}" data-node-type="${fragment.nodeType}" data-presentation-order="${fragment.presentationOrder}" draggable="true">
    ${renderNode(fragment.content)}
  </div>`;
}

function renderGroup(groupId: string, fragments: Array<LayoutFlowFragment | PageModelFragment>, recipe: string | null, unitId?: string): string {
  const nodeTypes = new Set(fragments.map((fragment) => fragment.nodeType));
  const isNpcGrid = recipe === 'npc_roster_grid' || (nodeTypes.size === 1 && nodeTypes.has('npcProfile'));
  const isEncounterPacket = recipe === 'encounter_packet_spread' || nodeTypes.has('statBlock') || nodeTypes.has('encounterTable');
  const isUtilityPacket = recipe === 'utility_table_spread' || nodeTypes.has('mapBlock') || nodeTypes.has('randomTable') || nodeTypes.has('handout');
  const dataAttr = unitId ? ` data-layout-unit-id="${unitId}"` : '';

  if (isNpcGrid) {
    return `<div class="layout-group layout-group-npc-grid"${dataAttr} data-group-id="${groupId}">
      ${fragments.map((fragment) => renderFragment(fragment)).join('\n')}
    </div>`;
  }

  if (isEncounterPacket || isUtilityPacket) {
    const sidePanel = fragments.filter((fragment) => fragment.placement === 'side_panel');
    const mainFlow = fragments.filter((fragment) => fragment.placement !== 'side_panel');
    return `<div class="layout-group layout-group-packet"${dataAttr} data-group-id="${groupId}">
      <div class="layout-group-packet__side">${sidePanel.map((fragment) => renderFragment(fragment)).join('\n')}</div>
      <div class="layout-group-packet__main">${mainFlow.map((fragment) => renderFragment(fragment)).join('\n')}</div>
    </div>`;
  }

  return `<div class="layout-group layout-group-stack"${dataAttr} data-group-id="${groupId}">
    ${fragments.map((fragment) => renderFragment(fragment)).join('\n')}
  </div>`;
}

function sortFragmentsForDisplay<T extends { presentationOrder: number; bounds?: { y: number; x: number }; pageIndex?: number }>(fragments: T[]): T[] {
  return [...fragments].sort((left, right) => {
    if (typeof left.pageIndex === 'number' && typeof right.pageIndex === 'number' && left.pageIndex !== right.pageIndex) {
      return left.pageIndex - right.pageIndex;
    }
    if (left.bounds && right.bounds) {
      if (left.bounds.y !== right.bounds.y) return left.bounds.y - right.bounds.y;
      if (left.bounds.x !== right.bounds.x) return left.bounds.x - right.bounds.x;
    }
    return left.presentationOrder - right.presentationOrder;
  });
}

function renderFlowUnit(
  flow: LayoutFlowModel,
  fragments: LayoutFlowFragment[],
  unitId: string,
): string {
  const ordered = sortFragmentsForDisplay(fragments);
  const lead = ordered[0];
  if (!lead) return '';

  if (lead.groupId) {
    return renderGroup(lead.groupId, ordered, flow.sectionRecipe, unitId);
  }

  return `<div class="layout-unit" data-layout-unit-id="${unitId}">
    ${renderFragment(lead)}
  </div>`;
}

function renderFlowHtml(flow: LayoutFlowModel, documentKind: string | null | undefined): string {
  const unitsById = new Map(flow.units.map((unit) => [unit.id, unit]));
  const fragmentsByUnit = new Map<string, LayoutFlowFragment[]>();
  for (const fragment of flow.fragments) {
    const entry = fragmentsByUnit.get(fragment.unitId) ?? [];
    entry.push(fragment);
    fragmentsByUnit.set(fragment.unitId, entry);
  }

  const htmlParts = flow.units.map((unit) => renderFlowUnit(flow, fragmentsByUnit.get(unit.id) ?? [], unit.id));
  return `<div class="layout-flow-root" data-layout-recipe="${flow.sectionRecipe ?? ''}" data-document-kind="${documentKind ?? ''}">
    ${htmlParts.join('\n')}
  </div>`;
}

function renderPageUnit(
  pageModel: PageModel,
  fragments: PageModelFragment[],
  unitId: string,
): string {
  const ordered = sortFragmentsForDisplay(fragments);
  const lead = ordered[0];
  if (!lead) return '';

  if (lead.groupId) {
    return renderGroup(lead.groupId, ordered, pageModel.pages[0]?.recipe ?? null, unitId);
  }

  return `<div class="layout-unit" data-layout-unit-id="${unitId}">
    ${renderFragment(lead)}
  </div>`;
}

function renderRegionUnits(
  pageModel: PageModel,
  fragments: PageModelFragment[],
): string {
  const byUnit = new Map<string, PageModelFragment[]>();
  for (const fragment of fragments) {
    const entry = byUnit.get(fragment.unitId) ?? [];
    entry.push(fragment);
    byUnit.set(fragment.unitId, entry);
  }

  return [...byUnit.entries()]
    .sort((left, right) => {
      const leftFragment = sortFragmentsForDisplay(left[1])[0];
      const rightFragment = sortFragmentsForDisplay(right[1])[0];
      if (!leftFragment || !rightFragment) return 0;
      if (leftFragment.bounds.y !== rightFragment.bounds.y) return leftFragment.bounds.y - rightFragment.bounds.y;
      if (leftFragment.bounds.x !== rightFragment.bounds.x) return leftFragment.bounds.x - rightFragment.bounds.x;
      return leftFragment.presentationOrder - rightFragment.presentationOrder;
    })
    .map(([unitId, unitFragments]) => renderPageUnit(pageModel, unitFragments, unitId))
    .join('\n');
}

function renderPagedHtml(pageModel: PageModel, footerTitle: string | null | undefined, pageNumberOffset = 0): string {
  return `<div class="layout-page-stack" data-layout-recipe="${pageModel.pages[0]?.recipe ?? ''}">
    ${pageModel.pages.map((page) => {
      const heroFragments = page.fragments.filter((fragment) => fragment.region === 'hero');
      const fullWidthFragments = page.fragments.filter((fragment) => fragment.region === 'full_width' || fragment.region === 'full_page');
      const leftFragments = page.fragments.filter((fragment) => fragment.region === 'column_left');
      const rightFragments = page.fragments.filter((fragment) => fragment.region === 'column_right');
      const isSingleColumn = rightFragments.length === 0;

      return `<section class="layout-page page-canvas" data-page-index="${page.index}" data-layout-recipe="${page.recipe ?? ''}">
        <div class="layout-page__body ProseMirror">
          ${heroFragments.length > 0 ? `<div class="layout-page__hero">${renderRegionUnits(pageModel, heroFragments)}</div>` : ''}
          ${fullWidthFragments.length > 0 ? `<div class="layout-page__full-width">${renderRegionUnits(pageModel, fullWidthFragments)}</div>` : ''}
          <div class="layout-page__columns${isSingleColumn ? ' layout-page__columns--single' : ''}">
            <div class="layout-page__column layout-page__column--left">${renderRegionUnits(pageModel, leftFragments)}</div>
            ${isSingleColumn ? '' : `<div class="layout-page__column layout-page__column--right">${renderRegionUnits(pageModel, rightFragments)}</div>`}
          </div>
        </div>
        <div class="page-footer">
          <span>${footerTitle ?? ''}</span>
          <span>${page.index + pageNumberOffset}</span>
        </div>
      </section>`;
    }).join('\n')}
  </div>`;
}

export function getCanonicalLayoutCss(): string {
  return `
    .layout-flow-root {
      column-count: var(--layout-column-count, 2);
      column-gap: var(--layout-column-gap, 32px);
      column-rule: var(--layout-column-rule, 1px solid rgba(0, 0, 0, 0.06));
      min-height: inherit;
      display: block;
    }

    .layout-flow-root[data-document-kind="front_matter"],
    .layout-flow-root[data-document-kind="back_matter"] {
      column-count: 1;
      column-rule: none;
    }

    .layout-page-stack {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }

    .layout-page {
      page-break-after: always;
      break-after: page;
    }

    .layout-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    .layout-page__body {
      display: flex;
      flex-direction: column;
      min-height: var(--content-height, 912px);
    }

    .layout-page__hero,
    .layout-page__full-width {
      margin-bottom: 1rem;
    }

    .layout-page__columns {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--layout-column-gap, 32px);
      align-items: start;
      min-height: 0;
      flex: 1;
    }

    .layout-page__columns--single {
      grid-template-columns: minmax(0, 1fr);
    }

    .layout-page__column {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
    }

    .layout-unit,
    .layout-fragment,
    .layout-group {
      margin-bottom: 0.9rem;
    }

    .layout-flow-root > .layout-unit,
    .layout-flow-root > .layout-group {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .layout-page__column > *:last-child,
    .layout-page__hero > *:last-child,
    .layout-page__full-width > *:last-child {
      margin-bottom: 0;
    }

    .layout-flow-root .layout-unit,
    .layout-flow-root .layout-group,
    .layout-page .layout-unit,
    .layout-page .layout-group {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .layout-span-both_columns,
    .layout-span-full_page,
    .layout-placement-hero_top {
      width: 100%;
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
      page-break-inside: avoid;
    }
  `;
}

export function renderFlowContentWithLayoutPlan(input: {
  content: DocumentContent;
  layoutPlan?: LayoutPlan | null;
  preset?: PagePreset;
  options?: ResolveLayoutPlanOptions;
}): {
  html: string;
  flowModel: LayoutFlowModel;
  pageModel: PageModel;
} {
  const resolved = compileFlowModel(
    input.content,
    input.layoutPlan,
    input.preset ?? 'editor_preview',
    input.options,
  );
  const pageModel = compilePageModel(
    resolved.content,
    resolved.layoutPlan,
    input.preset ?? 'editor_preview',
    input.options,
  );

  return {
    html: renderFlowHtml(resolved.flow, input.options?.documentKind ?? null),
    flowModel: resolved.flow,
    pageModel,
  };
}

export function renderContentWithLayoutPlan(input: {
  content: DocumentContent;
  layoutPlan?: LayoutPlan | null;
  pageModel?: PageModel | null;
  preset?: PagePreset;
  options?: ResolveLayoutPlanOptions;
  footerTitle?: string | null;
  pageNumberOffset?: number;
}): { html: string; pageModel: PageModel } {
  const pageModel = input.pageModel ?? compilePageModel(
    input.content,
    input.layoutPlan,
    input.preset ?? 'editor_preview',
    input.options,
  );

  if ((input.preset ?? 'editor_preview') === 'epub') {
    const flow = renderFlowContentWithLayoutPlan({
      content: input.content,
      layoutPlan: input.layoutPlan,
      preset: input.preset,
      options: input.options,
    });
    return {
      html: flow.html,
      pageModel,
    };
  }

  return {
    html: renderPagedHtml(pageModel, input.footerTitle ?? input.options?.documentTitle ?? null, input.pageNumberOffset ?? 0),
    pageModel,
  };
}
