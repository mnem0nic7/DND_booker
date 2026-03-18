import type { BibleContent, ChapterOutline, DocumentContent } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';

export interface FrontMatterResult {
  artifactId: string;
  tiptapContent: DocumentContent;
}

export async function executeFrontMatterGeneration(
  run: { id: string; projectId: string },
  bible: BibleContent,
  outline: ChapterOutline,
): Promise<FrontMatterResult> {
  const tiptapContent = buildFrontMatterDocument(bible, outline);
  const chapterCount = outline.chapters.length;

  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'front_matter_draft',
      artifactKey: 'front-matter',
      status: 'accepted',
      version: 1,
      title: `${bible.title} — Front Matter`,
      summary: `Title page and DM brief for ${chapterCount} chapter${chapterCount === 1 ? '' : 's'}.`,
      jsonContent: {
        chapterCount,
        totalPageEstimate: outline.totalPageEstimate,
        includesToc: shouldIncludeFrontMatterToc(outline),
      } as any,
      tiptapContent: tiptapContent as any,
      pageEstimate: 3,
      tokenCount: 0,
    },
  });

  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'front_matter_draft',
    title: artifact.title,
    version: artifact.version,
  });

  return {
    artifactId: artifact.id,
    tiptapContent,
  };
}

export function buildFrontMatterDocument(
  bible: BibleContent,
  outline: ChapterOutline,
): DocumentContent {
  const levelRange = summarizeLevelRange(outline);
  const runtime = estimateRuntime(outline.totalPageEstimate, outline.chapters.length);
  const prepChecklist = buildPrepChecklist(bible, outline);
  const chapterFlow = outline.chapters.map((chapter) =>
    `${chapter.title}: ${chapter.summary}`.trim(),
  );
  const secrets = buildSecretsAndPressure(bible, outline);
  const rewardsAndScaling = buildRewardsAndScaling(bible, outline);

  const content: DocumentContent[] = [
    {
      type: 'titlePage',
      attrs: {
        title: bible.title,
        subtitle: outline.chapters.length <= 4 ? 'A D&D 5e One-Shot Adventure' : 'A D&D 5e Adventure',
        author: '',
        coverImageUrl: '',
        imagePrompt: '',
      },
    },
  ];

  if (shouldIncludeFrontMatterToc(outline)) {
    content.push({
      type: 'tableOfContents',
      attrs: { title: 'Table of Contents', depth: 1 },
    });
  }

  content.push(
    heading(2, 'DM Brief'),
    paragraph(bible.summary || bible.premise),
    bulletList([
      `Recommended Levels: ${levelRange}`,
      `Estimated Runtime: ${runtime}`,
      `Structure: ${outline.chapters.length} chapter${outline.chapters.length === 1 ? '' : 's'} across about ${outline.totalPageEstimate} pages`,
      `Primary Premise: ${bible.premise}`,
    ]),
    heading(3, 'Adventure Flow'),
    orderedList(chapterFlow),
    heading(3, 'Secrets, Pressure, and Fail Forward'),
    bulletList(secrets),
    heading(3, 'Rewards and Scaling'),
    bulletList(rewardsAndScaling),
    heading(3, 'Prep Checklist'),
    bulletList(prepChecklist),
  );

  return {
    type: 'doc',
    content,
  };
}

function shouldIncludeFrontMatterToc(outline: ChapterOutline): boolean {
  return outline.chapters.length > 0;
}

function summarizeLevelRange(outline: ChapterOutline): string {
  if (outline.chapters.length === 0) return '1-3';
  const mins = outline.chapters.map((chapter) => chapter.levelRange.min);
  const maxes = outline.chapters.map((chapter) => chapter.levelRange.max);
  return `${Math.min(...mins)}-${Math.max(...maxes)}`;
}

function estimateRuntime(totalPages: number, chapterCount: number): string {
  if (chapterCount <= 4 || totalPages <= 12) return '1 session (3-5 hours)';
  if (totalPages <= 24) return '2-3 sessions';
  return 'multi-session adventure';
}

function buildSecretsAndPressure(bible: BibleContent, outline: ChapterOutline): string[] {
  const items: string[] = [];

  if (bible.openThreads.length > 0) {
    items.push(...bible.openThreads.slice(0, 3).map((thread) => `Carry this unresolved pressure into play: ${thread}`));
  }

  if (outline.chapters[0]) {
    items.push(`Opening pressure: ${outline.chapters[0].summary}`);
  }
  if (outline.chapters.at(-1)) {
    items.push(`Climactic payoff: ${outline.chapters.at(-1)!.summary}`);
  }

  items.push('Let failures change the route, allies, or available clues instead of stalling the adventure.');

  return items.slice(0, 4);
}

function buildRewardsAndScaling(bible: BibleContent, outline: ChapterOutline): string[] {
  const items: string[] = [];

  if (bible.levelProgression?.type === 'milestone' && bible.levelProgression.milestones.length > 0) {
    items.push(`Use milestone advancement: ${bible.levelProgression.milestones.join('; ')}`);
  } else {
    items.push('Treat discoveries, surviving the climax, and securing allies as the primary reward beats.');
  }

  const keyEntityNames = bible.entities
    .filter((entity) => entity.entityType === 'item' || entity.entityType === 'npc' || entity.entityType === 'location')
    .slice(0, 3)
    .map((entity) => entity.name);
  if (keyEntityNames.length > 0) {
    items.push(`Connect treasure, leverage, or aftermath to these anchors: ${keyEntityNames.join(', ')}.`);
  }

  if (outline.chapters.length > 0) {
    items.push(`If the party is struggling, trim one hostile pressure point from ${outline.chapters.at(-1)!.title}; if they are cruising, reinforce the final obstacle with extra reinforcements, a countdown, or a harder consequence.`);
  }

  return items;
}

function buildPrepChecklist(bible: BibleContent, outline: ChapterOutline): string[] {
  const items = [
    `Review the chapter flow for ${outline.chapters.map((chapter) => chapter.title).join(', ')}.`,
    'Mark the random encounter and encounter tables so you can reference them without scanning prose.',
    'Highlight any clues, rewards, and fail-forward consequences you want to surface quickly at the table.',
  ];

  const npcNames = bible.entities
    .filter((entity) => entity.entityType === 'npc')
    .slice(0, 3)
    .map((entity) => entity.name);
  if (npcNames.length > 0) {
    items.push(`Review the core NPCs before play: ${npcNames.join(', ')}.`);
  }

  return items;
}

function heading(level: number, text: string): DocumentContent {
  return {
    type: 'heading',
    attrs: { level },
    content: [textNode(text)],
  };
}

function paragraph(text: string): DocumentContent {
  return {
    type: 'paragraph',
    content: [textNode(text)],
  };
}

function bulletList(items: string[]): DocumentContent {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraph(item)],
    })),
  };
}

function orderedList(items: string[]): DocumentContent {
  return {
    type: 'orderedList',
    attrs: { start: 1 },
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraph(item)],
    })),
  };
}

function textNode(text: string): DocumentContent {
  return {
    type: 'text',
    text,
  };
}
