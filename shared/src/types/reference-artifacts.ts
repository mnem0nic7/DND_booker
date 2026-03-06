/** Full NPC dossier — expands a bible entity seed into a detailed character reference. */
export interface NpcDossier {
  slug: string;
  name: string;
  race: string;
  class: string;
  level: number;
  alignment: string;
  role: string;
  appearance: string;
  personality: string;
  motivation: string;
  backstory: string;
  mannerisms: string[];
  dialogueHooks: string[];
  relationships: { name: string; slug: string; nature: string }[];
  secrets: string[];
  statBlock: {
    ac: number;
    hp: string;
    speed: string;
    abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
    skills: string[];
    senses: string;
    languages: string[];
    cr: string;
  };
}

/** Detailed location reference with areas, features, and connections. */
export interface LocationBrief {
  slug: string;
  name: string;
  locationType: string;
  atmosphere: string;
  description: string;
  areas: { name: string; description: string; features: string[]; dangers: string[] }[];
  npcsPresent: { slug: string; name: string; role: string }[];
  secrets: string[];
  connections: { destination: string; description: string }[];
  environmentalEffects: string[];
}

/** Full faction reference with hierarchy, goals, and resources. */
export interface FactionProfile {
  slug: string;
  name: string;
  purpose: string;
  alignment: string;
  description: string;
  leader: { name: string; slug: string; title: string };
  hierarchy: { rank: string; description: string }[];
  goals: string[];
  resources: string[];
  relationships: { factionName: string; nature: string }[];
  plotHooks: string[];
  headquarters: string;
}

/** Tactical encounter details for a quest or location. */
export interface EncounterBundle {
  slug: string;
  name: string;
  description: string;
  difficulty: string;
  suggestedLevel: { min: number; max: number };
  setup: string;
  enemies: { name: string; count: number; cr: string; tactics: string }[];
  environment: { terrain: string; lighting: string; features: string[] };
  complications: string[];
  rewards: { name: string; description: string }[];
  scalingNotes: string;
}

/** Magic item or treasure bundle for an item entity. */
export interface ItemBundle {
  slug: string;
  name: string;
  itemType: string;
  rarity: string;
  description: string;
  mechanics: string;
  attunement: boolean;
  properties: string[];
  lore: string;
  history: string;
  quirks: string[];
}
