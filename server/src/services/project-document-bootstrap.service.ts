import { Prisma } from '@prisma/client';
import type { DocumentContent, DocumentKind } from '@dnd-booker/shared';
import { prisma } from '../config/database.js';
import { resolveDocumentLayout } from './layout-plan.service.js';

const BLANK_DOC: DocumentContent = { type: 'doc', content: [{ type: 'paragraph' }] };
const FRONT_MATTER_BLOCK_TITLES: Record<string, string> = {
  titlePage: 'Title Page',
  tableOfContents: 'Table of Contents',
};
const BACK_MATTER_BLOCK_TITLES: Record<string, string> = {
  creditsPage: 'Credits',
  backCover: 'Back Cover',
};
const BREAK_NODE_TYPES = new Set(['pageBreak', 'columnBreak']);

type ProjectType = 'campaign' | 'one_shot' | 'supplement' | 'sourcebook';

export interface ProjectDocumentSeed {
  kind: DocumentKind;
  title: string;
  slug: string;
  sortOrder: number;
  content: DocumentContent;
  status: string;
}

interface DraftDocumentSeed {
  kind: DocumentKind;
  title: string;
  slugBase: string;
  content: DocumentContent;
}

interface MutableSection {
  kind: DocumentKind;
  title: string | null;
  nodes: DocumentContent[];
}

type ProjectWithContent = {
  id: string;
  userId: string;
  title: string;
  type: ProjectType;
  content: unknown;
};

export function splitProjectContentIntoDocuments(
  projectTitle: string,
  projectType: ProjectType,
  rawContent: unknown,
): ProjectDocumentSeed[] {
  const content = asDocumentContent(rawContent) ?? BLANK_DOC;
  const topLevelNodes = getTopLevelNodes(content);
  const drafts: DraftDocumentSeed[] = [];

  let current: MutableSection | null = null;
  let sawExplicitFrontMatter = false;
  let sawChapterContent = false;
  let sawBackMatter = false;

  const flushCurrent = () => {
    if (!current || current.nodes.length === 0) {
      current = null;
      return;
    }

    const resolvedTitle = resolveSectionTitle(current, projectTitle, projectType, drafts.length);

    drafts.push({
      kind: current.kind,
      title: resolvedTitle,
      slugBase: slugify(resolvedTitle),
      content: { type: 'doc', content: current.nodes },
    });
    current = null;
  };

  for (let index = 0; index < topLevelNodes.length; index += 1) {
    const node = topLevelNodes[index];
    const singletonSection = getSingletonSection(node);

    if (singletonSection) {
      flushCurrent();
      drafts.push({
        ...singletonSection,
        content: { type: 'doc', content: [node] },
      });
      if (singletonSection.kind === 'front_matter') sawExplicitFrontMatter = true;
      if (singletonSection.kind === 'back_matter') sawBackMatter = true;
      continue;
    }

    if (BREAK_NODE_TYPES.has(node.type)) {
      if (!current) continue;

      const nextMeaningful = findNextMeaningfulNode(topLevelNodes, index + 1);
      if (!nextMeaningful) continue;
      if (getSingletonSection(nextMeaningful) || isChapterBoundary(nextMeaningful)) continue;

      current.nodes.push(node);
      continue;
    }

    if (isChapterBoundary(node)) {
      flushCurrent();
      current = {
        kind: sawBackMatter ? 'back_matter' : 'chapter',
        title: getBoundaryTitle(node),
        nodes: [node],
      };
      sawChapterContent = true;
      continue;
    }

    if (!current) {
      const kind: DocumentKind = sawBackMatter
        ? 'back_matter'
        : sawChapterContent
          ? 'chapter'
          : sawExplicitFrontMatter
            ? 'front_matter'
            : 'chapter';

      current = {
        kind,
        title: null,
        nodes: [],
      };
      if (kind === 'chapter') {
        sawChapterContent = true;
      }
    }

    current.nodes.push(node);
  }

  flushCurrent();

  if (drafts.length === 0) {
    drafts.push(createFallbackDraft(projectTitle, projectType));
  }

  const usedSlugs = new Set<string>();
  return drafts.map((draft, index) => ({
    kind: draft.kind,
    title: draft.title,
    slug: makeUniqueSlug(draft.slugBase, usedSlugs),
    sortOrder: index,
    content: draft.content,
    status: 'draft',
  }));
}

export async function ensureProjectDocuments(projectId: string, userId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: projectId, userId },
        select: { id: true, userId: true, title: true, type: true, content: true },
      });
      if (!project) return null;

      const existing = await tx.projectDocument.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
        select: documentListSelect,
      });
      if (existing.length > 0) return existing;

      await materializeProjectDocuments(tx, project);

      return tx.projectDocument.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
        select: documentListSelect,
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      return prisma.projectDocument.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
        select: documentListSelect,
      });
    }
    throw error;
  }
}

export async function createProjectWithDocuments(
  userId: string,
  data: {
    title: string;
    description?: string;
    type?: ProjectType;
    templateContent?: unknown;
    settings: Prisma.InputJsonValue;
  },
) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        userId,
        title: data.title,
        description: data.description || '',
        type: data.type || 'campaign',
        settings: data.settings,
        content: (data.templateContent as Prisma.InputJsonValue) ?? BLANK_DOC,
      },
    });

    await materializeProjectDocuments(tx, {
      id: project.id,
      userId: project.userId,
      title: project.title,
      type: project.type,
      content: project.content,
    });

    return project;
  });
}

