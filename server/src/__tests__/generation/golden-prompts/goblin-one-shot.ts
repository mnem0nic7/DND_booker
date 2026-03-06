import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';

export const PROMPT = 'A level 4 goblin cave adventure for new players';

export const EXPECTED_INTAKE: NormalizedInput = {
  title: 'The Goblin Caves of Duskhollow',
  summary: 'A beginner-friendly one-shot through goblin-infested caves beneath a village.',
  inferredMode: 'one_shot',
  tone: 'classic fantasy',
  themes: ['exploration', 'combat', 'heroism'],
  setting: 'A network of caves beneath a quiet farming village.',
  premise: 'Goblins have been raiding Millbrook Village. The adventurers must descend into their cave lair and put an end to the raids.',
  levelRange: { min: 3, max: 5 },
  pageTarget: 12,
  chapterEstimate: 3,
  constraints: { strict5e: true, includeHandouts: false, includeMaps: false },
  keyElements: {
    npcs: ['Chief Gnarltooth', 'Elder Mara'],
    locations: ['Duskhollow Caves', 'Millbrook Village'],
    plotHooks: ['goblin raids on the village', 'stolen harvest stores'],
    items: ['Amulet of the Deep'],
  },
};

export const EXPECTED_BIBLE: BibleContent = {
  title: 'The Goblin Caves of Duskhollow',
  summary: 'A beginner-friendly one-shot where adventurers clear goblin-infested caves.',
  premise: 'Goblins have been raiding Millbrook Village. The party must clear the caves and face Chief Gnarltooth.',
  worldRules: {
    setting: 'Rural farmland with caves beneath, classic fantasy.',
    era: 'Medieval',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['adventurous', 'accessible', 'heroic'],
    forbiddenElements: ['graphic violence', 'horror themes'],
    worldSpecificRules: ['Caves are naturally formed, not dungeon-engineered'],
  },
  actStructure: [
    { act: 1, title: 'The Village', summary: 'Learn about the goblin raids.', levelRange: { min: 4, max: 4 }, chapterSlugs: ['ch-1'] },
    { act: 2, title: 'The Caves', summary: 'Explore and fight through the caves.', levelRange: { min: 4, max: 4 }, chapterSlugs: ['ch-2'] },
    { act: 3, title: 'The Throne', summary: 'Face Chief Gnarltooth.', levelRange: { min: 4, max: 4 }, chapterSlugs: ['ch-3'] },
  ],
  timeline: [
    { order: 1, event: 'Goblins discover caves', timeframe: '3 months ago', significance: 'Settlement' },
    { order: 2, event: 'First village raid', timeframe: '2 weeks ago', significance: 'Inciting event' },
  ],
  levelProgression: { type: 'milestone', milestones: ['Level 5 after defeating Chief Gnarltooth'] },
  pageBudget: [
    { slug: 'ch-1', title: 'Chapter 1: Millbrook Village', targetPages: 3, sections: ['Arrival', 'The Elder'] },
    { slug: 'ch-2', title: 'Chapter 2: The Upper Caves', targetPages: 5, sections: ['Entry', 'Traps', 'Patrol'] },
    { slug: 'ch-3', title: 'Chapter 3: The Goblin Throne', targetPages: 4, sections: ['Approach', 'Boss Fight'] },
  ],
  styleGuide: {
    voice: 'Friendly and adventurous, suitable for new players.',
    vocabulary: ['cave', 'goblin', 'torch', 'passage'],
    avoidTerms: ['eldritch', 'nihilistic'],
    narrativePerspective: 'second person',
    toneNotes: 'Keep descriptions vivid but not overwhelming. Provide clear options for players.',
  },
  openThreads: ['What deeper evil drove the goblins to the surface?'],
  entities: [
    { entityType: 'npc', name: 'Chief Gnarltooth', slug: 'chief-gnarltooth', summary: 'The cunning goblin chief.', details: { race: 'Goblin', alignment: 'LE', role: 'antagonist' } },
    { entityType: 'npc', name: 'Elder Mara', slug: 'elder-mara', summary: 'Village elder who hires the party.', details: { race: 'Human', alignment: 'NG', role: 'quest giver' } },
    { entityType: 'location', name: 'Duskhollow Caves', slug: 'duskhollow-caves', summary: 'A network of goblin-infested caves.', details: { locationType: 'dungeon', atmosphere: 'damp and dark' } },
    { entityType: 'location', name: 'Millbrook Village', slug: 'millbrook-village', summary: 'A small farming village.', details: { locationType: 'settlement', atmosphere: 'pastoral but worried' } },
  ],
};
