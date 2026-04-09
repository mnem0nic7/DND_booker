import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { prisma } from '../config/database.js';
import {
  markdownToTipTap,
  parseInlineMarks,
  parseQuestionsResponse,
  parseOutlineResponse,
  summarizeSection,
} from '../services/ai-wizard.service.js';

// ── Unit tests (no database needed) ─────────────────────────────

describe('markdownToTipTap', () => {
  it('should convert a heading to TipTap heading node', () => {
    const result = markdownToTipTap('## My Heading');
    expect(result.type).toBe('doc');
    expect(result.content).toHaveLength(1);
    expect(result.content![0].type).toBe('heading');
    expect(result.content![0].attrs).toEqual({ level: 2 });
    expect(result.content![0].content![0].text).toBe('My Heading');
  });

  it('should convert multiple headings at different levels', () => {
    const result = markdownToTipTap('# H1\n## H2\n### H3');
    expect(result.content).toHaveLength(3);
    expect(result.content![0].attrs).toEqual({ level: 1 });
    expect(result.content![1].attrs).toEqual({ level: 2 });
    expect(result.content![2].attrs).toEqual({ level: 3 });
  });

  it('should convert paragraphs', () => {
    const result = markdownToTipTap('Hello world.\n\nSecond paragraph.');
    expect(result.content).toHaveLength(2);
    expect(result.content![0].type).toBe('paragraph');
    expect(result.content![1].type).toBe('paragraph');
  });

  it('should convert bold text', () => {
    const result = markdownToTipTap('This is **bold** text.');
    const para = result.content![0];
    expect(para.content).toHaveLength(3);
    expect(para.content![1].text).toBe('bold');
    expect(para.content![1].marks).toEqual([{ type: 'bold' }]);
  });

  it('should convert italic text', () => {
    const result = markdownToTipTap('This is *italic* text.');
    const para = result.content![0];
    const italicNode = para.content!.find((n) => n.marks?.[0]?.type === 'italic');
    expect(italicNode).toBeDefined();
    expect(italicNode!.text).toBe('italic');
  });

  it('should convert unordered lists', () => {
    const result = markdownToTipTap('- Item 1\n- Item 2\n- Item 3');
    expect(result.content).toHaveLength(1);
    expect(result.content![0].type).toBe('bulletList');
    expect(result.content![0].content).toHaveLength(3);
    expect(result.content![0].content![0].type).toBe('listItem');
  });

  it('should convert ordered lists', () => {
    const result = markdownToTipTap('1. First\n2. Second');
    expect(result.content).toHaveLength(1);
    expect(result.content![0].type).toBe('orderedList');
    expect(result.content![0].content).toHaveLength(2);
  });

  it('should convert horizontal rules', () => {
    const result = markdownToTipTap('Text above\n\n---\n\nText below');
    const hr = result.content!.find((n) => n.type === 'horizontalRule');
    expect(hr).toBeDefined();
  });

  it('should convert :::readAloudBox blocks', () => {
    const md = ':::readAloudBox\nThe cave entrance looms before you.\n:::';
    const result = markdownToTipTap(md);
    expect(result.content).toHaveLength(1);
    expect(result.content![0].type).toBe('readAloudBox');
    expect(result.content![0].content![0].type).toBe('paragraph');
  });

  it('should convert indented headings and readAloud aliases', () => {
    const md = `  ### The Tale of the Mine

  :::readAloud The cave entrance looms before you.`;
    const result = markdownToTipTap(md);

    expect(result.content).toHaveLength(2);
    expect(result.content![0]).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ text: 'The Tale of the Mine' }],
    });
    expect(result.content![1]).toMatchObject({
      type: 'readAloudBox',
    });
  });

  it('should convert dmTips aliases into sidebar callouts', () => {
    const md = ':::dmTips Telegraph the danger before initiative is rolled.';
    const result = markdownToTipTap(md);

    expect(result.content).toHaveLength(1);
    expect(result.content![0]).toMatchObject({
      type: 'sidebarCallout',
      attrs: { title: 'DM Tips', calloutType: 'info' },
    });
  });

  it('should convert same-line structured npcProfile blocks inside bullet lists into block nodes', () => {
    const md = '- :::npcProfile {"name":"Eldira Voss","race":"Human","role":"Tavern Keeper","traits":"Superstitious, distrustful","notes":"Knows about the previous mining operations."} :::';
    const result = markdownToTipTap(md);

    expect(result.content).toHaveLength(1);
    expect(result.content![0]).toMatchObject({
      type: 'npcProfile',
      attrs: {
        name: 'Eldira Voss',
        race: 'Human',
        class: 'Tavern Keeper',
        personalityTraits: 'Superstitious, distrustful',
        description: 'Knows about the previous mining operations.',
      },
    });
  });

  it('should convert heading-prefixed same-line wizard blocks into real block nodes', () => {
    const md = '    #### Handout :::handout {"title":"Caution: Blackglass Mine","style":"letter","content":"Beware the mine."} :::\n    #### Read Aloud :::readAloud The mine entrance exhales a grave-cold breath. :::';
    const result = markdownToTipTap(md);

    expect(result.content).toHaveLength(2);
    expect(result.content![0]).toMatchObject({
      type: 'handout',
      attrs: {
        title: 'Caution: Blackglass Mine',
        style: 'letter',
        content: 'Beware the mine.',
      },
    });
    expect(result.content![1]).toMatchObject({
      type: 'readAloudBox',
    });
  });

  it('should split malformed fenced dmTips blocks that swallow later headings and block markers', () => {
    const md = `:::dmTips
Keep the pressure on as the party crosses the threshold.
#### Handout :::handout {"title":"Caution: Blackglass Mine","style":"letter","content":"Beware the mine."} :::
### Strange Occurrences
#### Read Aloud :::readAloud The mine entrance exhales a grave-cold breath. :::
:::`;

    const result = markdownToTipTap(md);
    const types = result.content!.map((node) => node.type);

    expect(types).toEqual(['sidebarCallout', 'handout', 'heading', 'readAloudBox']);
    expect(result.content![0]).toMatchObject({
      type: 'sidebarCallout',
      attrs: { title: 'DM Tips', calloutType: 'info' },
    });
    expect(result.content![1]).toMatchObject({
      type: 'handout',
      attrs: {
        title: 'Caution: Blackglass Mine',
        style: 'letter',
      },
    });
    expect(result.content![2]).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ text: 'Strange Occurrences' }],
    });
    expect(result.content![3]).toMatchObject({
      type: 'readAloudBox',
    });
  });

  it('should convert :::statBlock blocks with JSON attrs', () => {
    const md = ':::statBlock\n{"name":"Goblin","size":"Small","type":"humanoid"}\n:::';
    const result = markdownToTipTap(md);
    expect(result.content).toHaveLength(1);
    expect(result.content![0].type).toBe('statBlock');
    expect(result.content![0].attrs).toEqual({
      name: 'Goblin',
      size: 'Small',
      type: 'humanoid',
    });
  });

  it('should recover multiline npcProfile blocks with bullet fields', () => {
    const md = `:::npcProfile {"name":"Elira the Elusive","race":"Human","class":"Rogue"}
- **Goal**: Maintain control of smuggling routes through deception.
- **Knowledge**: Intimate with the routes and conspiracies tied to the Sunken Relic.
- **Leverage**: Sworn to secrecy but holds a grudge against past betrayals.
- **Reaction**: Suspicious and cautious but willing to broker if profits are involved.
:::`;

    const result = markdownToTipTap(md);

    expect(result.content![0]).toMatchObject({
      type: 'npcProfile',
      attrs: {
        name: 'Elira the Elusive',
        race: 'Human',
        class: 'Rogue',
        goal: 'Maintain control of smuggling routes through deception.',
        whatTheyKnow: 'Intimate with the routes and conspiracies tied to the Sunken Relic.',
        leverage: 'Sworn to secrecy but holds a grudge against past betrayals.',
        likelyReaction: 'Suspicious and cautious but willing to broker if profits are involved.',
      },
    });
  });

  it('should recover multiline randomTable blocks with numbered entries', () => {
    const md = `:::randomTable {"title":"Marshland Hazards","dieType":"d6"}
1. Quicksand pocket hidden beneath thick mud. Momentary struggle; DC 13 Strength check to free a limb.
2. Swarming leeches burst from the water. DC 12 Constitution save or suffer 1d4 poison damage.
:::`;

    const result = markdownToTipTap(md);

    expect(result.content![0]).toMatchObject({
      type: 'randomTable',
      attrs: {
        title: 'Marshland Hazards',
        dieType: 'd6',
      },
    });
    expect(JSON.parse(String(result.content![0].attrs?.entries ?? '[]'))).toEqual([
      {
        roll: '1',
        result: 'Quicksand pocket hidden beneath thick mud. Momentary struggle; DC 13 Strength check to free a limb.',
      },
      {
        roll: '2',
        result: 'Swarming leeches burst from the water. DC 12 Constitution save or suffer 1d4 poison damage.',
      },
    ]);
  });

  it('should recover multiline encounterTable blocks with bullet detail fields', () => {
    const md = `:::encounterTable {"name":"Spectral Marsh Spirits","difficulty":"Medium"}
- **Terrain**: A circle of bog surrounded by dense mist and reflective water.
- **Enemy Tactics**: Spirits phase in and out of cover, exploiting obscured terrain.
- **Player Options**: Use Persuasion or Religion to attempt a peaceful resolution.
- **Rewards**: A Whispering Amulet and an engraved fragment of the Sunken Bell.
:::`;

    const result = markdownToTipTap(md);

    expect(result.content![0]).toMatchObject({
      type: 'encounterTable',
      attrs: {
        title: 'Spectral Marsh Spirits',
        difficulty: 'Medium',
        terrain: 'A circle of bog surrounded by dense mist and reflective water.',
        tactics: 'Spirits phase in and out of cover, exploiting obscured terrain.',
        rewards: 'A Whispering Amulet and an engraved fragment of the Sunken Bell.',
      },
    });
    expect(String(result.content![0].attrs?.notes ?? '')).toContain('Use Persuasion or Religion');
  });

  it('should recover multiline statBlock blocks with bullet detail fields', () => {
    const md = `:::statBlock {"name":"Marsh Spirit","size":"Medium","type":"Undead","challenge":1,"hit_points":"22","speed":"0 ft., fly 40 ft. (hover)"}
- **Armor Class**: 12
- **Hit Points**: 22 (5d8)
- **Damage Immunities**: Necrotic, Poison
- **Senses**: Darkvision 60 ft., passive Perception 10
- **Languages**: Understands Common but doesn't speak
- **Etherealness**: Can shift between the Ethereal and Material Plane.
- **Actions**: *Mournful Wail*: DC 13 Wisdom save or be frightened for 1 minute.
:::`;

    const result = markdownToTipTap(md);

    expect(result.content![0]).toMatchObject({
      type: 'statBlock',
      attrs: {
        name: 'Marsh Spirit',
        ac: 12,
        hp: 22,
        speed: 'fly 40 ft. (hover)',
        damageImmunities: 'Necrotic, Poison',
        senses: 'Darkvision 60 ft., passive Perception 10',
        languages: "Understands Common but doesn't speak",
      },
    });
    expect(String(result.content![0].attrs?.traits ?? '')).toContain('Etherealness');
    expect(String(result.content![0].attrs?.actions ?? '')).toContain('Mournful Wail');
  });

  it('should parse four-colon fenced utility blocks', () => {
    const md = `::::readAloud
*The marsh wind carries the sound of a bell.*
::::

::::npcProfile {"name":"Merrin","race":"Human","alignment":"Neutral","goal":"Protect the village","knowledge":"Knows the tunnels","leverage":"Needs allies","reaction":"Wary"}
::::

::::encounterTable {"name":"Goblin Patrol","difficulty":"Medium","location":"Forest edge"}
- **Enemies**: 4 Goblins
- **Tactics**: Ambush from cover
::::
`;

    const result = markdownToTipTap(md);

    expect(result.content?.some((node) => node.type === 'readAloudBox')).toBe(true);
    expect(result.content?.some((node) => node.type === 'npcProfile')).toBe(true);
    expect(result.content?.some((node) => node.type === 'encounterTable')).toBe(true);
  });

  it('should ignore stray closing fences after same-line structured blocks', () => {
    const md = `:::encounterTable {"name":"Goblin Patrol","difficulty":"Medium","location":"Forest edge"} :::
- **Enemies**: 4 Goblins
- **Tactics**: Ambush from cover
:::

#### Aftermath

The goblins scatter into the reeds.`;

    const result = markdownToTipTap(md);

    expect(result.content?.some((node) => node.type === 'encounterTable')).toBe(true);
    expect(result.content?.some((node) => node.type === 'heading')).toBe(true);
    expect(result.content?.some((node) => node.type === 'paragraph')).toBe(true);
  });

  it('should recover wizard blocks wrapped inside triple-backtick code fences', () => {
    const md = '```json\n:::statBlock\n{"name":"Gravel Guardian","armorClass":15,"hitPoints":85}\n```\n';
    const result = markdownToTipTap(md);

    expect(result.content).toHaveLength(1);
    expect(result.content![0]).toMatchObject({
      type: 'statBlock',
      attrs: {
        name: 'Gravel Guardian',
        ac: 15,
        hp: 85,
      },
    });
  });

  it('should normalize same-line structured block JSON aliases for legacy stat blocks', () => {
    const md = ':::statBlock {"name":"Phantom Apparition","armorClass":13,"hitPoints":10,"strength":1,"dexterity":15,"actions":[{"name":"Life Drain","description":"Melee Spell Attack: +4 to hit."}],"reactions":[{"type":"Incorporeal Movement","description":"The apparition moves through creatures."}]} :::';
    const result = markdownToTipTap(md);

    expect(result.content![0]).toMatchObject({
      type: 'statBlock',
      attrs: {
        name: 'Phantom Apparition',
        ac: 13,
        hp: 10,
        str: 1,
        dex: 15,
      },
    });
    expect(result.content![0].attrs?.actions).toContain('Life Drain');
    expect(result.content![0].attrs?.reactions).toContain('Incorporeal Movement');
  });

  it('should recover loose random-table JSON that uses response fields', () => {
    const md = ":::randomTable {title:'Artifact Interactions', dieType:'d10', entries:[{result:1,response:'The **Glowing Crystal** flares, revealing a hidden passage.'},{result:2,response:'Touching the **Miner\\'s Pick** triggers a painful curse.'}],} :::";
    const result = markdownToTipTap(md);

    expect(result.content![0]).toMatchObject({
      type: 'randomTable',
      attrs: {
        title: 'Artifact Interactions',
        dieType: 'd10',
      },
    });

    const entries = JSON.parse(String(result.content![0].attrs?.entries ?? '[]')) as Array<{ roll: string; result: string }>;
    expect(entries).toEqual([
      {
        roll: '1',
        result: 'The **Glowing Crystal** flares, revealing a hidden passage.',
      },
      {
        roll: '2',
        result: 'Touching the **Miner\'s Pick** triggers a painful curse.',
      },
    ]);
  });

  it('should handle :::sidebarCallout with default attrs', () => {
    const md = ':::sidebarCallout\nImportant note about the dungeon.\n:::';
    const result = markdownToTipTap(md);
    expect(result.content![0].type).toBe('sidebarCallout');
    expect(result.content![0].attrs).toEqual({ title: 'Note', calloutType: 'info' });
  });

  it('should fallback to paragraph when JSON parse fails in structured block', () => {
    const md = ':::statBlock\nnot valid json at all\n:::';
    const result = markdownToTipTap(md);
    // Should produce paragraph(s) instead of a statBlock
    expect(result.content![0].type).toBe('paragraph');
  });

  it('should handle mixed content with blocks and text', () => {
    const md = `## Introduction

The party arrives at the village.

:::readAloudBox
You see a small village nestled in the valley.
:::

The village elder approaches.`;

    const result = markdownToTipTap(md);
    expect(result.content!.length).toBeGreaterThanOrEqual(4);

    const types = result.content!.map((n) => n.type);
    expect(types).toContain('heading');
    expect(types).toContain('paragraph');
    expect(types).toContain('readAloudBox');
  });

  it('should handle empty input', () => {
    const result = markdownToTipTap('');
    expect(result.type).toBe('doc');
    expect(result.content).toEqual([]);
  });
});

