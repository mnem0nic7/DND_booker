import type { JSONContent } from '@tiptap/core';
import type { Editor } from '@tiptap/react';

export type BlockFieldValue = string | number | boolean;
export type BlockFormValues = Record<string, BlockFieldValue>;

export interface BlockFieldOption {
  label: string;
  value: string | number;
}

export interface BlockField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  placeholder?: string;
  description?: string;
  rows?: number;
  min?: number;
  max?: number;
  step?: number;
  options?: BlockFieldOption[];
}

export interface BlockPreset {
  label: string;
  description: string;
  values: Partial<BlockFormValues>;
}

export interface BlockType {
  name: string;
  label: string;
  icon: string;
  category: string;
  description: string;
  keywords: string[];
  createLabel?: string;
  fields?: BlockField[];
  presets?: BlockPreset[];
  getInitialValues: () => BlockFormValues;
  insertContent: (editor: Editor, values?: BlockFormValues) => void;
}

function insert(editor: Editor, content: JSONContent | JSONContent[]) {
  editor.chain().focus().insertContent(content).run();
}

function commandBlock(config: Omit<BlockType, 'getInitialValues' | 'insertContent'> & {
  run: (editor: Editor) => void;
}): BlockType {
  return {
    ...config,
    getInitialValues: () => ({}),
    insertContent: (editor) => config.run(editor),
  };
}

function nodeBlock(config: Omit<BlockType, 'insertContent'> & {
  buildContent: (values: BlockFormValues) => JSONContent | JSONContent[];
}): BlockType {
  return {
    ...config,
    insertContent: (editor, values) => {
      insert(editor, config.buildContent(values ?? config.getInitialValues()));
    },
  };
}

function paragraphNode(text: string) {
  return {
    type: 'paragraph',
    content: text.trim()
      ? [{ type: 'text', text }]
      : [{ type: 'text', text: 'Start writing here.' }],
  };
}

function asString(value: BlockFieldValue | undefined, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return fallback;
}

