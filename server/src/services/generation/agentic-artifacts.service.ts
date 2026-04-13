import type {
  CriticReport,
  ImageBrief,
  InterviewBrief,
  LayoutDraft,
  NormalizedInput,
  PrintManifest,
  WriterStoryPacket,
} from '@dnd-booker/shared';
import { MODE_DEFAULTS } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

function stableJson(value: unknown) {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJsonValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortJsonValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function isUniqueConstraintError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';

  return Boolean(
    (error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: string }).code === 'P2002')
    || message.includes('Unique constraint failed'),
  );
}

async function getLatestArtifact(runId: string, artifactType: string, artifactKey: string) {
  return prisma.generatedArtifact.findFirst({
    where: { runId, artifactType, artifactKey },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function createVersionedArtifact(input: {
  runId: string;
  projectId: string;
  artifactType: string;
  artifactKey: string;
  title: string;
  summary: string | null;
  jsonContent: unknown;
  markdownContent?: string | null;
  metadata?: unknown;
  tokenCount?: number | null;
  status?: 'accepted' | 'generated';
}) {
  const nextJson = stableJson(input.jsonContent);
  const nextMetadata = input.metadata === undefined ? null : stableJson(input.metadata);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await getLatestArtifact(input.runId, input.artifactType, input.artifactKey);

    if (
      existing
      && stableJson(existing.jsonContent) === nextJson
      && (existing.summary ?? null) === (input.summary ?? null)
      && (existing.markdownContent ?? null) === (input.markdownContent ?? null)
      && (existing.title ?? null) === input.title
      && ((existing.metadata ?? null) === null ? null : stableJson(existing.metadata)) === nextMetadata
    ) {
      return existing;
    }

    try {
      return await prisma.generatedArtifact.create({
        data: {
          runId: input.runId,
          projectId: input.projectId,
          artifactType: input.artifactType,
          artifactKey: input.artifactKey,
          status: input.status ?? 'accepted',
          version: (existing?.version ?? 0) + 1,
          title: input.title,
          summary: input.summary,
          jsonContent: input.jsonContent as any,
          markdownContent: input.markdownContent ?? null,
          metadata: (input.metadata as any) ?? undefined,
          tokenCount: input.tokenCount ?? null,
          parentArtifactId: existing?.id ?? null,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error(`Failed to create versioned artifact ${input.artifactKey}.`);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function collectText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    return value.map((entry) => collectText(entry)).filter(Boolean).join(' ').trim();
  }
  const record = value as Record<string, unknown>;
  const direct = typeof record.text === 'string' ? record.text : '';
  const attrText = Object.values(record.attrs ?? {})
    .filter((entry) => typeof entry === 'string')
    .map((entry) => String(entry).trim())
    .filter(Boolean)
    .join(' ');
  const childText = collectText(record.content);
  return [direct, attrText, childText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function walkNodes(
  value: unknown,
  visitor: (node: Record<string, unknown>) => void,
) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const child of value) walkNodes(child, visitor);
    return;
  }

  const node = value as Record<string, unknown>;
  visitor(node);
  walkNodes(node.content, visitor);
}

export function buildNormalizedInputFromInterviewBrief(brief: InterviewBrief): NormalizedInput {
  const defaults = MODE_DEFAULTS[brief.generationMode];
  const pageTarget = Math.round((defaults.pageRange[0] + defaults.pageRange[1]) / 2);
  const chapterEstimate = Math.round((defaults.chapterRange[0] + defaults.chapterRange[1]) / 2);

  return {
    title: brief.title,
    summary: brief.summary,
    inferredMode: brief.generationMode,
    tone: brief.tone,
    themes: [brief.theme].filter(Boolean),
    setting: brief.theme,
    premise: brief.concept,
    levelRange: brief.levelRange,
    pageTarget,
    chapterEstimate,
    constraints: {
      strict5e: brief.settings.strict5e,
      includeHandouts: brief.settings.includeHandouts,
      includeMaps: brief.settings.includeMaps,
    },
    keyElements: {
      npcs: [],
      locations: [],
      plotHooks: brief.mustHaveElements,
      items: [],
    },
  };
}

export async function ensureWriterStoryPacketArtifact(run: {
  id: string;
  projectId: string;
}) {
  const [profileArtifact, bibleArtifact, outlineArtifact, chapterDrafts] = await Promise.all([
    getLatestArtifact(run.id, 'project_profile', 'project-profile'),
    getLatestArtifact(run.id, 'campaign_bible', 'campaign-bible'),
    getLatestArtifact(run.id, 'chapter_outline', 'chapter-outline'),
    prisma.generatedArtifact.findMany({
      where: {
        runId: run.id,
        artifactType: 'chapter_draft',
      },
      orderBy: [{ artifactKey: 'asc' }, { version: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  const profile = asObject(profileArtifact?.jsonContent) ?? {};
  const bible = asObject(bibleArtifact?.jsonContent) ?? {};
  const outline = outlineArtifact?.jsonContent ?? null;

  const latestDraftByKey = new Map<string, typeof chapterDrafts[number]>();
  for (const draft of chapterDrafts) {
    if (!latestDraftByKey.has(draft.artifactKey)) {
      latestDraftByKey.set(draft.artifactKey, draft);
    }
  }

  const entities = Array.isArray(bible.entities) ? bible.entities as Array<Record<string, unknown>> : [];
  const chapters = Array.isArray((outline as any)?.chapters) ? (outline as any).chapters as Array<Record<string, unknown>> : [];

  const packet: WriterStoryPacket = {
    title: String(profile.title ?? bible.title ?? 'Untitled Adventure'),
    summary: String(profile.summary ?? bible.summary ?? ''),
    outline,
    plotHooks: Array.isArray(asObject(profile.keyElements)?.plotHooks)
      ? asObject(profile.keyElements)?.plotHooks as string[]
      : [],
    cast: entities
      .filter((entity) => entity.entityType === 'npc' || entity.entityType === 'faction')
      .map((entity) => ({
        slug: String(entity.slug ?? ''),
        role: entity.entityType === 'npc' ? 'npc' : 'faction',
        name: String(entity.name ?? entity.canonicalName ?? ''),
        summary: String(entity.summary ?? ''),
      })),
    coreLocations: entities
      .filter((entity) => entity.entityType === 'location')
      .map((entity) => ({
        slug: String(entity.slug ?? ''),
        name: String(entity.name ?? entity.canonicalName ?? ''),
        summary: String(entity.summary ?? ''),
      })),
    encounterCadence: chapters.map((chapter) => {
      const sections = Array.isArray(chapter.sections) ? chapter.sections as Array<Record<string, unknown>> : [];
      return {
        chapterSlug: String(chapter.slug ?? ''),
        sectionCount: sections.length,
        encounterSectionCount: sections.filter((section) => section.contentType === 'encounter').length,
      };
    }),
    chapterSummaries: chapters.map((chapter) => ({
      slug: String(chapter.slug ?? ''),
      title: String(chapter.title ?? ''),
      summary: String(chapter.summary ?? latestDraftByKey.get(`chapter-draft-${chapter.slug}`)?.summary ?? ''),
    })),
    continuityAnchors: [
      ...(Array.isArray(bible.openThreads) ? bible.openThreads as string[] : []),
      ...(Array.isArray(bible.timeline)
        ? (bible.timeline as Array<Record<string, unknown>>).map((entry) => String(entry.event ?? entry.summary ?? '')).filter(Boolean)
        : []),
    ].slice(0, 24),
  };

  return createVersionedArtifact({
    runId: run.id,
    projectId: run.projectId,
    artifactType: 'writer_story_packet',
    artifactKey: 'writer-story-packet',
    title: packet.title,
    summary: packet.summary,
    jsonContent: packet,
  });
}

export async function ensureInsertBundleArtifacts(run: {
  id: string;
  projectId: string;
}) {
  const drafts = await prisma.generatedArtifact.findMany({
    where: { runId: run.id, artifactType: 'chapter_draft' },
    orderBy: [{ artifactKey: 'asc' }, { version: 'desc' }, { createdAt: 'desc' }],
  });

  const latestDraftByKey = new Map<string, typeof drafts[number]>();
  for (const draft of drafts) {
    if (!latestDraftByKey.has(draft.artifactKey)) {
      latestDraftByKey.set(draft.artifactKey, draft);
    }
  }

  const bundles = {
    readAloud: [] as unknown[],
    sidebar: [] as unknown[],
    handout: [] as unknown[],
    randomTable: [] as unknown[],
    statBlock: [] as unknown[],
    loot: [] as unknown[],
  };

  for (const draft of latestDraftByKey.values()) {
    const chapterSlug = draft.artifactKey.replace(/^chapter-draft-/, '');
    walkNodes(draft.tiptapContent, (node) => {
      const nodeType = typeof node.type === 'string' ? node.type : '';
      const payload = {
        chapterSlug,
        nodeType,
        title: String((node.attrs as Record<string, unknown> | undefined)?.title ?? (node.attrs as Record<string, unknown> | undefined)?.name ?? draft.title),
        content: collectText(node),
        attrs: node.attrs ?? {},
      };

      if (nodeType === 'readAloudBox') bundles.readAloud.push(payload);
      if (nodeType === 'sidebarCallout') bundles.sidebar.push(payload);
      if (nodeType === 'handout') bundles.handout.push(payload);
      if (nodeType === 'randomTable' || nodeType === 'encounterTable') bundles.randomTable.push(payload);
      if (nodeType === 'statBlock' || nodeType === 'npcProfile') bundles.statBlock.push(payload);
      if (nodeType === 'magicItem') bundles.loot.push(payload);
    });
  }

  const itemBundles = await prisma.generatedArtifact.findMany({
    where: { runId: run.id, artifactType: 'item_bundle' },
    orderBy: [{ artifactKey: 'asc' }, { version: 'desc' }, { createdAt: 'desc' }],
  });
  for (const artifact of itemBundles) {
    bundles.loot.push({
      chapterSlug: null,
      nodeType: 'item_bundle',
      title: artifact.title,
      content: artifact.summary ?? '',
      attrs: artifact.jsonContent ?? {},
    });
  }

  const created = await Promise.all([
    createVersionedArtifact({
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'read_aloud_bundle',
      artifactKey: 'read-aloud-bundle',
      title: 'Read Aloud Bundle',
      summary: `${bundles.readAloud.length} read-aloud insert${bundles.readAloud.length === 1 ? '' : 's'}.`,
      jsonContent: bundles.readAloud,
    }),
    createVersionedArtifact({
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'sidebar_bundle',
      artifactKey: 'sidebar-bundle',
      title: 'Sidebar Bundle',
      summary: `${bundles.sidebar.length} sidebar insert${bundles.sidebar.length === 1 ? '' : 's'}.`,
      jsonContent: bundles.sidebar,
    }),
    createVersionedArtifact({
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'handout_bundle',
      artifactKey: 'handout-bundle',
      title: 'Handout Bundle',
      summary: `${bundles.handout.length} handout insert${bundles.handout.length === 1 ? '' : 's'}.`,
      jsonContent: bundles.handout,
    }),
    createVersionedArtifact({
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'random_table_bundle',
      artifactKey: 'random-table-bundle',
      title: 'Random Table Bundle',
      summary: `${bundles.randomTable.length} table insert${bundles.randomTable.length === 1 ? '' : 's'}.`,
      jsonContent: bundles.randomTable,
    }),
    createVersionedArtifact({
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'stat_block_bundle',
      artifactKey: 'stat-block-bundle',
      title: 'Stat Block Bundle',
      summary: `${bundles.statBlock.length} stat insert${bundles.statBlock.length === 1 ? '' : 's'}.`,
      jsonContent: bundles.statBlock,
    }),
    createVersionedArtifact({
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'loot_bundle',
      artifactKey: 'loot-bundle',
      title: 'Loot Bundle',
      summary: `${bundles.loot.length} loot insert${bundles.loot.length === 1 ? '' : 's'}.`,
      jsonContent: bundles.loot,
    }),
  ]);

  return created;
}

export async function ensureLayoutDraftArtifacts(run: {
  id: string;
  projectId: string;
}) {
  const [documents, layoutArtifact, artArtifact] = await Promise.all([
    prisma.projectDocument.findMany({
      where: { runId: run.id, projectId: run.projectId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        kind: true,
      },
    }),
    getLatestArtifact(run.id, 'layout_plan', 'layout-plan'),
    getLatestArtifact(run.id, 'art_direction_plan', 'art-direction-plan'),
  ]);

  const artJson = asObject(artArtifact?.jsonContent);
  const placements = Array.isArray(artJson?.placements) ? artJson?.placements as ImageBrief[] : [];

  const layoutDraft: LayoutDraft = {
    documentCount: documents.length,
    documents: documents.map((document) => ({
      documentId: document.id,
      slug: document.slug,
      title: document.title,
      kind: document.kind,
      layoutArtifactKey: layoutArtifact?.artifactKey ?? null,
      imageSlotCount: placements.filter((placement) => placement.documentSlug === document.slug).length,
    })),
    imageBriefs: placements,
  };

  const [layoutDraftArtifact, imageBriefBundleArtifact] = await Promise.all([
    createVersionedArtifact({
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'layout_draft',
      artifactKey: 'layout-draft',
      title: 'Layout Draft',
      summary: `Layout draft for ${documents.length} document${documents.length === 1 ? '' : 's'}.`,
      jsonContent: layoutDraft,
    }),
    createVersionedArtifact({
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'image_brief_bundle',
      artifactKey: 'image-brief-bundle',
      title: 'Image Brief Bundle',
      summary: `${placements.length} image brief${placements.length === 1 ? '' : 's'}.`,
      jsonContent: placements,
    }),
  ]);

  return {
    layoutDraftArtifact,
    imageBriefBundleArtifact,
  };
}

function artifactOwnerForType(artifactType: string): CriticReport['findings'][number]['owner'] {
  if ([
    'project_profile',
    'campaign_bible',
    'chapter_outline',
    'chapter_plan',
    'chapter_draft',
    'front_matter_draft',
    'writer_story_packet',
  ].includes(artifactType)) {
    return 'writer';
  }

  if ([
    'npc_dossier',
    'location_brief',
    'faction_profile',
    'encounter_bundle',
    'item_bundle',
    'read_aloud_bundle',
    'sidebar_bundle',
    'handout_bundle',
    'random_table_bundle',
    'stat_block_bundle',
    'loot_bundle',
  ].includes(artifactType)) {
    return 'dnd_expert';
  }

  if (artifactType === 'image_asset') return 'artist';
  return 'layout_expert';
}

export async function createCriticReportArtifact(input: {
  runId: string;
  projectId: string;
  cycle: number;
  stage: 'critic_text_pass' | 'critic_image_pass';
  exportReview?: Record<string, unknown> | null;
}) {
  const artifacts = await prisma.generatedArtifact.findMany({
    where: { runId: input.runId },
    orderBy: [{ artifactKey: 'asc' }, { version: 'desc' }, { createdAt: 'desc' }],
    include: {
      evaluations: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  const latestByKey = new Map<string, typeof artifacts[number]>();
  for (const artifact of artifacts) {
    if (!latestByKey.has(artifact.artifactKey)) {
      latestByKey.set(artifact.artifactKey, artifact);
    }
  }

  const findings: CriticReport['findings'] = [];
  let scoreAccumulator = 0;
  let scoreCount = 0;
  let blockingFindingCount = 0;
  let majorFindingCount = 0;
  const routedRewriteCounts = {
    writer: 0,
    dndExpert: 0,
    layoutExpert: 0,
    artist: 0,
  };

  for (const artifact of latestByKey.values()) {
    const latestEvaluation = artifact.evaluations[0];
    if (latestEvaluation) {
      scoreAccumulator += latestEvaluation.overallScore;
      scoreCount += 1;
    }

    for (const finding of latestEvaluation?.findings as Array<Record<string, unknown>> ?? []) {
      const severity = String(finding.severity ?? 'minor') as CriticReport['findings'][number]['severity'];
      const owner = artifactOwnerForType(artifact.artifactType);
      findings.push({
        artifactId: artifact.id,
        artifactKey: artifact.artifactKey,
        artifactType: artifact.artifactType,
        owner,
        severity,
        code: String(finding.code ?? 'UNKNOWN'),
        message: String(finding.message ?? 'Unknown finding'),
      });
      if (severity === 'critical') blockingFindingCount += 1;
      if (severity === 'major') majorFindingCount += 1;
      if (severity === 'critical' || severity === 'major') {
        if (owner === 'writer') routedRewriteCounts.writer += 1;
        if (owner === 'dnd_expert') routedRewriteCounts.dndExpert += 1;
        if (owner === 'layout_expert') routedRewriteCounts.layoutExpert += 1;
        if (owner === 'artist') routedRewriteCounts.artist += 1;
      }
    }
  }

  if (input.exportReview && Array.isArray(input.exportReview.findings)) {
    for (const exportFinding of input.exportReview.findings as Array<Record<string, unknown>>) {
      const code = String(exportFinding.code ?? 'EXPORT_REVIEW');
      const owner = code.includes('ART') ? 'artist'
        : code.includes('STAT_BLOCK') || code.includes('TABLE')
          ? 'dnd_expert'
          : 'layout_expert';
      const severity = String(exportFinding.severity ?? 'minor') as CriticReport['findings'][number]['severity'];
      findings.push({
        artifactId: null,
        artifactKey: 'print-preview',
        artifactType: 'export_review',
        owner,
        severity,
        code,
        message: String(exportFinding.message ?? code),
      });
      if (severity === 'critical') blockingFindingCount += 1;
      if (severity === 'major') majorFindingCount += 1;
      if (severity === 'critical' || severity === 'major') {
        if (owner === 'artist') routedRewriteCounts.artist += 1;
        else if (owner === 'dnd_expert') routedRewriteCounts.dndExpert += 1;
        else routedRewriteCounts.layoutExpert += 1;
      }
    }
  }

  const overallScore = scoreCount > 0 ? Math.round(scoreAccumulator / scoreCount) : 0;
  const report: CriticReport = {
    cycle: input.cycle,
    stage: input.stage,
    passed: blockingFindingCount === 0 && majorFindingCount === 0,
    overallScore,
    blockingFindingCount,
    majorFindingCount,
    findings,
    routedRewriteCounts,
  };

  return createVersionedArtifact({
    runId: input.runId,
    projectId: input.projectId,
    artifactType: 'critic_report',
    artifactKey: `critic-report-${input.stage}-cycle-${input.cycle}`,
    title: `Critic Report Cycle ${input.cycle}`,
    summary: report.passed
      ? `Critic ${input.stage} passed with score ${overallScore}.`
      : `Critic ${input.stage} found ${blockingFindingCount + majorFindingCount} blocking issue(s).`,
    jsonContent: report,
  });
}

export async function createPrintManifestArtifact(input: {
  runId: string;
  projectId: string;
  sourceManifestId: string | null;
  latestCriticReportId: string | null;
  editorReportId: string | null;
}) {
  const documentCount = await prisma.projectDocument.count({
    where: { runId: input.runId, projectId: input.projectId },
  });

  const manifest: PrintManifest = {
    exportFormat: 'print_pdf',
    sourceManifestId: input.sourceManifestId,
    documentCount,
    latestCriticReportId: input.latestCriticReportId,
    editorReportId: input.editorReportId,
  };

  return createVersionedArtifact({
    runId: input.runId,
    projectId: input.projectId,
    artifactType: 'print_manifest',
    artifactKey: 'print-manifest',
    title: 'Print Manifest',
    summary: `Prepared final print manifest for ${documentCount} document${documentCount === 1 ? '' : 's'}.`,
    jsonContent: manifest,
  });
}
