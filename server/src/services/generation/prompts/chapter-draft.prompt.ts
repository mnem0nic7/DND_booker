import type { BibleContent, ChapterPlan, ChapterOutlineEntry } from '@dnd-booker/shared';
import type { EntityContext, PriorChapterSummary } from '../context-assembler.service.js';

export function buildChapterDraftSystemPrompt(): string {
  return `You are a D&D adventure writer. You write chapter prose following a detailed chapter plan. Your output is markdown with special :::blockType markers for D&D editor blocks.

Output rules:
- Write in the specified narrative perspective and voice
- Use markdown headings (## for chapter title, ### for sections)
- Use **bold** for important names, locations, and game terms
- Use *italic* for read-aloud emphasis and flavor text

D&D block markers (use these for special content):
- :::readAloud ... ::: — Boxed text for the DM to read aloud to players
- :::dmTips ... ::: — DM advice and strategy boxes
- :::statBlock {"name":"...", "size":"...", "type":"...", ...} ::: — Creature stat blocks (JSON attrs on first line)
- :::encounterTable {"name":"...", "difficulty":"...", ...} ::: — Encounter details
- :::npcProfile {"name":"...", "race":"...", ...} ::: — NPC reference cards
- :::magicItem {"name":"...", "rarity":"...", ...} ::: — Magic item cards
- :::spellCard {"name":"...", "level":1, ...} ::: — Spell reference cards
- :::randomTable {"title":"...", "dieType":"d20", ...} ::: — Random table or lookup table
- :::handout {"title":"...", "style":"letter", "content":"..."} ::: — Player-facing letters, clues, or prop text
- :::sidebarCallout ... ::: — Sidebar notes and callouts

Content rules:
- Follow the chapter plan's section order exactly
- Hit the target word count for each section (within 20%)
- Include all read-aloud boxes and DM tips specified in the plan
- Reference entities by their canonical names
- Maintain continuity with prior chapter events
- Include encounter details where the plan specifies encounter sections
- Treat this as DM-facing adventure copy, not fiction. Most paragraphs should help run the table.
- Every section should make clear: what is happening, what the players can do, what checks or tactics matter, and what changes next.
- Every non-transition section should include concrete scene detail, not just summary: give the DM sensory setup, immediate pressure, actionable clues or rewards, and a visible consequence or escalation.
- Every non-transition section should feel fully stocked for play: aim for at least three substantial DM-facing prose paragraphs plus multiple utilities, not one thin setup paragraph followed by a box.
- Social sections should surface leverage, asks, tells, likely reactions, and what the NPC knows or will reveal.
- Exploration sections should surface clues, hazards, discoveries, and consequences.
- Encounter sections should surface terrain, enemy tactics, triggers, rewards, and aftermath.
- Every encounter section should read like a runnable encounter packet: setup, trigger, terrain, opposition, tactics, payoff, and consequences must be easy to scan.
- If you emit a :::randomTable block, every entry must be runnable. Each result should be 16-32 words and tell the DM the immediate situation, the active threat or opportunity, and the clue, reward, or consequence. Do not write bare results like "2d4 shadows" or "A miner spirit".
- NPC profiles must include actionable table data: goal, what they know, leverage, and likely reaction, not just personality color.
- If a scene introduces multiple named townsfolk, witnesses, or informants, emit each one as a separate :::npcProfile block instead of a numbered list with prose bullets.
- Use the planned utility blocks as real block markers. Do not replace them with plain prose summaries.
- If a section includes route choices, discoveries, loot, tactics, or consequence summaries, prefer bullets, tables, handouts, or callouts over dense exposition.
- Keep connective prose lean. Avoid long atmospheric passages unless they are boxed read-aloud text.
- Do not let a section collapse into one short setup paragraph plus one utility block. Build enough detail that the DM can improvise follow-up questions, setbacks, rewards, and follow-through without guessing.
- When in doubt, add concrete table detail rather than atmosphere: what the DM can point at, what the players can test, what worsens if they delay, and what payoff follows decisive action.
- Additional length is acceptable if it materially increases DM usability. Do not compress a scene until it loses runnable detail.
- End sections with actionable hooks, stakes, or consequences for the next section
- Do NOT include JSON wrapping — output raw markdown only`;
}