function asNumber(value: BlockFieldValue | undefined, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asBoolean(value: BlockFieldValue | undefined, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return fallback;
}

function jsonString(value: unknown): string {
  return JSON.stringify(value);
}

export const BLOCK_TYPES: BlockType[] = [
  commandBlock({
    name: 'paragraph',
    label: 'Paragraph',
    icon: 'P',
    category: 'Basic',
    description: 'A standard body paragraph for narration, mechanics, or room text.',
    keywords: ['text', 'body', 'writing'],
    run: (editor) => editor.chain().focus().insertContent({ type: 'paragraph' }).run(),
  }),
  nodeBlock({
    name: 'heading',
    label: 'Heading',
    icon: 'H2',
    category: 'Basic',
    description: 'A section heading for encounters, scenes, or boxed subsections.',
    keywords: ['section', 'heading', 'title'],
    fields: [
      { key: 'text', label: 'Heading text', type: 'text', placeholder: 'The Flooded Chapel' },
      {
        key: 'level',
        label: 'Level',
        type: 'select',
        options: [
          { label: 'H1', value: 1 },
          { label: 'H2', value: 2 },
          { label: 'H3', value: 3 },
        ],
      },
    ],
    getInitialValues: () => ({ text: 'Section Heading', level: 2 }),
    buildContent: (values) => ({
      type: 'heading',
      attrs: { level: asNumber(values.level, 2) },
      content: [{ type: 'text', text: asString(values.text, 'Section Heading') }],
    }),
  }),
  commandBlock({
    name: 'bulletList',
    label: 'Bullet List',
    icon: '•',
    category: 'Basic',
    description: 'A bulleted list for hooks, treasure, objectives, or monster traits.',
    keywords: ['list', 'bullets'],
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  }),
  commandBlock({
    name: 'orderedList',
    label: 'Numbered List',
    icon: '1.',
    category: 'Basic',
    description: 'A numbered list for steps, tables of procedure, or encounter beats.',
    keywords: ['list', 'ordered', 'steps'],
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  }),
  commandBlock({
    name: 'blockquote',
    label: 'Blockquote',
    icon: '“”',
    category: 'Basic',
    description: 'A plain quotation block for lore excerpts or rules citations.',
    keywords: ['quote', 'lore'],
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  }),
  commandBlock({
    name: 'codeBlock',
    label: 'Code Block',
    icon: '<>',
    category: 'Basic',
    description: 'A monospaced block, mostly useful for notes or technical references.',
    keywords: ['code', 'monospace'],
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  }),
  commandBlock({
    name: 'horizontalRule',
    label: 'Divider',
    icon: '—',
    category: 'Basic',
    description: 'A horizontal divider to break scenes or layout sections.',
    keywords: ['divider', 'separator', 'rule'],
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  }),
  nodeBlock({
    name: 'statBlock',
    label: 'Creature',
    icon: 'CR',
    category: 'Creatures & NPCs',
    description: 'Create a full D&D 5e creature stat block with stats, CR, traits, and actions.',
    keywords: ['monster', 'creature', 'enemy', 'boss', 'stat block'],
    createLabel: 'Create Creature',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Bog Warden' },
      {
        key: 'size',
        label: 'Size',
        type: 'select',
        options: [
          { label: 'Tiny', value: 'Tiny' },
          { label: 'Small', value: 'Small' },
          { label: 'Medium', value: 'Medium' },
          { label: 'Large', value: 'Large' },
          { label: 'Huge', value: 'Huge' },
          { label: 'Gargantuan', value: 'Gargantuan' },
        ],
      },
      { key: 'type', label: 'Type', type: 'text', placeholder: 'undead' },
      { key: 'alignment', label: 'Alignment', type: 'text', placeholder: 'lawful evil' },
      { key: 'ac', label: 'Armor Class', type: 'number', min: 1, max: 30 },
      { key: 'hp', label: 'Hit Points', type: 'number', min: 1, max: 999 },
      { key: 'speed', label: 'Speed', type: 'text', placeholder: '30 ft., fly 40 ft.' },
      { key: 'cr', label: 'Challenge Rating', type: 'text', placeholder: '3' },
    ],
    presets: [
      {
        label: 'Humanoid Skirmisher',
        description: 'A mid-tier humanoid enemy for bandits, cultists, or soldiers.',
        values: { name: 'Raid Captain', size: 'Medium', type: 'humanoid', alignment: 'any non-good', ac: 15, hp: 45, speed: '30 ft.', cr: '3' },
      },
      {
        label: 'Wild Beast',
        description: 'A straightforward beast encounter template.',
        values: { name: 'Dire Stag', size: 'Large', type: 'beast', alignment: 'unaligned', ac: 13, hp: 37, speed: '50 ft.', cr: '2' },
      },
      {
        label: 'Undead Threat',
        description: 'A darker template for crypts, ruins, and cursed sites.',
        values: { name: 'Crypt Sentinel', size: 'Medium', type: 'undead', alignment: 'lawful evil', ac: 14, hp: 58, speed: '30 ft.', cr: '4' },
      },
    ],
    getInitialValues: () => ({
      name: 'Creature Name',
      size: 'Medium',
      type: 'humanoid',
      alignment: 'neutral',
      ac: 10,
      hp: 10,
      speed: '30 ft.',
      cr: '1',
    }),
    buildContent: (values) => ({
      type: 'statBlock',
      attrs: {
        name: asString(values.name, 'Creature Name'),
        size: asString(values.size, 'Medium'),
        type: asString(values.type, 'humanoid'),
        alignment: asString(values.alignment, 'neutral'),
        ac: asNumber(values.ac, 10),
        acType: '',
        hp: asNumber(values.hp, 10),
        hitDice: '2d8+2',
        speed: asString(values.speed, '30 ft.'),
        str: 10,
        dex: 10,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10,
        savingThrows: '',
        skills: '',
        damageResistances: '',
        damageImmunities: '',
        conditionImmunities: '',
        senses: 'passive Perception 10',
        languages: 'Common',
        cr: asString(values.cr, '1'),
        xp: '200',
        traits: jsonString([]),
        actions: jsonString([]),
        reactions: jsonString([]),
        legendaryActions: jsonString([]),
        legendaryDescription: '',
      },
    }),
  }),
  nodeBlock({
    name: 'npcProfile',
    label: 'NPC',
    icon: 'NPC',
    category: 'Creatures & NPCs',
    description: 'Create a roleplay-first NPC profile with appearance, ideals, bonds, flaws, and portrait.',
    keywords: ['npc', 'villain', 'ally', 'merchant', 'quest giver'],
    createLabel: 'Create NPC',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Seraphine Vale' },
      { key: 'race', label: 'Race', type: 'text', placeholder: 'Half-elf' },
      { key: 'class', label: 'Role or class', type: 'text', placeholder: 'Spy, priest, noble, ranger' },
      { key: 'description', label: 'Description', type: 'textarea', rows: 4, placeholder: 'A precise visual and social sketch of the NPC.' },
    ],
    presets: [
      {
        label: 'Friendly Patron',
        description: 'A quest giver or ally with trustworthy energy.',
        values: { name: 'Ilyana March', race: 'Human', class: 'Scholar', description: 'A poised archivist with ink-stained fingers and a relentless curiosity about lost kingdoms.' },
      },
      {
        label: 'Local Merchant',
        description: 'A quick-start NPC for travel hubs and settlements.',
        values: { name: 'Bram Wick', race: 'Dwarf', class: 'Merchant', description: 'A broad-shouldered trader who smiles fast and notices every coin that changes hands.' },
      },
      {
        label: 'Quiet Villain',
        description: 'An antagonist profile with controlled menace.',
        values: { name: 'Lady Thorne', race: 'Tiefling', class: 'Noble Warlock', description: 'Immaculate, soft-spoken, and impossible to read until the room has already turned against you.' },
      },
    ],
    getInitialValues: () => ({
      name: 'NPC Name',
      race: 'Human',
      class: 'Commoner',
      description: 'A brief description of the NPC.',
    }),
    buildContent: (values) => ({
      type: 'npcProfile',
      attrs: {
        name: asString(values.name, 'NPC Name'),
        race: asString(values.race, 'Human'),
        class: asString(values.class, 'Commoner'),
        description: asString(values.description, 'A brief description of the NPC.'),
        personalityTraits: '',
        ideals: '',
        bonds: '',
        flaws: '',
        portraitUrl: '',
      },
    }),
  }),
  nodeBlock({
    name: 'raceBlock',
    label: 'Species or Heritage',
    icon: 'R',
    category: 'Creatures & NPCs',
    description: 'Create a playable lineage, heritage, or ancestry block with features and core traits.',
    keywords: ['race', 'species', 'lineage', 'ancestry', 'heritage'],
    createLabel: 'Create Heritage',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Stoneborn' },
      { key: 'abilityScoreIncreases', label: 'ASI', type: 'text', placeholder: '+2 Constitution, +1 Wisdom' },
      { key: 'size', label: 'Size', type: 'text', placeholder: 'Medium' },
      { key: 'speed', label: 'Speed', type: 'text', placeholder: '30 ft.' },
      { key: 'languages', label: 'Languages', type: 'text', placeholder: 'Common, Dwarvish' },
    ],
    presets: [
      {
        label: 'Stout Lineage',
        description: 'A durable heritage with steady defaults.',
        values: { name: 'Stoneborn', abilityScoreIncreases: '+2 Constitution, +1 Wisdom', size: 'Medium', speed: '25 ft.', languages: 'Common, Terran' },
      },
      {
        label: 'Graceful Lineage',
        description: 'A nimble, perceptive ancestry.',
        values: { name: 'Moonstep', abilityScoreIncreases: '+2 Dexterity, +1 Charisma', size: 'Medium', speed: '30 ft.', languages: 'Common, Elvish' },
      },
    ],
    getInitialValues: () => ({
      name: 'Race Name',
      abilityScoreIncreases: '+2 Constitution, +1 Wisdom',
      size: 'Medium',
      speed: '30 ft.',
      languages: 'Common',
    }),
    buildContent: (values) => ({
      type: 'raceBlock',
      attrs: {
        name: asString(values.name, 'Race Name'),
        abilityScoreIncreases: asString(values.abilityScoreIncreases, '+2 Constitution, +1 Wisdom'),
        size: asString(values.size, 'Medium'),
        speed: asString(values.speed, '30 ft.'),
        languages: asString(values.languages, 'Common'),
        features: jsonString([
          { name: 'Signature Trait', description: 'Describe the defining racial feature here.' },
        ]),
      },
    }),
  }),
  nodeBlock({
    name: 'spellCard',
    label: 'Spell',
    icon: 'SP',
    category: 'Spells, Loot & Rules',
    description: 'Create a spell card with level, school, casting details, and spell text.',
    keywords: ['spell', 'magic', 'ritual', 'cantrip'],
    createLabel: 'Create Spell',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Ashen Lance' },
      { key: 'level', label: 'Level', type: 'number', min: 0, max: 9 },
      {
        key: 'school',
        label: 'School',
        type: 'select',
        options: [
          { label: 'Abjuration', value: 'abjuration' },
          { label: 'Conjuration', value: 'conjuration' },
          { label: 'Divination', value: 'divination' },
          { label: 'Enchantment', value: 'enchantment' },
          { label: 'Evocation', value: 'evocation' },
          { label: 'Illusion', value: 'illusion' },
          { label: 'Necromancy', value: 'necromancy' },
          { label: 'Transmutation', value: 'transmutation' },
        ],
      },
      { key: 'castingTime', label: 'Casting time', type: 'text', placeholder: '1 action' },
      { key: 'range', label: 'Range', type: 'text', placeholder: '60 feet' },
      { key: 'duration', label: 'Duration', type: 'text', placeholder: 'Instantaneous' },
      { key: 'description', label: 'Description', type: 'textarea', rows: 4, placeholder: 'Describe what the spell does.' },
    ],
    presets: [
      {
        label: 'Combat Cantrip',
        description: 'Fast attack spell with clean combat defaults.',
        values: { name: 'Storm Needle', level: 0, school: 'evocation', castingTime: '1 action', range: '60 feet', duration: 'Instantaneous', description: 'A shard of charged wind strikes one creature you can see within range.' },
      },
      {
        label: 'Ritual Utility',
        description: 'Exploration-focused utility spell.',
        values: { name: 'Lantern of Echoes', level: 2, school: 'divination', castingTime: '10 minutes', range: 'Self', duration: '1 hour', description: 'Whispers hidden sounds and recent disturbances into your awareness.' },
      },
    ],
    getInitialValues: () => ({
      name: 'Spell Name',
      level: 0,
      school: 'evocation',
      castingTime: '1 action',
      range: '60 feet',
      duration: 'Instantaneous',
      description: 'Describe the spell effect here.',
    }),
    buildContent: (values) => ({
      type: 'spellCard',
      attrs: {
        name: asString(values.name, 'Spell Name'),
        level: asNumber(values.level, 0),
        school: asString(values.school, 'evocation'),
        castingTime: asString(values.castingTime, '1 action'),
        range: asString(values.range, '60 feet'),
        components: 'V, S',
        duration: asString(values.duration, 'Instantaneous'),
        description: asString(values.description, 'Describe the spell effect here.'),
        higherLevels: '',
      },
    }),
  }),
  nodeBlock({
    name: 'magicItem',
    label: 'Magic Item',
    icon: 'MI',
    category: 'Spells, Loot & Rules',
    description: 'Create a treasure entry with rarity, attunement, and item rules text.',
    keywords: ['item', 'treasure', 'artifact', 'potion', 'weapon'],
    createLabel: 'Create Magic Item',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Lantern of the Mire' },
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: [
          { label: 'Wondrous item', value: 'wondrous' },
          { label: 'Weapon', value: 'weapon' },
          { label: 'Armor', value: 'armor' },
          { label: 'Potion', value: 'potion' },
          { label: 'Ring', value: 'ring' },
          { label: 'Rod', value: 'rod' },
          { label: 'Staff', value: 'staff' },
          { label: 'Wand', value: 'wand' },
        ],
      },
      {
        key: 'rarity',
        label: 'Rarity',
        type: 'select',
        options: [
          { label: 'Common', value: 'common' },
          { label: 'Uncommon', value: 'uncommon' },
          { label: 'Rare', value: 'rare' },
          { label: 'Very Rare', value: 'very rare' },
          { label: 'Legendary', value: 'legendary' },
        ],
      },
      { key: 'requiresAttunement', label: 'Requires attunement', type: 'checkbox' },
      { key: 'description', label: 'Description', type: 'textarea', rows: 4, placeholder: 'What the item does and how it feels to use.' },
    ],
    presets: [
      {
        label: 'Potion',
        description: 'Quick-start consumable item.',
        values: { name: 'Potion of Emberstride', type: 'potion', rarity: 'uncommon', requiresAttunement: false, description: 'For 1 hour, your footsteps shed harmless sparks and your speed increases by 10 feet.' },
      },
      {
        label: 'Wondrous Item',
        description: 'Reusable utility or exploration reward.',
        values: { name: 'Cartographer’s Compass', type: 'wondrous', rarity: 'rare', requiresAttunement: true, description: 'The compass needle turns toward the nearest hidden route, secret door, or forgotten trail.' },
      },
    ],
    getInitialValues: () => ({
      name: 'Magic Item',
      type: 'wondrous',
      rarity: 'uncommon',
      requiresAttunement: false,
      description: 'Describe the magic item here.',
    }),
    buildContent: (values) => ({
      type: 'magicItem',
      attrs: {
        name: asString(values.name, 'Magic Item'),
        type: asString(values.type, 'wondrous'),
        rarity: asString(values.rarity, 'uncommon'),
        requiresAttunement: asBoolean(values.requiresAttunement, false),
        attunementRequirement: '',
        description: asString(values.description, 'Describe the magic item here.'),
        properties: '',
      },
    }),
  }),
  nodeBlock({
    name: 'classFeature',
    label: 'Class Feature',
    icon: 'CF',
    category: 'Spells, Loot & Rules',
    description: 'Create a player-facing class feature or subclass feature entry.',
    keywords: ['class feature', 'subclass', 'player option'],
    createLabel: 'Create Feature',
    fields: [
      { key: 'name', label: 'Feature name', type: 'text', placeholder: 'Blade Dancer' },
      { key: 'className', label: 'Class', type: 'text', placeholder: 'Fighter' },
      { key: 'level', label: 'Level', type: 'number', min: 1, max: 20 },
      { key: 'description', label: 'Description', type: 'textarea', rows: 4, placeholder: 'Describe the feature and its benefit.' },
    ],
    presets: [
      {
        label: 'Level 1 Feature',
        description: 'An entry-level subclass or class feature.',
        values: { name: 'Ashen Footwork', className: 'Rogue', level: 1, description: 'You gain advantage on checks made to move silently through smoke, ash, or dim embers.' },
      },
    ],
    getInitialValues: () => ({
      name: 'Feature Name',
      className: 'Fighter',
      level: 1,
      description: 'Describe the class feature here.',
    }),
    buildContent: (values) => ({
      type: 'classFeature',
      attrs: {
        name: asString(values.name, 'Feature Name'),
        className: asString(values.className, 'Fighter'),
        level: asNumber(values.level, 1),
        description: asString(values.description, 'Describe the class feature here.'),
      },
    }),
  }),
  nodeBlock({
    name: 'encounterTable',
    label: 'Encounter Table',
    icon: 'ET',
    category: 'Encounters & Tables',
    description: 'Create a weighted encounter table for wilderness, dungeon, urban, or faction play.',
    keywords: ['encounter', 'table', 'random encounter', 'wilderness'],
    createLabel: 'Create Encounter Table',
    fields: [
      { key: 'environment', label: 'Environment', type: 'text', placeholder: 'Swamp' },
      { key: 'crRange', label: 'CR range', type: 'text', placeholder: '1-4' },
    ],
    presets: [
      {
        label: 'Wilderness',
        description: 'A general-purpose outdoor table.',
        values: { environment: 'Forest', crRange: '1-4' },
      },
      {
        label: 'Dungeon',
        description: 'Tighter, more hostile indoor pacing.',
        values: { environment: 'Dungeon', crRange: '3-6' },
      },
      {
        label: 'City',
        description: 'Urban complications and faction trouble.',
        values: { environment: 'City', crRange: '1-3' },
      },
    ],
    getInitialValues: () => ({
      environment: 'Forest',
      crRange: '1-4',
    }),
    buildContent: (values) => ({
      type: 'encounterTable',
      attrs: {
        environment: asString(values.environment, 'Forest'),
        crRange: asString(values.crRange, '1-4'),
        entries: jsonString([
          { weight: 1, description: '1d4 wolves', cr: '1/4' },
          { weight: 2, description: '1 dire wolf', cr: '1' },
          { weight: 3, description: '1d6 bandits', cr: '1/8' },
        ]),
      },
    }),
  }),
  nodeBlock({
    name: 'randomTable',
    label: 'Random Table',
    icon: 'RT',
    category: 'Encounters & Tables',
    description: 'Create a d-table for treasures, rumors, complications, loot, or inspirations.',
    keywords: ['random table', 'loot table', 'rumors', 'generator'],
    createLabel: 'Create Random Table',
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'Swamp Hazards' },
      { key: 'dieType', label: 'Die', type: 'text', placeholder: 'd6' },
    ],
    presets: [
      {
        label: 'Rumor Table',
        description: 'A social or tavern-ready rumor list.',
        values: { title: 'Tavern Rumors', dieType: 'd8' },
      },
      {
        label: 'Loot Table',
        description: 'Treasure or salvage generator.',
        values: { title: 'Cultist Cache', dieType: 'd6' },
      },
    ],
    getInitialValues: () => ({
      title: 'Random Table',
      dieType: 'd6',
    }),
    buildContent: (values) => ({
      type: 'randomTable',
      attrs: {
        title: asString(values.title, 'Random Table'),
        dieType: asString(values.dieType, 'd6'),
        entries: jsonString([
          { roll: '1', result: 'Result one' },
          { roll: '2', result: 'Result two' },
          { roll: '3', result: 'Result three' },
          { roll: '4', result: 'Result four' },
          { roll: '5', result: 'Result five' },
          { roll: '6', result: 'Result six' },
        ]),
      },
    }),
  }),
  nodeBlock({
    name: 'mapBlock',
    label: 'Map',
    icon: 'MAP',
    category: 'Encounters & Tables',
    description: 'Insert a map panel with scale and keyed locations, ready for image upload.',
    keywords: ['map', 'battlemap', 'dungeon', 'location'],
    createLabel: 'Create Map Panel',
    fields: [
      { key: 'scale', label: 'Scale', type: 'text', placeholder: '1 inch = 5 feet' },
    ],
    getInitialValues: () => ({
      scale: '1 inch = 5 feet',
    }),
    buildContent: (values) => ({
      type: 'mapBlock',
      attrs: {
        src: '',
        scale: asString(values.scale, '1 inch = 5 feet'),
        keyEntries: jsonString([]),
      },
    }),
  }),
  nodeBlock({
    name: 'readAloudBox',
    label: 'Read Aloud',
    icon: 'RA',
    category: 'Writing',
    description: 'Create boxed descriptive text to read directly to the table.',
    keywords: ['boxed text', 'read aloud', 'narration'],
    createLabel: 'Create Read Aloud Box',
    fields: [
      {
        key: 'body',
        label: 'Read-aloud text',
        type: 'textarea',
        rows: 5,
        placeholder: 'Describe what the players immediately see, hear, and feel.',
      },
      {
        key: 'style',
        label: 'Style',
        type: 'select',
        options: [
          { label: 'Parchment', value: 'parchment' },
          { label: 'Dark', value: 'dark' },
        ],
      },
    ],
    presets: [
      {
        label: 'Moody Entrance',
        description: 'A scene-opening box for dungeon or mystery starts.',
        values: {
          style: 'parchment',
          body: 'The chamber breathes damp air and old incense. Broken tiles grind underfoot as a distant bell tolls somewhere below.',
        },
      },
    ],
    getInitialValues: () => ({
      body: 'Describe the scene here.',
      style: 'parchment',
    }),
    buildContent: (values) => ({
      type: 'readAloudBox',
      attrs: { style: asString(values.style, 'parchment') },
      content: [paragraphNode(asString(values.body, 'Describe the scene here.'))],
    }),
  }),
  nodeBlock({
    name: 'sidebarCallout',
    label: 'Sidebar',
    icon: 'SB',
    category: 'Writing',
    description: 'Add a side note for lore, DM guidance, warnings, or optional content.',
    keywords: ['sidebar', 'callout', 'lore', 'note'],
    createLabel: 'Create Sidebar',
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'Lore Note' },
      {
        key: 'calloutType',
        label: 'Tone',
        type: 'select',
        options: [
          { label: 'Info', value: 'info' },
          { label: 'Warning', value: 'warning' },
          { label: 'Lore', value: 'lore' },
        ],
      },
      { key: 'body', label: 'Body', type: 'textarea', rows: 4, placeholder: 'Add supporting or optional content.' },
    ],
    presets: [
      {
        label: 'Lore Sidebar',
        description: 'Flavor and setting context.',
        values: { title: 'Old Kingdom Lore', calloutType: 'lore', body: 'The marsh road once served the kings of Arven, though no banner has flown here in a century.' },
      },
      {
        label: 'DM Warning',
        description: 'Important prep or pacing note.',
        values: { title: 'Running This Trap', calloutType: 'warning', body: 'Signal the pressure plate with cracked masonry and a faint hiss before initiative starts.' },
      },
    ],
    getInitialValues: () => ({
      title: 'Note',
      calloutType: 'info',
      body: 'Add supporting context here.',
    }),
    buildContent: (values) => ({
      type: 'sidebarCallout',
      attrs: {
        title: asString(values.title, 'Note'),
        calloutType: asString(values.calloutType, 'info'),
      },
      content: [paragraphNode(asString(values.body, 'Add supporting context here.'))],
    }),
  }),
  nodeBlock({
    name: 'handout',
    label: 'Handout',
    icon: 'HO',
    category: 'Writing',
    description: 'Create an in-world note, letter, proclamation, or poster for players.',
    keywords: ['handout', 'letter', 'scroll', 'poster', 'prop'],
    createLabel: 'Create Handout',
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'Letter From the Abbey' },
      {
        key: 'style',
        label: 'Style',
        type: 'select',
        options: [
          { label: 'Letter', value: 'letter' },
          { label: 'Scroll', value: 'scroll' },
          { label: 'Poster', value: 'poster' },
        ],
      },
      { key: 'content', label: 'Handout text', type: 'textarea', rows: 6, placeholder: 'Write the in-world text exactly as the players should see it.' },
    ],
    presets: [
      {
        label: 'Quest Letter',
        description: 'A direct message from an NPC patron.',
        values: { title: 'Urgent Letter', style: 'letter', content: 'To the brave souls willing to answer, meet me before dusk beneath the west gate and come armed.' },
      },
      {
        label: 'Wanted Poster',
        description: 'A visual hook for town boards and chases.',
        values: { title: 'Wanted', style: 'poster', content: 'WANTED FOR ARSON AND TREASON: MARRO VELL. REWARD PAID IN CROWN SILVER.' },
      },
    ],
    getInitialValues: () => ({
      title: 'Handout',
      style: 'letter',
      content: '',
    }),
    buildContent: (values) => ({
      type: 'handout',
      attrs: {
        title: asString(values.title, 'Handout'),
        style: asString(values.style, 'letter'),
        content: asString(values.content, ''),
      },
    }),
  }),
  nodeBlock({
    name: 'chapterHeader',
    label: 'Chapter Opener',
    icon: 'CH',
    category: 'Book Structure',
    description: 'Create a polished chapter-opening banner with title, number, and subtitle.',
    keywords: ['chapter', 'opener', 'section'],
    createLabel: 'Create Chapter Opener',
    fields: [
      { key: 'chapterNumber', label: 'Chapter number', type: 'text', placeholder: 'Chapter 2' },
      { key: 'title', label: 'Title', type: 'text', placeholder: 'Through the Mire' },
      { key: 'subtitle', label: 'Subtitle', type: 'text', placeholder: 'The Abbey Road' },
    ],
    presets: [
      {
        label: 'Numbered Chapter',
        description: 'Standard adventure chapter opener.',
        values: { chapterNumber: 'Chapter 1', title: 'Adventure Begins', subtitle: 'A call to action' },
      },
      {
        label: 'Appendix',
        description: 'Back-matter or appendix opener.',
        values: { chapterNumber: 'Appendix A', title: 'Bestiary', subtitle: 'New monsters and NPCs' },
      },
    ],
    getInitialValues: () => ({
      chapterNumber: '',
      title: 'Chapter Title',
      subtitle: '',
    }),
    buildContent: (values) => ({
      type: 'chapterHeader',
      attrs: {
        chapterNumber: asString(values.chapterNumber, ''),
        title: asString(values.title, 'Chapter Title'),
        subtitle: asString(values.subtitle, ''),
        backgroundImage: '',
      },
    }),
  }),
  nodeBlock({
    name: 'titlePage',
    label: 'Title Page',
    icon: 'TP',
    category: 'Book Structure',
    description: 'Create a front cover/title page with book title, subtitle, and author.',
    keywords: ['cover', 'title page', 'front matter'],
    createLabel: 'Create Title Page',
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'The Shattered Marsh' },
      { key: 'subtitle', label: 'Subtitle', type: 'text', placeholder: 'A D&D 5e One-Shot' },
      { key: 'author', label: 'Author', type: 'text', placeholder: 'Studio Name' },
    ],
    presets: [
      {
        label: 'One-Shot Cover',
        description: 'A simple one-shot front page.',
        values: { title: 'One-Shot Title', subtitle: 'A D&D 5e One-Shot', author: 'Author Name' },
      },
      {
        label: 'Campaign Book',
        description: 'A broader campaign or supplement cover.',
        values: { title: 'Campaign Title', subtitle: 'A D&D 5e Campaign Setting', author: 'Studio Name' },
      },
    ],
    getInitialValues: () => ({
      title: 'Adventure Title',
      subtitle: 'A D&D 5e Adventure',
      author: 'Author Name',
    }),
    buildContent: (values) => ({
      type: 'titlePage',
      attrs: {
        title: asString(values.title, 'Adventure Title'),
        subtitle: asString(values.subtitle, 'A D&D 5e Adventure'),
        author: asString(values.author, 'Author Name'),
        coverImageUrl: '',
      },
    }),
  }),
  nodeBlock({
    name: 'tableOfContents',
    label: 'Table of Contents',
    icon: 'TOC',
    category: 'Book Structure',
    description: 'Insert a table of contents block that reads your chapter headings.',
    keywords: ['toc', 'contents', 'front matter'],
    createLabel: 'Insert Contents',
    fields: [
      { key: 'title', label: 'Heading', type: 'text', placeholder: 'Table of Contents' },
    ],
    getInitialValues: () => ({
      title: 'Table of Contents',
    }),
    buildContent: (values) => ({
      type: 'tableOfContents',
      attrs: {
        title: asString(values.title, 'Table of Contents'),
      },
    }),
  }),
  nodeBlock({
    name: 'creditsPage',
    label: 'Credits Page',
    icon: 'CR',
    category: 'Book Structure',
    description: 'Create back-matter credits and publishing/legal metadata.',
    keywords: ['credits', 'legal', 'contributors'],
    createLabel: 'Create Credits Page',
    fields: [
      { key: 'credits', label: 'Credits', type: 'textarea', rows: 5, placeholder: 'Written by...\nArt by...\nLayout by...' },
      { key: 'copyrightYear', label: 'Copyright year', type: 'text', placeholder: '2026' },
    ],
    getInitialValues: () => ({
      credits: 'Written by Author Name\nEdited by Editor Name\nArt by Artist Name\nLayout by Layout Designer',
      copyrightYear: new Date().getFullYear().toString(),
    }),
    buildContent: (values) => ({
      type: 'creditsPage',
      attrs: {
        credits: asString(values.credits, 'Written by Author Name'),
        legalText: 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License.',
        copyrightYear: asString(values.copyrightYear, new Date().getFullYear().toString()),
      },
    }),
  }),
  nodeBlock({
    name: 'backCover',
    label: 'Back Cover',
    icon: 'BC',
    category: 'Book Structure',
    description: 'Create a back-cover sales blurb and short author bio.',
    keywords: ['back cover', 'blurb', 'author bio'],
    createLabel: 'Create Back Cover',
    fields: [
      { key: 'blurb', label: 'Back-cover blurb', type: 'textarea', rows: 5, placeholder: 'Sell the adventure in one sharp paragraph.' },
      { key: 'authorBio', label: 'Author bio', type: 'textarea', rows: 3, placeholder: 'Short author or studio bio.' },
    ],
    getInitialValues: () => ({
      blurb: 'A thrilling adventure awaits! Deep in the forgotten ruins, an ancient evil stirs.',
      authorBio: 'Author Name is a tabletop RPG designer and storyteller.',
    }),
    buildContent: (values) => ({
      type: 'backCover',
      attrs: {
        blurb: asString(values.blurb, 'A thrilling adventure awaits!'),
        authorBio: asString(values.authorBio, 'Author Name is a tabletop RPG designer and storyteller.'),
        authorImageUrl: '',
      },
    }),
  }),
  nodeBlock({
    name: 'fullBleedImage',
    label: 'Full Bleed Image',
    icon: 'IMG',
    category: 'Layout',
    description: 'Add a large artwork panel ready for upload or AI image generation.',
    keywords: ['image', 'illustration', 'art'],
    createLabel: 'Create Image Panel',
    fields: [
      { key: 'caption', label: 'Caption', type: 'text', placeholder: 'The drowned gate at dusk' },
      {
        key: 'position',
        label: 'Layout',
        type: 'select',
        options: [
          { label: 'Full page', value: 'full' },
          { label: 'Half page', value: 'half' },
          { label: 'Quarter page', value: 'quarter' },
        ],
      },
    ],
    getInitialValues: () => ({
      caption: '',
      position: 'full',
    }),
    buildContent: (values) => ({
      type: 'fullBleedImage',
      attrs: {
        src: '',
        caption: asString(values.caption, ''),
        position: asString(values.position, 'full'),
      },
    }),
  }),
  nodeBlock({
    name: 'pageBorder',
    label: 'Page Border',
    icon: 'BDR',
    category: 'Layout',
    description: 'Insert a decorative border treatment for the page.',
    keywords: ['border', 'frame', 'ornament'],
    createLabel: 'Create Border',
    fields: [
      {
        key: 'borderStyle',
        label: 'Style',
        type: 'select',
        options: [
          { label: 'Simple', value: 'simple' },
          { label: 'Elvish', value: 'elvish' },
          { label: 'Dwarven', value: 'dwarven' },
          { label: 'Infernal', value: 'infernal' },
        ],
      },
    ],
    getInitialValues: () => ({
      borderStyle: 'simple',
    }),
    buildContent: (values) => ({
      type: 'pageBorder',
      attrs: {
        borderStyle: asString(values.borderStyle, 'simple'),
      },
    }),
  }),
  nodeBlock({
    name: 'pageBreak',
    label: 'Page Break',
    icon: 'PG',
    category: 'Layout',
    description: 'Force the next content onto a new page.',
    keywords: ['page break', 'pagination'],
    createLabel: 'Insert Page Break',
    getInitialValues: () => ({}),
    buildContent: () => ({ type: 'pageBreak' }),
  }),
  nodeBlock({
    name: 'columnBreak',
    label: 'Column Break',
    icon: 'COL',
    category: 'Layout',
    description: 'Force content into the next column in multi-column layouts.',
    keywords: ['column break', 'layout'],
    createLabel: 'Insert Column Break',
    getInitialValues: () => ({}),
    buildContent: () => ({ type: 'columnBreak' }),
  }),
];

export const CATEGORY_ORDER = [
  'Creatures & NPCs',
  'Spells, Loot & Rules',
  'Encounters & Tables',
  'Writing',
  'Book Structure',
  'Layout',
  'Basic',
];
