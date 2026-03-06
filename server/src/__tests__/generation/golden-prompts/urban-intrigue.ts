import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';

export const PROMPT = 'A level 1-10 campaign of political intrigue in a floating city';

export const EXPECTED_INTAKE: NormalizedInput = {
  title: 'Skyhold: City of Whispers',
  summary: 'A political intrigue campaign spanning levels 1-10 in a magically floating city.',
  inferredMode: 'campaign',
  tone: 'political intrigue',
  themes: ['politics', 'betrayal', 'power', 'mystery'],
  setting: 'Skyhold, a magnificent city floating above the clouds, held aloft by ancient magic.',
  premise: 'The Anchor Stones that keep the city aloft are failing, and rival factions are scheming to control the remaining power.',
  levelRange: { min: 1, max: 10 },
  pageTarget: 120,
  chapterEstimate: 10,
  constraints: { strict5e: true, includeHandouts: true, includeMaps: false },
  keyElements: {
    npcs: ['Consul Aldara Vex', 'The Whisperer', 'Artificer Kael'],
    locations: ['The Anchor Chamber', 'The Cloud Market', 'The Underbelly'],
    plotHooks: ['anchor stones failing', 'political assassination'],
    items: ['Anchor Shard'],
  },
};

export const EXPECTED_BIBLE: BibleContent = {
  title: 'Skyhold: City of Whispers',
  summary: 'A political intrigue campaign in a floating city threatened by failing magic.',
  premise: 'The Anchor Stones that keep Skyhold aloft are failing. Factions scheme to control the remaining power while the city slowly descends.',
  worldRules: {
    setting: 'A floating city above the clouds, kept aloft by ancient magical Anchor Stones.',
    era: 'Renaissance-inspired fantasy',
    magicLevel: 'high',
    technologyLevel: 'renaissance',
    toneDescriptors: ['cerebral', 'tense', 'morally grey'],
    forbiddenElements: ['simple good vs evil', 'hack-and-slash solutions'],
    worldSpecificRules: ['Gravity fluctuations near damaged Anchor Stones', 'All citizens wear sky-harnesses'],
  },
  actStructure: [
    { act: 1, title: 'Rising Stars', summary: 'PCs establish themselves in Skyhold politics.', levelRange: { min: 1, max: 3 }, chapterSlugs: ['ch-1', 'ch-2', 'ch-3'] },
    { act: 2, title: 'The Web Tightens', summary: 'Factions make their moves as stones fail.', levelRange: { min: 4, max: 6 }, chapterSlugs: ['ch-4', 'ch-5', 'ch-6'] },
    { act: 3, title: 'Freefall', summary: 'The city\'s fate hangs in the balance.', levelRange: { min: 7, max: 10 }, chapterSlugs: ['ch-7', 'ch-8', 'ch-9', 'ch-10'] },
  ],
  timeline: [
    { order: 1, event: 'Skyhold raised by ancient mages', timeframe: '1000 years ago', significance: 'Origin' },
    { order: 2, event: 'First Anchor Stone fails', timeframe: '6 months ago', significance: 'Crisis begins' },
    { order: 3, event: 'Consul takes emergency powers', timeframe: '1 month ago', significance: 'Political shift' },
  ],
  levelProgression: { type: 'milestone', milestones: ['Level 3 after Act 1', 'Level 7 after Act 2', 'Level 10 at finale'] },
  pageBudget: [
    { slug: 'ch-1', title: 'Chapter 1: Arrival in the Clouds', targetPages: 12, sections: ['The Ascent', 'First Impressions', 'A Job Offer'] },
    { slug: 'ch-2', title: 'Chapter 2: The Cloud Market', targetPages: 12, sections: ['Market Day', 'The Theft'] },
    { slug: 'ch-3', title: 'Chapter 3: Underbelly', targetPages: 12, sections: ['Below Skyhold', 'The Whisperer'] },
  ],
  styleGuide: {
    voice: 'Sophisticated and suspenseful. Every NPC has an agenda.',
    vocabulary: ['ascend', 'anchor', 'whisper', 'faction', 'leverage'],
    avoidTerms: ['dungeon crawl', 'loot'],
    narrativePerspective: 'second person',
    toneNotes: 'Emphasize social encounters and information gathering over combat.',
  },
  openThreads: ['Who built the Anchor Stones and why?', 'What lies below the clouds?'],
  entities: [
    { entityType: 'npc', name: 'Consul Aldara Vex', slug: 'consul-aldara-vex', summary: 'The ambitious consul of Skyhold.', details: { race: 'Human', alignment: 'LN', role: 'political power' } },
    { entityType: 'npc', name: 'The Whisperer', slug: 'the-whisperer', summary: 'A shadowy information broker.', details: { race: 'Unknown', alignment: 'CN', role: 'wildcard' } },
    { entityType: 'npc', name: 'Artificer Kael', slug: 'artificer-kael', summary: 'Engineer working on the Anchor Stones.', details: { race: 'Gnome', alignment: 'NG', role: 'ally' } },
    { entityType: 'location', name: 'The Anchor Chamber', slug: 'the-anchor-chamber', summary: 'Where the ancient Anchor Stones reside.', details: { locationType: 'restricted zone', atmosphere: 'humming with power' } },
    { entityType: 'location', name: 'The Cloud Market', slug: 'the-cloud-market', summary: 'Skyhold\'s bustling trade district.', details: { locationType: 'market', atmosphere: 'lively and cosmopolitan' } },
  ],
};
