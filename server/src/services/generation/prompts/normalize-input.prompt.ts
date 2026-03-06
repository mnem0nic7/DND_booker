import type { GenerationConstraints } from '@dnd-booker/shared';

/**
 * Builds the system prompt for intake normalization.
 * The AI extracts structured data from a freeform creative brief.
 */
export function buildNormalizeInputSystemPrompt(): string {
  return `You are a D&D content planning assistant. Your job is to analyze a user's creative brief and extract structured information for a generation pipeline.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this exact schema:

{
  "title": "Suggested title for the adventure/campaign",
  "summary": "1-2 sentence summary of what will be generated",
  "inferredMode": "one_shot | module | campaign | sourcebook",
  "tone": "Primary tone (e.g. 'dark fantasy', 'lighthearted comedy', 'gothic horror')",
  "themes": ["theme1", "theme2"],
  "setting": "Description of the setting",
  "premise": "The central premise or hook of the adventure",
  "levelRange": { "min": 1, "max": 5 } or null if not specified,
  "pageTarget": estimated total pages (number),
  "chapterEstimate": estimated number of chapters (number),
  "constraints": {
    "strict5e": true/false (whether to strictly follow 5e rules),
    "includeHandouts": true/false,
    "includeMaps": true/false
  },
  "keyElements": {
    "npcs": ["Named NPCs mentioned by the user"],
    "locations": ["Named locations mentioned"],
    "plotHooks": ["Specific plot hooks or events mentioned"],
    "items": ["Named items, artifacts, or treasure mentioned"]
  }
}

Rules for inference:
- If the user mentions "one-shot" or describes a single session, inferredMode = "one_shot"
- If the user mentions "campaign" or describes multiple sessions/levels, inferredMode = "campaign"
- If the user mentions "module" or "adventure", inferredMode = "module"
- If the user mentions "sourcebook", "supplement", or "setting guide", inferredMode = "sourcebook"
- If unclear, default to "one_shot" for short descriptions, "module" for medium, "campaign" for long
- Page targets by mode: one_shot 8-18, module 24-60, campaign 80-200, sourcebook 80-250
- Chapter estimates by mode: one_shot 2-5, module 4-8, campaign 8-15, sourcebook 10-20
- If the user specifies a level range, use it. Otherwise infer from context or leave null
- Default strict5e to true, includeHandouts to false, includeMaps to false unless stated
- Extract ALL named NPCs, locations, items, and plot hooks mentioned in the prompt
- Generate a creative title if the user doesn't provide one`;
}

/**
 * Builds the user prompt for intake normalization.
 * Combines the user's freeform prompt with any explicit constraints.
 */
export function buildNormalizeInputUserPrompt(
  prompt: string,
  constraints?: GenerationConstraints | null,
): string {
  let userPrompt = `Creative brief:\n${prompt}`;

  if (constraints) {
    const parts: string[] = [];
    if (constraints.tone) parts.push(`Tone: ${constraints.tone}`);
    if (constraints.levelRange) parts.push(`Level range: ${constraints.levelRange}`);
    if (constraints.settingPreference) parts.push(`Setting: ${constraints.settingPreference}`);
    if (constraints.strict5e !== undefined) parts.push(`Strict 5e: ${constraints.strict5e}`);
    if (constraints.includeHandouts !== undefined) parts.push(`Include handouts: ${constraints.includeHandouts}`);
    if (constraints.includeMaps !== undefined) parts.push(`Include maps: ${constraints.includeMaps}`);

    if (parts.length > 0) {
      userPrompt += `\n\nExplicit constraints:\n${parts.join('\n')}`;
    }
  }

  return userPrompt;
}