async function materializeProjectDocuments(
  tx: Prisma.TransactionClient,
  project: ProjectWithContent,
): Promise<void> {
  const docs = splitProjectContentIntoDocuments(
    project.title,
    project.type,
    project.content,
  );

  for (const doc of docs) {
    const resolvedLayout = resolveDocumentLayout({
      content: doc.content,
      kind: doc.kind,
      title: doc.title,
    });

    await tx.projectDocument.create({
      data: {
        projectId: project.id,
        runId: null,
        kind: doc.kind,
        title: doc.title,
        slug: doc.slug,
        sortOrder: doc.sortOrder,
        targetPageCount: null,
        outlineJson: Prisma.JsonNull,
        layoutPlan: resolvedLayout.layoutPlan as unknown as Prisma.InputJsonValue,
        content: resolvedLayout.content as unknown as Prisma.InputJsonValue,
        status: doc.status,
        sourceArtifactId: null,
      },
    });
  }
}

function getSingletonSection(node: DocumentContent): Omit<DraftDocumentSeed, 'content'> | null {
  if (node.type in FRONT_MATTER_BLOCK_TITLES) {
    return {
      kind: 'front_matter',
      title: FRONT_MATTER_BLOCK_TITLES[node.type],
      slugBase: slugify(FRONT_MATTER_BLOCK_TITLES[node.type]),
    };
  }

  if (node.type in BACK_MATTER_BLOCK_TITLES) {
    return {
      kind: 'back_matter',
      title: BACK_MATTER_BLOCK_TITLES[node.type],
      slugBase: slugify(BACK_MATTER_BLOCK_TITLES[node.type]),
    };
  }

  return null;
}

function isChapterBoundary(node: DocumentContent): boolean {
  return node.type === 'chapterHeader'
    || (node.type === 'heading' && Number(node.attrs?.level ?? 0) === 1);
}

function getBoundaryTitle(node: DocumentContent): string | null {
  if (node.type === 'chapterHeader') {
    const title = normalizeText(node.attrs?.title);
    return title || null;
  }

  if (node.type === 'heading') {
    const title = readText(node);
    return title || null;
  }

  return null;
}

function resolveSectionTitle(
  section: MutableSection,
  projectTitle: string,
  projectType: ProjectType,
  existingCount: number,
): string {
  if (section.title?.trim()) return section.title.trim();

  const inferred = inferTitleFromNodes(section.nodes);
  if (inferred) return inferred;

  if (section.kind === 'front_matter') {
    return existingCount === 0 ? 'Front Matter' : `Front Matter ${existingCount + 1}`;
  }

  if (section.kind === 'back_matter') {
    return 'Back Matter';
  }

  return normalizeText(projectTitle) || defaultTitleForType(projectType);
}

function inferTitleFromNodes(nodes: DocumentContent[]): string | null {
  for (const node of nodes) {
    if (node.type === 'chapterHeader') {
      const title = normalizeText(node.attrs?.title);
      if (title) return title;
    }
    if (node.type === 'heading') {
      const text = readText(node);
      if (text) return text;
    }
  }
  return null;
}

function createFallbackDraft(projectTitle: string, projectType: ProjectType): DraftDocumentSeed {
  const title = normalizeText(projectTitle) || defaultTitleForType(projectType);
  return {
    kind: 'chapter',
    title,
    slugBase: slugify(title),
    content: BLANK_DOC,
  };
}

function defaultTitleForType(projectType: ProjectType): string {
  switch (projectType) {
    case 'one_shot':
      return 'Adventure';
    case 'supplement':
      return 'Supplement Content';
    case 'sourcebook':
      return 'Sourcebook Content';
    default:
      return 'Campaign Notes';
  }
}

function getTopLevelNodes(content: DocumentContent): DocumentContent[] {
  if (content.type === 'doc') {
    return [...(content.content ?? [])];
  }
  return [content];
}

function asDocumentContent(value: unknown): DocumentContent | null {
  if (typeof value !== 'object' || value == null || !('type' in value)) return null;
  return value as DocumentContent;
}

function findNextMeaningfulNode(nodes: DocumentContent[], startIndex: number): DocumentContent | null {
  for (let index = startIndex; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!BREAK_NODE_TYPES.has(node.type)) return node;
  }
  return null;
}

function readText(node: DocumentContent): string {
  if (node.type === 'text') return normalizeText(node.text);
  return normalizeText((node.content ?? []).map(readText).join(' '));
}

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

function makeUniqueSlug(base: string, usedSlugs: Set<string>): string {
  let candidate = base || 'section';
  let suffix = 2;
  while (usedSlugs.has(candidate)) {
    candidate = `${base || 'section'}-${suffix}`;
    suffix += 1;
  }
  usedSlugs.add(candidate);
  return candidate;
}

const documentListSelect = {
  id: true,
  projectId: true,
  runId: true,
  kind: true,
  title: true,
  slug: true,
  sortOrder: true,
  targetPageCount: true,
  layoutPlan: true,
  status: true,
  sourceArtifactId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectDocumentSelect;