export function buildChapterDraftUserPrompt(
  chapter: ChapterOutlineEntry,
  plan: ChapterPlan,
  bible: BibleContent,
  entityDetails: EntityContext[],
  priorSummaries: PriorChapterSummary[],
): string {
  const parts: string[] = [
    `# Chapter: "${chapter.title}" (${chapter.slug})`,
    `Act: ${chapter.act} | Level range: ${chapter.levelRange.min}\u2013${chapter.levelRange.max}`,
    `Target pages: ${chapter.targetPages}`,
    '',
    '## World Context',
    `Setting: ${bible.worldRules.setting}`,
    `Era: ${bible.worldRules.era}`,
    `Tone: ${bible.worldRules.toneDescriptors.join(', ')}`,
    `Voice: ${bible.styleGuide.voice}`,
    `Perspective: ${bible.styleGuide.narrativePerspective}`,
    `Premise: ${bible.premise}`,
  ];

  if (bible.styleGuide.vocabulary.length > 0) {
    parts.push(`Preferred vocabulary: ${bible.styleGuide.vocabulary.join(', ')}`);
  }
  if (bible.styleGuide.avoidTerms.length > 0) {
    parts.push(`Avoid: ${bible.styleGuide.avoidTerms.join(', ')}`);
  }

  parts.push('', '## Sections to Write');
  for (const section of plan.sections) {
    const sectionNotes: string[] = [];
    if (section.contentType === 'encounter') {
      sectionNotes.push('Encounter packet: keep setup, terrain, enemy tactics, reward, and aftermath easy to scan.');
      sectionNotes.push('Do not stop at a partial packet. The DM should be able to run the full fight from this section without inventing missing trigger, action economy, consequence, or reward details.');
    }
    if (section.contentType === 'narrative') {
      sectionNotes.push('Narrative scenes still need table-ready detail: give the DM sensory texture, active pressure, at least one clue or reward, and a consequence the DM can point to immediately.');
    }
    if (section.contentType === 'exploration') {
      sectionNotes.push('Exploration scenes should name concrete hazards, route choices, discoveries, and what changes if the party delays, fails, or pushes deeper.');
      sectionNotes.push('If the section spans multiple areas or routes, give the DM more than one discovery or complication so the chapter does not feel thin.');
    }
    if (section.contentType === 'social') {
      sectionNotes.push('Social scenes should include what the NPC notices, what shifts their attitude, what they reveal only under pressure or with leverage, and what they ask from the party in return.');
    }
    if (section.blocksNeeded.includes('randomTable')) {
      sectionNotes.push('Random encounter table entries must each include situation, threat or opportunity, and payoff in 16-32 words.');
    }
    if (section.blocksNeeded.includes('npcProfile')) {
      sectionNotes.push('NPC profiles must include goal, what they know, leverage, and likely reaction.');
      sectionNotes.push('If multiple named townsfolk appear, give each one a separate npcProfile card.');
    }

    parts.push(
      `### ${section.title} (${section.contentType}, ~${section.targetWords} words)`,
      `Outline: ${section.outline}`,
      `Scene purpose: ${section.scenePurpose ?? 'Deliver clear, table-usable play guidance for this scene.'}`,
      `Player objective: ${section.playerObjective ?? 'Advance the chapter by making a meaningful choice or discovery.'}`,
      `Decision point: ${section.decisionPoint ?? 'Surface a concrete choice, risk, or tradeoff.'}`,
      `Consequence summary: ${section.consequenceSummary ?? 'Show how success, failure, or delay changes the chapter.'}`,
      `Key beats: ${section.keyBeats.join('; ')}`,
      `Blocks needed: ${section.blocksNeeded.join(', ') || 'none'}`,
      `Entity references: ${section.entityReferences.join(', ') || 'none'}`,
      ...(sectionNotes.length > 0 ? [`Section notes: ${sectionNotes.join(' ')}`] : []),
      '',
    );
  }

  if (plan.encounters.length > 0) {
    parts.push('## Encounters');
    for (const enc of plan.encounters) {
      parts.push(
        `**${enc.name}** (${enc.difficulty})`,
        `Enemies: ${enc.enemies.map((e) => `${e.count}x ${e.name} (CR ${e.cr})`).join(', ')}`,
        `Environment: ${enc.environment}`,
        `Tactics: ${enc.tactics}`,
        `Rewards: ${enc.rewards.join(', ')}`,
        '',
      );
    }
  }

  if (entityDetails.length > 0) {
    parts.push('## Entity Reference');
    for (const entity of entityDetails) {
      parts.push(
        `**${entity.name}** [${entity.entityType}] (${entity.slug})`,
        `${entity.summary}`,
        '',
      );
    }
  }

  if (priorSummaries.length > 0) {
    parts.push('## Prior Chapter Summaries (for continuity)');
    for (const prior of priorSummaries) {
      parts.push(`- **${prior.title}**: ${prior.summary}`);
    }
    parts.push('');
  }

  parts.push(
    `## Instructions`,
    `Write the full chapter prose. Target: ${plan.readAloudCount} read-aloud boxes, ${plan.dmTipCount} DM tips.`,
    `Difficulty progression: ${plan.difficultyProgression}`,
    'Prioritize reusable DM utility. If a point can be delivered with a stat block, table, NPC profile, handout, or short callout, use the block instead of extra exposition.',
    'Every non-transition section should visibly contain at least three DM-usable utilities such as a boxed read-aloud, tactical callout, encounter table, NPC card, random table, or handout.',
    'Make every section feel fully stocked for the DM: include sensory setup, immediate pressure, a clue or reward worth pursuing, a visible consequence or escalation, and enough follow-through that the DM can answer player questions without inventing basics.',
    'Err on the side of more playable detail. A chapter should feel like a stocked toolkit for the DM, not a synopsis with ornament.',
    'Random encounter tables must be GM-runnable without guessing. Make each result specific enough to run immediately.',
    'Keep full encounter packets and full stat blocks intact. If an encounter or monster is introduced, give complete support rather than a teaser or partial writeup.',
  );

  return parts.join('\n');
}
