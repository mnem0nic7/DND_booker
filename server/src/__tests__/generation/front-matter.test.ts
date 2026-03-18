import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BibleContent, ChapterOutline } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { createRun } from '../../services/generation/run.service.js';
import {
  buildFrontMatterDocument,
  executeFrontMatterGeneration,
} from '../../services/generation/front-matter.service.js';

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_BIBLE: BibleContent = {
  title: 'The Blackglass Mine',
  summary: 'A one-shot about cursed echoes and a haunted mining settlement.',
  premise: 'The party must uncover the source of a mine-born curse before it swallows the town.',
  worldRules: {
    setting: 'A frontier mining town',
    era: 'Late medieval',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['mysterious', 'tense'],
    forbiddenElements: [],
    worldSpecificRules: [],
  },
  actStructure: [
    { act: 1, title: 'Descent', summary: 'Enter the mine and uncover the danger.', levelRange: { min: 4, max: 5 }, chapterSlugs: ['chapter-1', 'chapter-2'] },
  ],
  timeline: [],
  levelProgression: { type: 'milestone', milestones: ['Award a level after the finale if expanding into a campaign.'] },
  pageBudget: [],
  styleGuide: {
    voice: 'Dark fantasy',
    vocabulary: [],
    avoidTerms: [],
    narrativePerspective: 'second person',
    toneNotes: '',
  },
  openThreads: ['What bound the Gravel Guardian to the mine?'],
  entities: [
    { entityType: 'npc', name: 'Eldira Voss', slug: 'eldira-voss', summary: 'Tavern keeper who knows more than she says.', details: {} },
    { entityType: 'location', name: 'Blackglass Mine', slug: 'blackglass-mine', summary: 'A cursed tunnel complex under the town.', details: {} },
  ],
};

const SAMPLE_OUTLINE: ChapterOutline = {
  chapters: [
    {
      slug: 'chapter-1',
      title: 'Chapter 1: The Town',
      act: 1,
      sortOrder: 1,
      levelRange: { min: 4, max: 4 },
      targetPages: 2,
      summary: 'The party learns what the curse is doing to the town and who is hiding key facts.',
      keyEntities: ['eldira-voss'],
      sections: [],
    },
    {
      slug: 'chapter-2',
      title: 'Chapter 2: Into the Mine',
      act: 1,
      sortOrder: 2,
      levelRange: { min: 4, max: 5 },
      targetPages: 3,
      summary: 'The party descends into the mine, faces phantoms, and discovers the source of the haunting.',
      keyEntities: ['blackglass-mine'],
      sections: [],
    },
  ],
  appendices: [],
  totalPageEstimate: 8,
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `front-matter-test-${Date.now()}@test.com`,
      displayName: 'Front Matter Test',
      passwordHash: 'test-hash',
    },
  });

  testProject = await prisma.project.create({
    data: {
      title: 'Front Matter Test Project',
      userId: testUser.id,
    },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

describe('front-matter.service', () => {
  it('builds front matter with a TOC and DM brief for short adventures', () => {
    const doc = buildFrontMatterDocument(SAMPLE_BIBLE, SAMPLE_OUTLINE);
    const nodeTypes = (doc.content ?? []).map((node) => node.type);

    expect(nodeTypes[0]).toBe('titlePage');
    expect(nodeTypes).toContain('tableOfContents');
    expect(JSON.stringify(doc)).toContain('DM Brief');
    expect(JSON.stringify(doc)).toContain('Prep Checklist');
    expect(JSON.stringify(doc)).toContain('Adventure Flow');
  });

  it('creates an accepted front matter artifact for the run', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'Generate a haunted mine one-shot.',
    });

    const result = await executeFrontMatterGeneration(run!, SAMPLE_BIBLE, SAMPLE_OUTLINE);
    const artifact = await prisma.generatedArtifact.findUnique({ where: { id: result.artifactId } });

    expect(artifact).not.toBeNull();
    expect(artifact!.artifactType).toBe('front_matter_draft');
    expect(artifact!.artifactKey).toBe('front-matter');
    expect(artifact!.status).toBe('accepted');
    expect(JSON.stringify(artifact!.tiptapContent)).toContain('DM Brief');
  });
});