describe('parseInlineMarks', () => {
  it('should parse plain text', () => {
    const nodes = parseInlineMarks('Hello world');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe('Hello world');
    expect(nodes[0].marks).toBeUndefined();
  });

  it('should parse bold+italic (***)', () => {
    const nodes = parseInlineMarks('***bold italic***');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe('bold italic');
    expect(nodes[0].marks).toEqual([{ type: 'bold' }, { type: 'italic' }]);
  });
});

describe('parseQuestionsResponse', () => {
  it('should parse valid JSON array', () => {
    const raw = '[{"id":"q1","question":"What theme?","options":["Dark","Light"]}]';
    const result = parseQuestionsResponse(raw);
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe('q1');
    expect(result![0].question).toBe('What theme?');
    expect(result![0].options).toEqual(['Dark', 'Light']);
  });

  it('should extract JSON from markdown fences', () => {
    const raw = '```json\n[{"id":"q1","question":"What level?"}]\n```';
    const result = parseQuestionsResponse(raw);
    expect(result).toHaveLength(1);
  });

  it('should return null for invalid input', () => {
    expect(parseQuestionsResponse('not json at all')).toBeNull();
    expect(parseQuestionsResponse('')).toBeNull();
  });

  it('should filter out invalid question objects', () => {
    const raw = '[{"id":"q1","question":"Valid"},{"bad":"object"}]';
    const result = parseQuestionsResponse(raw);
    expect(result).toHaveLength(1);
  });
});

