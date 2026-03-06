import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';

export const PROMPT = 'An exploration-focused campaign in an uncharted jungle continent';

export const EXPECTED_INTAKE: NormalizedInput = {
  title: 'The Lost Continent of Xen\'Thar',
  summary: 'A hex-crawl exploration campaign across an uncharted jungle continent.',
  inferredMode: 'campaign',
  tone: 'exploration adventure',
  themes: ['exploration', 'discovery', 'survival', 'ancient mysteries'],
  setting: 'The newly discovered continent of Xen\'Thar, dense jungles hiding ancient ruins.',
  premise: 'A colonial expedition has established a beachhead on the mysterious continent of Xen\'Thar. The adventurers are hired to explore inland and chart the unknown.',
  levelRange: { min: 1, max: 10 },
  pageTarget: 150,
  chapterEstimate: 12,
  constraints: { strict5e: true, includeHandouts: true, includeMaps: true },
  keyElements: {
    npcs: ['Governor Thane', 'Scout Asha', 'The Oracle of Bones'],
    locations: ['Fort Firstlight', 'The Emerald Deep', 'Temple of the Sun Serpent'],
    plotHooks: ['ancient civilization ruins', 'expedition rivalries'],
    items: ['Compass of True North'],
  },
};

export const EXPECTED_BIBLE: BibleContent = {
  title: 'The Lost Continent of Xen\'Thar',
  summary: 'An exploration campaign across an uncharted jungle continent with ancient ruins and unknown dangers.',
  premise: 'Adventurers explore the mysterious continent of Xen\'Thar, uncovering an ancient civilization and the power that destroyed it.',
  worldRules: {
    setting: 'A vast jungle continent, recently discovered, with ruins of a pre-human civilization.',
    era: 'Age of Exploration fantasy',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['wondrous', 'perilous', 'mysterious'],
    forbiddenElements: ['colonial glorification', 'indigenous stereotypes'],
    worldSpecificRules: ['Jungle travel: 8 miles/day through dense canopy', 'Ancient wards still function in ruins'],
  },
  actStructure: [
    { act: 1, title: 'Landfall', summary: 'Establish base and begin exploration.', levelRange: { min: 1, max: 3 }, chapterSlugs: ['ch-1', 'ch-2', 'ch-3'] },
    { act: 2, title: 'Into the Green', summary: 'Push deeper, find ruins.', levelRange: { min: 4, max: 6 }, chapterSlugs: ['ch-4', 'ch-5', 'ch-6', 'ch-7'] },
    { act: 3, title: 'The Heart of Xen\'Thar', summary: 'Uncover the truth of the ancient civilization.', levelRange: { min: 7, max: 10 }, chapterSlugs: ['ch-8', 'ch-9', 'ch-10', 'ch-11', 'ch-12'] },
  ],
  timeline: [
    { order: 1, event: 'Xen\'Thar civilization falls', timeframe: '10,000 years ago', significance: 'Origin' },
    { order: 2, event: 'Continent discovered by sailors', timeframe: '1 year ago', significance: 'Inciting event' },
    { order: 3, event: 'Fort Firstlight established', timeframe: '3 months ago', significance: 'Base camp' },
  ],
  levelProgression: { type: 'milestone', milestones: ['Level 3 after first ruin', 'Level 7 after temple discovery', 'Level 10 at heart'] },
  pageBudget: [
    { slug: 'ch-1', title: 'Chapter 1: Fort Firstlight', targetPages: 12, sections: ['The Fort', 'Expedition Briefing'] },
    { slug: 'ch-2', title: 'Chapter 2: The Coastal Jungle', targetPages: 12, sections: ['First Steps', 'Jungle Encounters'] },
    { slug: 'ch-3', title: 'Chapter 3: The River', targetPages: 12, sections: ['The Crossing', 'River Encounters'] },
  ],
  styleGuide: {
    voice: 'Awe-inspiring and tense. Every clearing could reveal wonders or dangers.',
    vocabulary: ['canopy', 'ruin', 'uncharted', 'expedition', 'ancient'],
    avoidTerms: ['boring', 'routine'],
    narrativePerspective: 'second person',
    toneNotes: 'Balance wonder with genuine danger. The jungle is beautiful but hostile.',
  },
  openThreads: ['What destroyed the Xen\'Thar civilization?', 'Are there survivors hidden in the deep jungle?'],
  entities: [
    { entityType: 'npc', name: 'Governor Thane', slug: 'governor-thane', summary: 'Commander of Fort Firstlight.', details: { race: 'Human', alignment: 'LN', role: 'patron' } },
    { entityType: 'npc', name: 'Scout Asha', slug: 'scout-asha', summary: 'An experienced jungle guide.', details: { race: 'Half-Elf', alignment: 'CG', role: 'ally/guide' } },
    { entityType: 'npc', name: 'The Oracle of Bones', slug: 'oracle-of-bones', summary: 'A mysterious figure in the deep jungle.', details: { race: 'Unknown', alignment: 'N', role: 'mystic' } },
    { entityType: 'location', name: 'Fort Firstlight', slug: 'fort-firstlight', summary: 'The colonial expedition base.', details: { locationType: 'settlement', atmosphere: 'frontier outpost' } },
    { entityType: 'location', name: 'The Emerald Deep', slug: 'the-emerald-deep', summary: 'Dense unexplored jungle interior.', details: { locationType: 'wilderness', atmosphere: 'primeval and dangerous' } },
    { entityType: 'location', name: 'Temple of the Sun Serpent', slug: 'temple-of-the-sun-serpent', summary: 'An ancient Xen\'Thar temple.', details: { locationType: 'ruin', atmosphere: 'awe-inspiring and trapped' } },
  ],
};
