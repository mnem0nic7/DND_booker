import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';

export const PROMPT = 'A 3-session horror campaign in a decaying swamp kingdom';

export const EXPECTED_INTAKE: NormalizedInput = {
  title: 'The Rotting Throne',
  summary: 'A 3-session horror campaign set in a dying swamp kingdom where a cursed ruler clings to power.',
  inferredMode: 'module',
  tone: 'dark horror',
  themes: ['horror', 'decay', 'corruption', 'survival'],
  setting: 'A swamp kingdom slowly sinking into rot and madness.',
  premise: 'The Swamp King has made a pact with a hag coven, and the land rots around his throne. The adventurers must break the pact before the kingdom is lost.',
  levelRange: { min: 3, max: 6 },
  pageTarget: 30,
  chapterEstimate: 5,
  constraints: { strict5e: true, includeHandouts: false, includeMaps: false },
  keyElements: {
    npcs: ['The Swamp King', 'Grandmother Mossbone', 'Captain Vex'],
    locations: ['The Sunken Palace', 'Rotwood Village', 'The Hag Mire'],
    plotHooks: ['villagers disappearing into the swamp', 'a cursed crown'],
    items: ['Crown of Thorns and Moss'],
  },
};

export const EXPECTED_BIBLE: BibleContent = {
  title: 'The Rotting Throne',
  summary: 'A horror mini-campaign about breaking a hag pact in a dying swamp kingdom.',
  premise: 'The Swamp King bargained with a hag coven for immortality, but the price is the kingdom itself rotting away.',
  worldRules: {
    setting: 'A once-prosperous river kingdom now consumed by magical swamp rot.',
    era: 'Medieval fantasy',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['dread', 'oppressive', 'tragic'],
    forbiddenElements: ['comedic relief', 'upbeat resolution'],
    worldSpecificRules: ['Long rests in the swamp require DC 12 Con saves or gain exhaustion', 'Water is never clean'],
  },
  actStructure: [
    { act: 1, title: 'The Rotting Land', summary: 'Arrive and discover the corruption.', levelRange: { min: 3, max: 4 }, chapterSlugs: ['ch-1', 'ch-2'] },
    { act: 2, title: 'The Hag Mire', summary: 'Seek out and confront the hag coven.', levelRange: { min: 4, max: 5 }, chapterSlugs: ['ch-3', 'ch-4'] },
    { act: 3, title: 'The Sunken Throne', summary: 'Break the pact and face the Swamp King.', levelRange: { min: 5, max: 6 }, chapterSlugs: ['ch-5'] },
  ],
  timeline: [
    { order: 1, event: 'Swamp King makes hag pact', timeframe: '1 year ago', significance: 'Origin' },
    { order: 2, event: 'First villagers disappear', timeframe: '3 months ago', significance: 'Escalation' },
    { order: 3, event: 'Rot visibly spreading', timeframe: '2 weeks ago', significance: 'Crisis' },
  ],
  levelProgression: { type: 'milestone', milestones: ['Level 4 after Act 1', 'Level 6 after defeating the King'] },
  pageBudget: [
    { slug: 'ch-1', title: 'Chapter 1: Rotwood Village', targetPages: 6, sections: ['Arrival', 'The Sick', 'Captain Vex'] },
    { slug: 'ch-2', title: 'Chapter 2: Into the Swamp', targetPages: 6, sections: ['The Journey', 'Swamp Encounters'] },
    { slug: 'ch-3', title: 'Chapter 3: The Hag Mire', targetPages: 6, sections: ['Finding the Mire', 'Grandmother Mossbone'] },
    { slug: 'ch-4', title: 'Chapter 4: The Bargain', targetPages: 6, sections: ['The Coven', 'Breaking the Pact'] },
    { slug: 'ch-5', title: 'Chapter 5: The Sunken Palace', targetPages: 6, sections: ['Descent', 'The Swamp King'] },
  ],
  styleGuide: {
    voice: 'Oppressive and foreboding. Every description should feel damp.',
    vocabulary: ['rot', 'mire', 'seep', 'fester', 'murk'],
    avoidTerms: ['beautiful', 'pleasant', 'bright'],
    narrativePerspective: 'second person',
    toneNotes: 'Horror through atmosphere, not gore. The swamp itself is the antagonist.',
  },
  openThreads: ['What happens to the swamp after the pact breaks?'],
  entities: [
    { entityType: 'npc', name: 'The Swamp King', slug: 'the-swamp-king', summary: 'A cursed ruler bound to a hag pact.', details: { race: 'Human', alignment: 'NE', role: 'antagonist' } },
    { entityType: 'npc', name: 'Grandmother Mossbone', slug: 'grandmother-mossbone', summary: 'Leader of the hag coven.', details: { race: 'Green Hag', alignment: 'NE', role: 'antagonist' } },
    { entityType: 'npc', name: 'Captain Vex', slug: 'captain-vex', summary: 'A disillusioned guard captain.', details: { race: 'Human', alignment: 'LN', role: 'ally' } },
    { entityType: 'location', name: 'The Sunken Palace', slug: 'the-sunken-palace', summary: 'A half-submerged royal palace.', details: { locationType: 'dungeon', atmosphere: 'flooded and decaying' } },
    { entityType: 'location', name: 'Rotwood Village', slug: 'rotwood-village', summary: 'A dying fishing village.', details: { locationType: 'settlement', atmosphere: 'bleak and fearful' } },
    { entityType: 'location', name: 'The Hag Mire', slug: 'the-hag-mire', summary: 'The hag coven\'s domain.', details: { locationType: 'wilderness', atmosphere: 'otherworldly and treacherous' } },
  ],
};
