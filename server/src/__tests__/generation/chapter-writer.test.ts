import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { BibleContent, ChapterOutlineEntry, ChapterPlan } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { executeChapterDraftGeneration } from '../../services/generation/chapter-writer.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
vi.mock('../../services/generation/markdown-artifact-conversion.service.js', () => ({
  convertMarkdownToTipTapWithTimeout: vi.fn(async (markdown: string) => {
    const { markdownToTipTap } = await import('../../services/ai-wizard.service.js');
    return markdownToTipTap(markdown);
  }),
}));
const mockGenerateText = vi.mocked(generateText);

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_BIBLE: BibleContent = {
  title: 'The Goblin Caves',
  summary: 'A one-shot adventure.',
  premise: 'Goblins raiding the village.',
  worldRules: {
    setting: 'The Duskhollow region',
    era: 'Medieval fantasy',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['adventurous'],
    forbiddenElements: [],
    worldSpecificRules: [],
  },
  actStructure: [
    { act: 1, title: 'Act 1', summary: 'Begin', levelRange: { min: 3, max: 5 }, chapterSlugs: ['ch-1'] },
  ],
  timeline: [],
  levelProgression: null,
  pageBudget: [],
  styleGuide: {
    voice: 'Adventurous',
    vocabulary: ['delve', 'torchlight'],
    avoidTerms: ['video game'],
    narrativePerspective: 'second person',
    toneNotes: 'Classic.',
  },
  openThreads: [],
  entities: [
    {
      entityType: 'npc',
      name: 'Chief Gnarltooth',
      slug: 'chief-gnarltooth',
      summary: 'Goblin chief.',
      details: { race: 'Goblin' },
    },
  ],
};

const SAMPLE_CHAPTER: ChapterOutlineEntry = {
  slug: 'ch-1-the-village',
  title: 'Chapter 1: The Village',
  act: 1,
  sortOrder: 1,
  levelRange: { min: 3, max: 3 },
  targetPages: 4,
  summary: 'Adventurers arrive and learn of the goblin threat.',
  keyEntities: ['chief-gnarltooth'],
  sections: [
    { slug: 'arrival', title: 'Arrival', sortOrder: 1, targetPages: 2, contentType: 'narrative', summary: 'PCs arrive at the village.' },
    { slug: 'the-elder', title: 'The Elder', sortOrder: 2, targetPages: 2, contentType: 'social', summary: 'PCs meet Elder Mara.' },
  ],
};

const SAMPLE_PLAN: ChapterPlan = {
  chapterSlug: 'ch-1-the-village',
  chapterTitle: 'Chapter 1: The Village',
  sections: [
    { slug: 'arrival', title: 'Arrival', contentType: 'narrative', targetWords: 800, outline: 'PCs arrive at the village.', keyBeats: ['arrival', 'first signs of damage'], entityReferences: ['chief-gnarltooth'], blocksNeeded: ['readAloud'] },
    { slug: 'the-elder', title: 'The Elder', contentType: 'social', targetWords: 600, outline: 'PCs meet Elder Mara.', keyBeats: ['introduction', 'quest offer'], entityReferences: [], blocksNeeded: ['dmTips'] },
  ],
  encounters: [],
  entityReferences: ['chief-gnarltooth'],
  readAloudCount: 2,
  dmTipCount: 1,
  difficultyProgression: 'No combat in this chapter.',
};

