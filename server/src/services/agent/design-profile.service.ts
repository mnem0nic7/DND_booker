import type { DesignConstraint, DesignProfile, DesignReference } from '@dnd-booker/shared';

const REFERENCES: DesignReference[] = [
  {
    id: 'dmguild-short-oneshot-layout',
    title: 'Short One-Shot Layout Patterns',
    category: 'layout',
    insight: 'Short adventures work best when they skip bloated front matter, keep chapter openers efficient, and spend pages on runnable play aids instead of decorative whitespace.',
    sourceLabel: 'DMGuild corpus',
    sourcePath: 'DMGuild/1473944-Down_the_Garden_Path_-_Matt_Everson_compressed.pdf',
  },
  {
    id: 'dmguild-npc-packeting',
    title: 'NPC Roster Packaging',
    category: 'usability',
    insight: 'Clustered scene NPCs should be presented as compact roster cards with goals, leverage, and what they know, not scattered prose notes.',
    sourceLabel: 'DMGuild corpus',
    sourcePath: 'DMGuild/2169203-The_Complete_NPC_-_Laws_of_Chaos.pdf',
  },
  {
    id: 'dmguild-encounter-density',
    title: 'Encounter Packet Density',
    category: 'content',
    insight: 'Encounter pages should combine setup, opposition, terrain, tactics, reward, and consequences so the DM can run the scene without stitching pages together.',
    sourceLabel: 'DMGuild corpus',
    sourcePath: 'DMGuild/715674-Fallen_From_Heavens_-_Marco_Bertini__Marco_Fossati_compressed.pdf',
  },
  {
    id: 'dmguild-map-handout-value',
    title: 'Maps and Handouts Must Earn Space',
    category: 'art',
    insight: 'Maps, banners, and handouts should either improve play clarity or carry real atmosphere; ornamental inserts that create dead space are a net negative.',
    sourceLabel: 'DMGuild corpus',
    sourcePath: 'DMGuild/1656028-The_Second_Black_Dawn_Compressed_V.1.2_-_Marco_Bertini.pdf',
  },
];

const CONSTRAINTS: DesignConstraint[] = [
  {
    code: 'NO_SHORT_ONESHOT_TOC',
    title: 'No TOC For Short One-Shots',
    description: 'Skip the table of contents by default for short one-shots unless the document is materially longer than a compact quick-start module.',
    severity: 'required',
  },
  {
    code: 'DM_BRIEF_EARLY',
    title: 'DM Brief Appears Early',
    description: 'Front matter should include a concise DM brief with hook, expected path, key reveals, and prep notes before dense chapter content.',
    severity: 'required',
  },
  {
    code: 'ENCOUNTER_PACKETS_ATOMIC',
    title: 'Encounter Packets Stay Atomic',
    description: 'Encounter details, stat blocks, tactics, and rewards should stay grouped tightly enough to be runnable without page hunting.',
    severity: 'required',
  },
  {
    code: 'RANDOM_TABLES_RUNNABLE',
    title: 'Random Tables Must Be Runnable',
    description: 'Random table entries must contain actionable encounter or discovery details, not flavor-only one-liners.',
    severity: 'required',
  },
  {
    code: 'STAT_BLOCKS_TRUSTWORTHY',
    title: 'Stat Blocks Must Be Trustworthy',
    description: 'Creature stat blocks must be internally consistent, free of placeholder values, and safe for the DM to run without manual repair.',
    severity: 'required',
  },
  {
    code: 'UTILITY_PACKETS_REQUIRED',
    title: 'Prose-Heavy Chapters Need Utility Packets',
    description: 'If a chapter leans on prose, add compact DM-running summaries, stakes, escalation steps, or other packets that turn it back into table-usable material.',
    severity: 'required',
  },
  {
    code: 'ART_MUST_EARN_SPACE',
    title: 'Art Must Earn Space',
    description: 'Illustration and banner treatments should not create large dead regions unless they materially improve readability or pacing.',
    severity: 'preferred',
  },
];

export function buildDefaultDesignProfile(projectTitle: string): DesignProfile {
  return {
    id: 'dm-ready-house-style-v1',
    title: `DM-Ready House Style for ${projectTitle}`,
    summary: 'A corpus-informed design profile that biases for DM usability, compact layout, runnable scene packets, and art that improves play instead of wasting pages.',
    references: REFERENCES,
    constraints: CONSTRAINTS,
    houseStyle: {
      openerStyle: 'Full-width chapter opener art or compact title band with two-column body flow below.',
      utilityBias: 'Favor compact DM aids, encounter packets, NPC rosters, maps, and tables over atmospheric prose sprawl.',
      artPolicy: 'Use art to orient or intensify a scene, not to create empty columns or isolated filler pages.',
      frontMatterPolicy: 'Keep front matter short, useful, and DM-first. Avoid standalone filler pages.',
    },
  };
}