describe('parseOutlineResponse', () => {
  it('should parse valid outline JSON', () => {
    const raw = JSON.stringify({
      adventureTitle: 'The Lost Mine',
      summary: 'An adventure about a lost mine.',
      sections: [
        { id: 'section-1', title: 'Intro', description: 'The beginning', blockHints: ['readAloudBox'], sortOrder: 0 },
      ],
    });
    const result = parseOutlineResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.adventureTitle).toBe('The Lost Mine');
    expect(result!.sections).toHaveLength(1);
    expect(result!.sections[0].blockHints).toEqual(['readAloudBox']);
  });

  it('should return null for missing required fields', () => {
    const raw = JSON.stringify({ summary: 'no title or sections' });
    expect(parseOutlineResponse(raw)).toBeNull();
  });

  it('should handle sections without blockHints', () => {
    const raw = JSON.stringify({
      adventureTitle: 'Title',
      summary: 'Summary',
      sections: [{ id: 's1', title: 'Sec 1', description: 'Desc' }],
    });
    const result = parseOutlineResponse(raw);
    expect(result!.sections[0].blockHints).toEqual([]);
  });

  it('should assign sortOrder when missing', () => {
    const raw = JSON.stringify({
      adventureTitle: 'Title',
      summary: 'Summary',
      sections: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
      ],
    });
    const result = parseOutlineResponse(raw);
    expect(result!.sections[0].sortOrder).toBe(0);
    expect(result!.sections[1].sortOrder).toBe(1);
  });
});