const SAMPLE_MARKDOWN = `## Chapter 1: The Village

### Arrival

:::readAloudBox
The winding forest road opens into a small valley. Before you lies Millbrook Village, its thatched roofs glinting in the afternoon sun.
:::

You arrive at Millbrook Village to find signs of recent goblin raids. Broken fences line the fields, and the villagers eye you with a mixture of hope and suspicion.

**Chief Gnarltooth** has been sending raiding parties from the caves to the north. The attacks have grown bolder over the past two weeks.

### The Elder

Elder Mara approaches your group with determined steps. Her silver hair catches the light as she speaks.

:::sidebarCallout
Elder Mara is desperate but proud. She will not beg for help, instead framing the quest as a business arrangement.
:::

She explains the situation and offers a reward of 50 gold pieces per adventurer to deal with the goblin threat.`;

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `chwriter-test-${Date.now()}@test.com`,
      displayName: `ChWriter Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'ChWriter Test Project', userId: testUser.id },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Chapter Writer Service — executeChapterDraftGeneration', () => {
  it('should create a chapter_draft artifact with markdown and TipTap content', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const result = await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    expect(result.chapterSlug).toBe('ch-1-the-village');
    expect(result.wordCount).toBeGreaterThan(0);

    const artifact = await prisma.generatedArtifact.findUnique({ where: { id: result.artifactId } });
    expect(artifact).not.toBeNull();
    expect(artifact!.artifactType).toBe('chapter_draft');
    expect(artifact!.artifactKey).toBe('chapter-draft-ch-1-the-village');
    expect(artifact!.markdownContent).toContain('Chapter 1: The Village');
    expect(artifact!.tiptapContent).not.toBeNull();
    expect(artifact!.tokenCount).toBe(5000);
    expect(artifact!.pageEstimate).toBe(4);
  });

  it('should create CanonReferences for entities referenced in the plan', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    // Create a canon entity that will be referenced
    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'chief-gnarltooth',
        canonicalName: 'Chief Gnarltooth',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'Goblin chief.',
      },
    });

    const result = await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    const refs = await prisma.canonReference.findMany({
      where: { artifactId: result.artifactId },
    });
    expect(refs.length).toBe(1);
    expect(refs[0].entityId).toBe(entity.id);
    expect(refs[0].referenceType).toBe('mentions');
  });

  it('should update run token count', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updatedRun!.actualTokens).toBe(5000);
  });

  it('should include bible context in the AI prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain('The Duskhollow region');
    expect(call.prompt).toContain('second person');
    expect(call.prompt).toContain('ch-1-the-village');
    expect(call.maxOutputTokens).toBe(6144);
  });

  it('should store word count in artifact metadata', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const result = await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    const artifact = await prisma.generatedArtifact.findUnique({ where: { id: result.artifactId } });
    const meta = artifact!.jsonContent as any;
    expect(meta.wordCount).toBe(result.wordCount);
    expect(meta.sectionCount).toBe(2);
  });

  it('should convert TipTap content with D&D blocks', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const result = await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    const artifact = await prisma.generatedArtifact.findUnique({ where: { id: result.artifactId } });
    const tiptap = artifact!.tiptapContent as any;
    expect(tiptap.type).toBe('doc');
    expect(tiptap.content.length).toBeGreaterThan(0);

    // Should contain heading and readAloud blocks
    const types = tiptap.content.map((n: any) => n.type);
    expect(types).toContain('heading');
    expect(types).toContain('readAloudBox');
  });

  it('should strip outer markdown fences before persisting and converting', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: `\`\`\`markdown\n${SAMPLE_MARKDOWN}\n\`\`\``,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'fenced markdown test',
    });

    const result = await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    const artifact = await prisma.generatedArtifact.findUniqueOrThrow({ where: { id: result.artifactId } });
    expect(artifact.markdownContent?.startsWith('```')).toBe(false);

    const tiptap = artifact.tiptapContent as any;
    const types = tiptap.content.map((node: any) => node.type);
    expect(types).toContain('heading');
    expect(types).not.toContain('codeBlock');
  });

  it('should keep markdown artifact even if TipTap conversion fails', async () => {
    const { convertMarkdownToTipTapWithTimeout } = await import('../../services/generation/markdown-artifact-conversion.service.js');
    vi.mocked(convertMarkdownToTipTapWithTimeout).mockRejectedValueOnce(new Error('conversion stalled'));

    mockGenerateText.mockResolvedValueOnce({
      text: SAMPLE_MARKDOWN,
      usage: { inputTokens: 2000, outputTokens: 3000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const result = await executeChapterDraftGeneration(
      run!,
      SAMPLE_CHAPTER,
      SAMPLE_PLAN,
      SAMPLE_BIBLE,
      [],
      {} as any,
      16384,
    );

    const artifact = await prisma.generatedArtifact.findUnique({ where: { id: result.artifactId } });
    expect(artifact).not.toBeNull();
    expect(artifact!.markdownContent).toContain('Chapter 1: The Village');
    expect(artifact!.tiptapContent).toBeNull();
  });
});