describe('summarizeSection', () => {
  it('should summarize markdown content', () => {
    const md = '## Heading\n\nSome paragraph content.\n\n:::statBlock\n{}\n:::';
    const summary = summarizeSection(md);
    expect(summary).toContain('Heading');
    expect(summary).toContain('Some paragraph content.');
    expect(summary).not.toContain(':::');
  });

  it('should truncate long content', () => {
    const md = 'A'.repeat(500);
    const summary = summarizeSection(md);
    expect(summary.length).toBeLessThanOrEqual(304); // 300 + "..."
  });
});

// ── Integration tests (require PostgreSQL) ──────────────────────

const TEST_USER = {
  email: 'wizard-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Wizard Test User',
};

let accessToken: string;
let projectId: string;
let testUserId: string;

describe('AI Wizard Routes', () => {
  beforeAll(async () => {
    // Clean up existing test data
    const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existingUser) {
      await prisma.aiWizardSession.deleteMany({ where: { userId: existingUser.id } }).catch(() => {});
      await prisma.aiChatMessage.deleteMany({
        where: { session: { userId: existingUser.id } },
      });
      await prisma.aiChatSession.deleteMany({ where: { userId: existingUser.id } });
      await prisma.project.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }
    await prisma.registrationInvite.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.registrationInvite.create({
      data: {
        email: TEST_USER.email,
        note: 'wizard test',
      },
    });

    const res = await request(app).post('/api/auth/register').send(TEST_USER);
    accessToken = res.body.accessToken;
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER.email } });
    testUserId = user.id;

    const projRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Wizard Test Campaign' });
    projectId = projRes.body.id;
  });

  afterAll(async () => {
    const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existingUser) {
      await prisma.aiWizardSession.deleteMany({ where: { userId: existingUser.id } }).catch(() => {});
      await prisma.aiChatMessage.deleteMany({
        where: { session: { userId: existingUser.id } },
      });
      await prisma.aiChatSession.deleteMany({ where: { userId: existingUser.id } });
      await prisma.project.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }
    await prisma.registrationInvite.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.$disconnect();
  });

  describe('GET /api/projects/:projectId/ai/wizard', () => {
    it('should return null session for new project', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/wizard`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.session).toBeNull();
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000/ai/wizard')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/wizard`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/projects/:projectId/ai/wizard/start', () => {
    it('should return 400 when AI is not configured', async () => {
      // Ensure no API key
      await request(app)
        .delete('/api/ai/settings/key')
        .set('Authorization', `Bearer ${accessToken}`);

      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/wizard/start`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('AI not configured');
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .post('/api/projects/00000000-0000-0000-0000-000000000000/ai/wizard/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/wizard/start`)
        .send({});

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/projects/:projectId/ai/wizard/parameters', () => {
    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/wizard/parameters`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ answers: {} }); // missing projectType

      expect(res.status).toBe(400);
    });

    it('should return 404 when no wizard session exists', async () => {
      // Clean any existing session
      await request(app)
        .delete(`/api/projects/${projectId}/ai/wizard`)
        .set('Authorization', `Bearer ${accessToken}`);

      // Ensure AI is configured with ollama (no key needed)
      await request(app)
        .post('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ provider: 'ollama', model: 'llama3.1:8b', baseUrl: 'http://host.docker.internal:11434' });

      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/wizard/parameters`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ projectType: 'one shot', answers: { q1: 'Dark fantasy' } });

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/wizard/parameters`)
        .send({ projectType: 'one shot', answers: {} });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/projects/:projectId/ai/wizard/apply', () => {
    it('should apply completed sections through the canonical publication pipeline', async () => {
      await prisma.aiWizardSession.upsert({
        where: { projectId_userId: { projectId, userId: testUserId } },
        create: {
          projectId,
          userId: testUserId,
          phase: 'review',
          sections: [
            {
              sectionId: 'section-1',
              title: 'Wizard Hook',
              markdown: '## Wizard Hook\n\nThe story turns.',
              status: 'completed',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Wizard Hook' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The story turns.' }] },
                ],
              },
            },
          ],
        },
        update: {
          phase: 'review',
          sections: [
            {
              sectionId: 'section-1',
              title: 'Wizard Hook',
              markdown: '## Wizard Hook\n\nThe story turns.',
              status: 'completed',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Wizard Hook' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'The story turns.' }] },
                ],
              },
            },
          ],
        },
      });

      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/wizard/apply`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sectionIds: ['section-1'] });

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body.project?.content ?? null)).toContain('Wizard Hook');

      const documents = await prisma.projectDocument.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
      });
      expect(documents.length).toBeGreaterThan(0);
      expect(documents.some((document) => JSON.stringify(document.content).includes('Wizard Hook'))).toBe(true);
      expect(documents.some((document) => JSON.stringify(document.canonicalDocJson).includes('Wizard Hook'))).toBe(true);
      expect(documents.some((document) => JSON.stringify(document.editorProjectionJson).includes('Wizard Hook'))).toBe(true);
      expect(documents.some((document) => (document.typstSource ?? '').includes('Wizard Hook'))).toBe(true);

      const updatedProject = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      expect(JSON.stringify(updatedProject.content)).toContain('Wizard Hook');

      const session = await prisma.aiWizardSession.findUniqueOrThrow({
        where: {
          projectId_userId: {
            projectId,
            userId: updatedProject.userId,
          },
        },
      });
      expect(session.phase).toBe('done');

      await prisma.aiWizardSession.delete({
        where: {
          projectId_userId: {
            projectId,
            userId: updatedProject.userId,
          },
        },
      });
    });

    it('should reject empty sectionIds', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/wizard/apply`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sectionIds: [] });

      expect(res.status).toBe(400);
    });

    it('should return 404 when no wizard session exists', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/wizard/apply`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sectionIds: ['section-1'] });

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/wizard/apply`)
        .send({ sectionIds: ['section-1'] });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/projects/:projectId/ai/wizard', () => {
    it('should delete wizard session (or succeed even if none exists)', async () => {
      const res = await request(app)
        .delete(`/api/projects/${projectId}/ai/wizard`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .delete(`/api/projects/${projectId}/ai/wizard`);

      expect(res.status).toBe(401);
    });
  });
});
