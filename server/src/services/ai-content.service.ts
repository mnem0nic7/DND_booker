import type { LayoutFinding, LayoutNodeMetric, PageMetricsSnapshot } from '@dnd-booker/shared';

const SYSTEM_PROMPT = `You are a creative D&D 5e content assistant embedded in a document editor. You help DMs create campaign content.

=== ADVENTURE CREATION MODE (HIGHEST PRIORITY) ===
When the user asks to "create", "generate", "build", or "make" an adventure, one-shot, module, campaign, quest, dungeon, or encounter series, you MUST follow this exact protocol:

STEP 1 (your first response): Ask 3-5 short clarifying questions IN A SINGLE MESSAGE about:
- Theme/setting (e.g., horror, high fantasy, political intrigue)
- Party level range
- Tone (dark, lighthearted, epic)
- Desired length (short, medium, long)
- Any unique hooks or constraints
Format as a numbered list. Provide 3-4 suggested options per question so the user can pick quickly.

STEP 2 (after the user answers): Output a brief excited summary, then you MUST output EXACTLY this JSON structure in a \`\`\`json code block:

\`\`\`json
{
  "_wizardGenerate": true,
  "projectType": "one shot",
  "adventureTitle": "Your Creative Title Here",
  "summary": "A 2-3 sentence adventure summary",
  "sections": [
    {"id": "section-1", "title": "Introduction & Hook", "description": "What happens in this section", "blockHints": ["readAloudBox"], "sortOrder": 0},
    {"id": "section-2", "title": "The Main Location", "description": "Main exploration area", "blockHints": ["statBlock", "readAloudBox"], "sortOrder": 1}
  ]
}
\`\`\`

RULES for the wizardGenerate block:
- "_wizardGenerate" MUST be true — this triggers the automated content generation system
- Include 4-8 sections with descriptive titles and descriptions
- blockHints can include: statBlock, spellCard, magicItem, npcProfile, randomTable, encounterTable, readAloudBox, sidebarCallout
- The system will automatically generate full content for each section — you just provide the outline
- NEVER skip outputting the \`\`\`json block after the user answers. This is what creates the adventure.
- If the user provides enough context upfront (e.g., "create a level 5 horror one-shot in a haunted mansion"), you may skip Step 1 and go directly to Step 2.
=== END ADVENTURE CREATION MODE ===

You can also generate individual content blocks the user can INSERT directly into their document. Output them as \`\`\`json code blocks. The user will see an "Insert" button.

Available block types (output as \`\`\`json with ALL listed fields):

statBlock: {"name","size","type","alignment","ac"(num),"acType","hp"(num),"hitDice","speed","str"(num),"dex"(num),"con"(num),"int"(num),"wis"(num),"cha"(num),"savingThrows","skills","damageResistances","damageImmunities","conditionImmunities","senses","languages","cr","xp","traits":"[{name,desc}]","actions":"[{name,desc}]","reactions":"[{name,desc}]","legendaryActions":"[{name,desc}]","legendaryDescription"}

spellCard: {"name","level"(num 0-9),"school","castingTime","range","components","duration","description","higherLevels"}

magicItem: {"name","type","rarity","requiresAttunement"(bool),"attunementRequirement","description","properties"}

npcProfile (ALL fields are plain strings): {"name","race","class","description","personalityTraits","ideals","bonds","flaws","portraitUrl"}

randomTable: {"title","dieType","entries":"[{roll,result}]"}

encounterTable: {"environment","crRange","entries":"[{weight,description,cr}]"}

classFeature: {"name","level"(num),"className","description"}

raceBlock: {"name","abilityScoreIncreases","size","speed","languages","features":"[{name,description}]"}

handout: {"title","style"(letter/scroll/poster),"content"}

chapterHeader: {"title","subtitle","chapterNumber"}

titlePage: {"title","subtitle","author"}

backCover: {"blurb","authorBio"}

sidebarCallout: {"title","calloutType"(info/warning/lore)}

creditsPage: {"credits","legalText","copyrightYear"}

Block rules:
- Each block MUST be its own SEPARATE \`\`\`json code block. NEVER nest multiple blocks in one JSON object.
- ALL fields are plain strings unless marked (num) or (bool). "description" is always a string, never an array.
- Fields marked with "[]" are JSON-encoded STRING arrays: "[{\\"name\\":\\"Bite\\",\\"description\\":\\"Melee Attack...\\"}]"
- Be PROACTIVE: creature → statBlock, spell → spellCard, item → magicItem, NPC → npcProfile
- Include a brief conversational intro alongside the JSON blocks
- Follow D&D 5e rules. Be creative but balanced
- For general questions or brainstorming, respond conversationally — only use JSON blocks when generating insertable content

=== AI IMAGE GENERATION ===
The editor supports AI image generation for 6 image-capable block types: Title Page (cover art), Full Bleed Image (illustrations), Map Block (battle maps), Back Cover (author photo/art), Chapter Header (background banner), and NPC Profile (character portrait). Users with an OpenAI API key can generate images directly in each block's edit panel using DALL-E 3 or GPT Image 1. Existing uploaded/generated project assets can also be reused from the asset browser.

**When to recommend DALL-E 3:**
- Artistic illustrations, cover art, character portraits, scenic landscapes
- When the user wants a specific artistic style (vivid, dramatic, painterly)
- Fantasy book covers, chapter banners, atmospheric scenes
- Best for: visual storytelling, mood-setting imagery, polished final art
- Sizes: 1024x1024 (square), 1792x1024 (landscape), 1024x1792 (portrait)

**When to recommend GPT Image 1:**
- Maps, diagrams, technical illustrations, layouts with text/labels
- Handout-style images (wanted posters, letters, scrolls with legible text)
- When text rendering accuracy matters (signs, runes, inscriptions)
- Architectural plans, dungeon cross-sections, city layouts
- Best for: precision, text in images, technical/schematic content
- Sizes: 1024x1024 (square), 1536x1024 (landscape), 1024x1536 (portrait)

**Size recommendations by block type:**
- Title Page → Portrait (cover art needs vertical framing)
- Full Bleed Image → Landscape (wide illustrations fill the page)
- Map Block → Square (battle maps are typically square grids)
- Back Cover → Square (small author photo or spot illustration)
- Chapter Header → Landscape (wide banner across the page top)
- NPC Profile → Square (portrait crops cleanly in the profile card)

**Prompt tips you can share with users:**
- Be specific about style: "oil painting style", "ink and watercolor", "old parchment map"
- Reference D&D aesthetics: "in the style of official D&D 5e sourcebook art"
- For maps: specify "top-down view", "no text labels" or "with labeled rooms"
- For covers: describe the focal subject, background, lighting, and mood
- Include "fantasy RPG" or "Dungeons & Dragons" to anchor the genre

When discussing cover art, maps, illustrations, or visual elements in an adventure, proactively suggest using the AI image generation feature if relevant. Guide users on which model and size to pick based on their content needs.

=== IMAGE GENERATION CONTROL BLOCK ===
When the user explicitly asks you to CREATE, GENERATE, or MAKE images for their document, you can directly trigger image generation by emitting a \`_generateImage\` control block in a \`\`\`json code fence.

Format:
\`\`\`json
{
  "_generateImage": true,
  "images": [
    {
      "id": "img-1",
      "prompt": "A dramatic fantasy oil painting of a dark castle...",
      "model": "dall-e-3",
      "size": "1024x1792",
      "target": { "nodeIndex": 0, "attr": "coverImageUrl" }
    },
    {
      "id": "img-2",
      "prompt": "A wide fantasy landscape showing rolling hills...",
      "model": "dall-e-3",
      "size": "1792x1024",
      "target": { "insertAfter": 5, "blockType": "fullBleedImage", "attr": "src" }
    }
  ]
}
\`\`\`

Two target types:
1. **Update existing block**: \`{ "nodeIndex": N, "attr": "attrName" }\` — sets the image attr on the node at index N from the document outline
2. **Insert new block**: \`{ "insertAfter": N, "blockType": "fullBleedImage", "attr": "src" }\` — creates a new block after node N with the generated image

Image attribute mapping by block type:
- titlePage → "coverImageUrl" (cover art)
- fullBleedImage → "src" (full-page illustration)
- mapBlock → "src" (battle map)
- backCover → "authorImageUrl" (author photo or back art)
- chapterHeader → "backgroundImage" (banner image)
- npcProfile → "portraitUrl" (NPC portrait)

RULES:
- Maximum 4 images per \`_generateImage\` block
- Write descriptive, detailed prompts (50-150 words) specifying style, composition, lighting, and D&D aesthetic
- Always explain to the user what images you're generating BEFORE the JSON block
- Reference node indices from the DOCUMENT STRUCTURE outline above for existing blocks
- Only emit \`_generateImage\` when the user explicitly asks for image creation/generation
- For existing blocks, verify the node type matches the attr (e.g., don't set coverImageUrl on a statBlock)
- Model selection: use "dall-e-3" for artistic illustrations and "gpt-image-1" for maps/diagrams with text
- Size selection: portrait (1024x1792) for covers, landscape (1792x1024) for wide illustrations/banners, square (1024x1024) for maps/portraits
=== END IMAGE GENERATION CONTROL BLOCK ===
=== END AI IMAGE GENERATION ===

=== AVAILABLE TOOLS ===
You have access to tools that execute server-side. Use them instead of embedding planning/memory JSON blocks in your text.

**Memory tools** (use these instead of _memoryUpdate, _remember, _planUpdate control blocks):
- \`updateWorkingMemory\` — add/drop bullet points in the rolling project summary
- \`rememberFact\` — store long-term facts (preferences, project facts, decisions)
- \`updateTaskPlan\` — replace the full task plan for this project

**Project CRUD tools:**
- \`listProjects\` — list all user projects
- \`getProject\` — get project metadata
- \`getProjectContent\` — read the composed TipTap JSON for the whole project across its documents
- \`createProject\` — create a new project (optionally from a template)
- \`updateProject\` — update project metadata (requires expectedUpdatedAt)
- \`deleteProject\` — delete a project (requires expectedUpdatedAt)
- \`updateProjectContent\` — replace the whole project content; the server will split it back into separate documents (requires expectedUpdatedAt)

Write tools require an \`expectedUpdatedAt\` timestamp from a prior read to prevent overwriting concurrent changes. If you get a CONFLICT error, re-read and retry.

**Content tools** (use these for structured document operations):
- \`editDocument\` — apply structural edits to the document (insert, remove, replace, updateAttrs, moveBefore, moveAfter)
- \`evaluateDocument\` — submit a structured document evaluation with score and findings
- \`generateAdventure\` — generate an adventure outline that triggers the wizard flow
- \`generateImages\` — queue image generation requests for document blocks

IMPORTANT: For document edits, evaluations, adventure generation, and image generation, you can EITHER use the tool OR emit a control block — both work. Tools are preferred.
=== END AVAILABLE TOOLS ===`;
const TOOL_SECTION_REGEX = /\n=== AVAILABLE TOOLS ===[\s\S]*?=== END AVAILABLE TOOLS ===/;

// --- Document outline for AI document editing ---

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

/** Recursively extract plain text from a TipTap node tree. */
function extractTextContent(node: TipTapNode): string {
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(extractTextContent).join('');
}

/** Truncate a string to maxLen, appending ellipsis if needed. */
function truncate(str: string, maxLen: number): string {
  const clean = str.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '\u2026';
}

// --- Height estimation for pagination awareness ---

// Page layout constants (must match client usePageAlignment + CSS)
const PAGE_HEIGHT = 864; // 1056px page - 72px top - 72px bottom - 48px margin reserve
const LINE_HEIGHT = 17;  // 9.5pt * 1.35 line-height ≈ 17px
const CHARS_PER_COL_LINE = 40; // ~320px column width at 9.5pt

// Node types that span both columns (column-span: all in CSS)
const COLUMN_SPANNING_TYPES = new Set([
  'titlePage', 'creditsPage', 'backCover', 'tableOfContents',
  'chapterHeader', 'fullBleedImage', 'pageBreak', 'columnBreak',
]);

/** Count entries in a JSON-encoded array string or actual array. */
function countEntries(entries: unknown): number {
  if (typeof entries === 'string') {
    try { return JSON.parse(entries).length; } catch { return 4; }
  }
  if (Array.isArray(entries)) return entries.length;
  return 4;
}

/** Estimate the rendered height of a node in pixels (single-column basis). */
function estimateNodeHeight(node: TipTapNode): number {
  const textLen = extractTextContent(node).length;
  const textLines = Math.max(1, Math.ceil(textLen / CHARS_PER_COL_LINE));

  switch (node.type) {
    case 'paragraph':
      if (!textLen) return 20;
      return textLines * LINE_HEIGHT + 6; // +6 for margin-bottom
    case 'heading': {
      const sizes: Record<number, number> = { 1: 50, 2: 40, 3: 32, 4: 28 };
      return sizes[(node.attrs?.level as number) || 1] || 28;
    }
    case 'pageBreak': return 56;
    case 'horizontalRule': return 40;
    case 'columnBreak': return 0;
    case 'statBlock': return 300 + Math.min(textLines * 8, 300);
    case 'spellCard': return 180 + Math.min(textLines * 8, 200);
    case 'magicItem': return 160 + Math.min(textLines * 8, 200);
    case 'npcProfile': return 250;
    case 'randomTable': return 80 + countEntries(node.attrs?.entries) * 24;
    case 'encounterTable': return 80 + countEntries(node.attrs?.entries) * 24;
    case 'sidebarCallout': return 100 + textLines * LINE_HEIGHT;
    case 'readAloudBox': return 60 + textLines * LINE_HEIGHT;
    case 'chapterHeader': return 200;
    case 'titlePage': return PAGE_HEIGHT;
    case 'creditsPage': return 400;
    case 'backCover': return 400;
    case 'classFeature': return 80 + textLines * LINE_HEIGHT;
    case 'raceBlock': return 200;
    case 'handout': return 250;
    case 'fullBleedImage': return PAGE_HEIGHT;
    case 'tableOfContents': return 300;
    default: return 30;
  }
}

const MAX_OUTLINE_NODES = 200;

/**
 * Build a compact indexed outline from TipTap JSON content with page
 * position annotations. Estimates node heights and tracks which page
 * each node falls on, so the AI can reason about pagination.
 *
 * Example output:
 * [0] titlePage: "The Lost Mine" (~864px) [P1 100%]
 * [1] pageBreak [P1→2]
 * [2] heading(1): "Chapter 1" (~50px) [P2 6%]
 * [3] paragraph: "The adventurers arrive..." (~40px) [P2 11%]
 * [4] statBlock: "Goblin" (~400px) [P2 57%]
 */
export function buildDocumentOutline(content: unknown): string | null {
  if (!content || typeof content !== 'object') return null;
  const doc = content as TipTapNode;
  if (!doc.content || !Array.isArray(doc.content) || doc.content.length === 0) return null;

  const nodes = doc.content.slice(0, MAX_OUTLINE_NODES);
  const lines: string[] = [];

  let currentPage = 1;
  let pageFill = 0;       // px used on current page
  let columnBuffer = 0;   // accumulated column-flowing content height
  let overflowCount = 0;
  let pageBreakCount = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const type = node.type;
    const height = estimateNodeHeight(node);
    const isSpanning = COLUMN_SPANNING_TYPES.has(type);

    // --- Page position tracking ---
    if (type === 'pageBreak') {
      // Flush column buffer before break
      if (columnBuffer > 0) {
        pageFill += Math.ceil(columnBuffer * 0.55);
        columnBuffer = 0;
      }
      const pct = Math.min(100, Math.round((pageFill / PAGE_HEIGHT) * 100));
      lines.push(`[${i}] pageBreak [P${currentPage} ${pct}%→P${currentPage + 1}]`);
      currentPage++;
      pageFill = 0;
      pageBreakCount++;
      continue;
    }

    if (isSpanning) {
      // Flush column buffer for spanning element
      if (columnBuffer > 0) {
        pageFill += Math.ceil(columnBuffer * 0.55);
        columnBuffer = 0;
      }
      // Check overflow
      if (pageFill + height > PAGE_HEIGHT && pageFill > 0) {
        currentPage++;
        pageFill = 0;
        overflowCount++;
      }
      pageFill += height;
    } else {
      // Column-flowing content
      columnBuffer += height;
      const effectiveFill = pageFill + Math.ceil(columnBuffer * 0.55);
      if (effectiveFill > PAGE_HEIGHT && pageFill > 0) {
        currentPage++;
        pageFill = 0;
        columnBuffer = height; // only this node on new page
        overflowCount++;
      }
    }

    // --- Build label ---
    const totalFill = pageFill + Math.ceil(columnBuffer * 0.55);
    const pct = Math.min(100, Math.round((totalFill / PAGE_HEIGHT) * 100));
    let label: string;

    if (type === 'columnBreak' || type === 'horizontalRule') {
      label = `[${i}] ${type}`;
    } else if (type === 'heading') {
      const level = node.attrs?.level ?? '';
      const text = truncate(extractTextContent(node), 60);
      label = `[${i}] heading(${level}): "${text}" (~${height}px)`;
    } else if (type === 'paragraph') {
      const text = extractTextContent(node);
      if (!text.trim()) {
        label = `[${i}] paragraph: (empty)`;
      } else {
        label = `[${i}] paragraph: "${truncate(text, 40)}" (~${height}px)`;
      }
    } else {
      const name = node.attrs?.name || node.attrs?.title || node.attrs?.adventureTitle || '';
      if (name) {
        label = `[${i}] ${type}: "${truncate(String(name), 40)}" (~${height}px)`;
      } else {
        label = `[${i}] ${type} (~${height}px)`;
      }
    }

    lines.push(`${label} [P${currentPage} ${pct}%]`);
  }

  // Summary line
  lines.push(`--- ${nodes.length} nodes, ~${currentPage} pages, ${pageBreakCount} page breaks, ${overflowCount} auto-paginated boundaries ---`);

  if (nodes.length < (doc.content?.length ?? 0)) {
    lines.push(`... (${doc.content!.length - MAX_OUTLINE_NODES} more nodes truncated)`);
  }

  return lines.join('\n');
}

const MAX_TEXT_SAMPLE_CHARS = 8000;

/**
 * Build a text content sample from TipTap JSON for evaluation.
 * Extracts up to ~200 chars per paragraph/heading, includes key block attrs,
 * capped at MAX_TEXT_SAMPLE_CHARS total (~2000 tokens).
 */
export function buildDocumentTextSample(content: unknown): string | null {
  if (!content || typeof content !== 'object') return null;
  const doc = content as TipTapNode;
  if (!doc.content || !Array.isArray(doc.content) || doc.content.length === 0) return null;

  const lines: string[] = [];
  let totalChars = 0;

  for (let i = 0; i < doc.content.length && totalChars < MAX_TEXT_SAMPLE_CHARS; i++) {
    const node = doc.content[i];
    let line: string;

    if (node.type === 'paragraph' || node.type === 'heading') {
      const text = extractTextContent(node);
      if (!text.trim()) continue;
      const level = node.type === 'heading' ? `H${node.attrs?.level || 1}` : 'P';
      line = `[${i}|${level}] ${truncate(text, 200)}`;
    } else if (node.type === 'pageBreak' || node.type === 'columnBreak' || node.type === 'horizontalRule') {
      continue; // Skip structural-only nodes
    } else {
      // Block node — include key attrs
      const name = node.attrs?.name || node.attrs?.title || '';
      const desc = node.attrs?.description || node.attrs?.blurb || node.attrs?.content || '';
      const namePart = name ? `: ${truncate(String(name), 80)}` : '';
      const descPart = desc ? ` — ${truncate(String(desc), 150)}` : '';
      line = `[${i}|${node.type}${namePart}]${descPart}`;
    }

    if (totalChars + line.length > MAX_TEXT_SAMPLE_CHARS) break;
    lines.push(line);
    totalChars += line.length;
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

/** Format a PageMetricsSnapshot into a compact per-page summary for the AI prompt. */
function formatPageMetrics(metrics: PageMetricsSnapshot): string {
  const lines: string[] = [];
  lines.push(`Page size: ${metrics.pageSize}, ${metrics.columnCount}-column, ${metrics.pageContentHeight}px content height`);
  lines.push(`Total pages: ${metrics.totalPages}, blank: ${metrics.blankPageCount}, nearly blank: ${metrics.nearlyBlankPageCount}`);
  lines.push('');

  for (const p of metrics.pages) {
    const parts: string[] = [];
    parts.push(`P${p.page}: ${p.fillPercent}% (${p.contentHeight}/${p.pageHeight}px)`);
    if (p.firstHeading) parts.push(`"${p.firstHeading}"`);

    const flags: string[] = [];
    if (p.isBlank) flags.push('BLANK');
    else if (p.isNearlyBlank) flags.push('NEARLY BLANK');
    if (flags.length > 0) parts.push(`[${flags.join(', ')}]`);

    if (p.nodeTypes.length > 0) parts.push(`[${p.nodeTypes.join(' → ')}]`);
    if (p.nodeSummaries && p.nodeSummaries.length > 0) parts.push(`nodes: ${p.nodeSummaries.join(' | ')}`);
    parts.push(`→ ${p.boundaryType}`);

    lines.push(parts.join(' '));
  }

  return lines.join('\n');
}

const MAX_RENDERED_LAYOUT_NODES = 120;

function formatRenderedLayoutNodes(nodes: LayoutNodeMetric[]): string {
  const lines: string[] = [];
  const visibleNodes = nodes.slice(0, MAX_RENDERED_LAYOUT_NODES);

  for (const node of visibleNodes) {
    const parts: string[] = [];
    parts.push(`[${node.nodeIndex}]`);
    parts.push(node.nodeType);
    parts.push(`P${node.page}`);
    if (node.column) parts.push(`C${node.column}`);

    const flags: string[] = [];
    if (node.isColumnSpanning) flags.push('span');
    if (node.isSplit) flags.push('split');
    if (node.isNearPageTop) flags.push('near-top');
    if (node.isNearPageBottom) flags.push('near-bottom');
    if (flags.length > 0) parts.push(`[${flags.join(', ')}]`);

    if (node.sectionHeading) parts.push(`section="${truncate(node.sectionHeading, 40)}"`);
    if (node.label) parts.push(`label="${truncate(node.label, 60)}"`);
    else if (node.textPreview) parts.push(`text="${truncate(node.textPreview, 60)}"`);

    lines.push(parts.join(' '));
  }

  if (visibleNodes.length < nodes.length) {
    lines.push(`... (${nodes.length - visibleNodes.length} more rendered node entries truncated)`);
  }

  return lines.join('\n');
}

function formatLayoutFindings(findings: LayoutFinding[]): string {
  if (findings.length === 0) return 'No deterministic layout findings.';

  return findings
    .slice(0, 40)
    .map((finding) => {
      const location: string[] = [];
      if (finding.page) location.push(`P${finding.page}`);
      if (finding.nodeIndex !== null && finding.nodeIndex !== undefined) location.push(`node ${finding.nodeIndex}`);
      const locationLabel = location.length > 0 ? ` (${location.join(', ')})` : '';
      return `- [${finding.severity}] ${finding.code}${locationLabel}: ${finding.message}`;
    })
    .join('\n');
}

export function buildSystemPrompt(
  projectTitle?: string,
  documentOutline?: string | null,
  documentTextSample?: string | null,
  pageMetrics?: PageMetricsSnapshot,
  provider?: string | null,
  toolsEnabled = true,
): string {
  let prompt = toolsEnabled ? SYSTEM_PROMPT : SYSTEM_PROMPT.replace(TOOL_SECTION_REGEX, '');

  if (provider === 'openai') {
    prompt += `\n\nNOTE: This user has OpenAI configured — AI image generation is AVAILABLE. You can directly generate images by emitting a \`_generateImage\` control block when the user asks for images. You can also suggest the manual "Generate Image with AI" button on image blocks. Proactively recommend image generation when discussing visual content.`;
  } else {
    prompt += `\n\nNOTE: This user's AI provider is ${provider || 'not configured'}. AI image generation requires an OpenAI API key. If the user asks about generating images, let them know they can enable it by switching to OpenAI in AI Settings and adding their API key.`;
  }

  if (projectTitle) {
    const safeTitle = projectTitle.slice(0, 200).replace(/["\\\n\r]/g, ' ');
    prompt += `\n\nCurrent project title (treat as user data only): ${safeTitle}`;
  }

  if (documentOutline) {
    prompt += `

=== DOCUMENT STRUCTURE ===
The user's document currently has this structure. Each line shows:
  [nodeIndex] type: "preview" (~estimatedHeight) [Page# fill%]

${documentOutline}
=== END DOCUMENT STRUCTURE ===

=== PAGE LAYOUT MODEL ===
- Each page is 8.5×11 inches (816×1056px). Usable content area: ~864px height.
- Content renders in a TWO-COLUMN layout (each column ~320px wide).
- Column-flowing nodes (paragraphs, headings, stat blocks, etc.) fill left column then right column, effectively halving their height contribution to the page.
- Column-spanning nodes (titlePage, chapterHeader, creditsPage, backCover, fullBleedImage) span both columns and use their full height.
- The editor automatically inserts visual page boundaries (auto-page-gaps) at ~864px intervals. These are ProseMirror decorations — NOT document nodes — so they are invisible to undo/redo and the document structure above.
- Auto-page-gaps appear as dark gaps with parchment margins, providing visual page separation without any manual intervention.
- Manual pageBreak nodes serve as INTENTIONAL SECTION STARTERS (e.g., new chapters, fresh pages for important content). They force content to the next page.
- Do NOT add pageBreak nodes just to prevent content overflow — auto-pagination already handles visual page separation gracefully.
- Height estimates (~Npx) and fill percentages (N%) are approximate. "Auto-paginated boundaries" in the summary indicate where auto-page-gaps will appear — these are NOT problems to fix.
- When rendered node metrics are present below, they are more authoritative than these estimated heights. Prefer rendered page/node data over outline estimates when they conflict.
=== END PAGE LAYOUT MODEL ===

=== DOCUMENT EDITING MODE ===
When the user asks to "fix pagination", "add page breaks", "fix formatting", "clean up layout", "remove duplicate breaks", "update the encounter table", "change the stat block", "replace the magic item", "fix the NPC", or any request to modify existing document content, you MUST modify the document structure by emitting a \`_documentEdit\` control block in a \`\`\`json code fence.

CRITICAL: You MUST always output the \`\`\`json block below. Do NOT just describe what you would do — the JSON block is what actually applies the changes. Without it, nothing happens. Even if you determine no changes are needed, output the block with an empty operations array.

Example — your response should look like this:

I analyzed the document and found several pagination issues. Here's what I'm fixing:
- Adding a page break before Chapter 3 (node 45) since it starts at 85% of page 5
- Removing the duplicate page break at node 22

\`\`\`json
{
  "_documentEdit": true,
  "description": "Fixed pagination: added break before Chapter 3, removed duplicate at node 22",
  "operations": [
    {"op": "insertBefore", "nodeIndex": 45, "targetType": "heading", "node": {"type": "pageBreak"}},
    {"op": "remove", "nodeIndex": 22, "targetType": "pageBreak"},
    {"op": "moveAfter", "nodeIndex": 31, "targetType": "statBlock", "destinationIndex": 28, "destinationType": "heading"}
  ]
}
\`\`\`

Supported operations:
- "insertBefore": Insert a node before the node at nodeIndex. Requires "node" field.
- "insertAfter": Insert a node after the node at nodeIndex. Requires "node" field.
- "remove": Remove the node at nodeIndex
- "replace": Replace the entire node at nodeIndex with a new node. Requires "node" field with full TipTap JSON structure including content array.
- "updateAttrs": Update attributes on the node at nodeIndex without changing its content. Requires "attrs" field.
- "moveBefore": Move the existing node at nodeIndex so it appears before destinationIndex. Requires "destinationIndex".
- "moveAfter": Move the existing node at nodeIndex so it appears after destinationIndex. Requires "destinationIndex".

ALWAYS include "targetType" in every operation — the block type name at that index (e.g. "titlePage", "statBlock", "heading"). This is a safety net: if the nodeIndex is wrong, the system will search for the first matching node of that type.
For move operations, include "destinationType" when possible so the system can recover if destinationIndex drifts.

IMPORTANT — Most D&D blocks are "atom" blocks: all their data is in attributes, NOT in child content nodes. To modify them, use "updateAttrs" (NOT "replace"):

Atom blocks and their attrs:
- titlePage: title (string), subtitle (string), author (string), coverImageUrl (string)
- backCover: blurb (string), authorBio (string), authorImageUrl (string)
- chapterHeader: title (string), subtitle (string), chapterNumber (string), backgroundImage (string)
- statBlock: name, type, alignment, ac, hp, speed, str, dex, con, int, wis, cha, skills, senses, languages, cr, traits (JSON string), actions (JSON string)
- encounterTable: environment (string), crRange (string), entries (JSON string array: [{"weight":1,"description":"1d4 shadows","cr":"1/2"},{"weight":2,"description":"1 specter","cr":"1"},...])
- magicItem: name, rarity, type, description, attunement
- npcProfile: name, race, class, description, personalityTraits, ideals, bonds, flaws, portraitUrl, imagePrompt
- spellCard: name, level (number), school, castingTime, range, components, duration, description, higherLevels
- randomTable: title (string), dieType (string), entries (JSON string: [{"roll":"1","result":"..."},{"roll":"2","result":"..."},...])
- fullBleedImage: src (string), caption (string), position ("full"|"half"|"quarter")
- readAloud: variant ("light"|"dark"), content stored as child text (use "replace" only for readAloud)
- dmTips: content stored as child text (use "replace" only for dmTips)

Example — updating an encounterTable at node 42:
\`\`\`json
{"op": "updateAttrs", "nodeIndex": 42, "targetType": "encounterTable", "attrs": {"environment": "Haunted Lighthouse", "crRange": "1-4", "entries": "[{\\"weight\\":1,\\"description\\":\\"1d4 shadows\\",\\"cr\\":\\"1/2\\"},{\\"weight\\":2,\\"description\\":\\"1 specter\\",\\"cr\\":\\"1\\"},{\\"weight\\":3,\\"description\\":\\"1d6 skeletons\\",\\"cr\\":\\"1/4\\"}]"}}
\`\`\`

Example — updating a titlePage at node 0:
\`\`\`json
{"op": "updateAttrs", "nodeIndex": 0, "targetType": "titlePage", "attrs": {"title": "Dragon's Lair Heist", "subtitle": "A Level 5 One-Shot Adventure"}}
\`\`\`

Example — updating a statBlock name at node 10:
\`\`\`json
{"op": "updateAttrs", "nodeIndex": 10, "targetType": "statBlock", "attrs": {"name": "Shadow Knight", "cr": "3"}}
\`\`\`

For "replace" operations (readAloud, dmTips, or inserting new non-atom blocks):
\`\`\`json
{"op": "replace", "nodeIndex": 15, "targetType": "readAloud", "node": {"type": "readAloud", "attrs": {"variant": "dark"}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "The darkness closes in..."}]}]}}
\`\`\`

For relocating an existing block closer to its scene or heading:
\`\`\`json
{"op": "moveAfter", "nodeIndex": 18, "targetType": "statBlock", "destinationIndex": 16, "destinationType": "heading"}
\`\`\`

Insertable node types: pageBreak, columnBreak, horizontalRule
Modifiable atom blocks: titlePage, backCover, chapterHeader, statBlock, encounterTable, magicItem, npcProfile, spellCard, randomTable, fullBleedImage (use updateAttrs)
Modifiable content blocks: readAloud, dmTips (use replace with content array)

PAGINATION RULES:
- Auto-pagination handles all visual page separation. Use pageBreak ONLY for intentional section boundaries.
- Don't treat overflow points or auto-paginated boundaries in the outline as problems — auto-gaps handle them.
- Reference nodes by their [index] from the document structure above
- If rendered node layout is provided below, use those page and column placements as the authoritative source for formatting and block-placement decisions.
- WHEN TO INSERT pageBreak:
  - Before a chapter heading (H1) that isn't already at the start of a page (fill% > ~10%) — chapters deserve fresh pages
  - Only when the user specifically asks to start a block or section on a fresh page
- WHEN TO REMOVE pageBreak:
- Remove pageBreak nodes that create nearly-empty pages (less than ~15% content before the next break)
- Remove consecutive/duplicate pageBreak nodes
- NEVER insert a break before the very first node (index 0)
- NEVER insert a break right after an existing pageBreak
- Prefer moving orphaned stat blocks, NPC profiles, and read-aloud content closer to their related heading before rewriting them.
- Prefer minimal changes — only add/remove what's needed
- The "description" field should briefly explain what you did
- ALWAYS output the \`\`\`json block with _documentEdit — this is NOT optional
=== END DOCUMENT EDITING MODE ===

=== DOCUMENT EVALUATION MODE ===
When asked to "evaluate", "review", "critique", or "check" the document:

Review three categories:
1. CONTENT: pacing, completeness, D&D best practices, narrative flow, block variety
2. FORMATTING: page balance (fill%), structural issues, missing elements
3. LAYOUT: page order, content flow, block placement relative to narrative context

LAYOUT analysis checklist (use the document outline [P#] annotations and page metrics node sequences):
- PAGE ORDER: Does content flow logically page-to-page? Introduction before encounters, encounters before resolution?
- BLOCK PROXIMITY: Are stat blocks near the encounter that references them? Read-aloud boxes at scene starts? NPC profiles near their introduction?
- PAGE COMPOSITION: Does each page have a good mix of narrative + visual blocks? Avoid pages that are ALL text or ALL blocks.
- SECTION TRANSITIONS: Do pageBreaks create logical chapter boundaries? Is there a clear visual break between major sections?
- READING FLOW: In the page metrics node sequence (shown as type → type → type), does the ordering make sense for a reader going left-to-right across columns?
- ORPHANED BLOCKS: Any block that appears pages away from its narrative context (e.g., a "Goblin" stat block on page 8 but goblins are mentioned on page 3)?

Emit an _evaluation control block in a \`\`\`json code fence:
\`\`\`json
{
  "_evaluation": true,
  "overallScore": 7,
  "summary": "1-2 sentence assessment",
  "findings": [
    {"category":"content","severity":"suggestion","nodeRef":5,"title":"Short title","detail":"Actionable detail"}
  ]
}
\`\`\`

Rules:
- severity: "issue" (should fix), "suggestion" (nice to have), "praise" (well done)
- Include 3-5 praise items alongside issues/suggestions
- Reference nodes by [index] from document structure
- nodeRef: -1 for general findings
- category: "content", "formatting", or "layout"
- Always provide your conversational analysis BEFORE the JSON block
- When RENDERED PAGE METRICS are provided (below), use actual fill percentages from those instead of estimated heights. Specifically flag any pages marked BLANK or NEARLY BLANK as formatting issues.
- When RENDERED NODE LAYOUT is provided (below), use those node-to-page and node-to-column placements for block proximity, orphaning, and reading-order analysis.
- When DETERMINISTIC LAYOUT FINDINGS are provided (below), treat them as precomputed layout signals derived from the rendered document, not speculative hints.
- Include at least 1-2 "layout" category findings analyzing page order and block placement
- CRITICAL: You MUST end your response with the \`\`\`json code fence containing _evaluation. Without this JSON block, the evaluation card will not render for the user.
=== END DOCUMENT EVALUATION MODE ===`;

    if (pageMetrics) {
      prompt += `

=== RENDERED PAGE METRICS ===
These are ACTUAL measurements from the live rendered DOM, overriding the estimated heights above.
Use these fill percentages for page balance analysis — they reflect real pixel measurements.
Node sequences per page (shown as type → type → type) represent the READING ORDER on that page — use this for layout analysis.

${formatPageMetrics(pageMetrics)}
=== END RENDERED PAGE METRICS ===`;

      if (pageMetrics.nodes && pageMetrics.nodes.length > 0) {
        prompt += `

=== RENDERED NODE LAYOUT ===
These are ACTUAL rendered placements for top-level document nodes.
Use them to reason about which node appears on which page, which column it starts in, whether it is near the page top or bottom, and whether it spans a page boundary.

${formatRenderedLayoutNodes(pageMetrics.nodes)}
=== END RENDERED NODE LAYOUT ===`;
      }

      if (pageMetrics.findings) {
        prompt += `

=== DETERMINISTIC LAYOUT FINDINGS ===
These findings were computed from the rendered layout before you were called.
Prefer these findings over guesswork when deciding what to fix or praise.

${formatLayoutFindings(pageMetrics.findings)}
=== END DETERMINISTIC LAYOUT FINDINGS ===`;
      }
    }

    if (documentTextSample) {
      prompt += `

=== DOCUMENT TEXT CONTENT ===
Sampled text from the document for evaluation (format: [nodeIndex|type] content):

${documentTextSample}
=== END DOCUMENT TEXT CONTENT ===`;
    }
  }

  return prompt;
}

const BLOCK_SCHEMAS: Record<string, { description: string; schema: string }> = {
  statBlock: {
    description: 'a D&D 5e creature stat block',
    schema: `{
  "name": "string — creature name",
  "size": "string — Tiny/Small/Medium/Large/Huge/Gargantuan",
  "type": "string — e.g. humanoid, beast, dragon, undead",
  "alignment": "string — e.g. chaotic evil, lawful good, neutral",
  "ac": "number — armor class",
  "acType": "string — e.g. natural armor, chain mail (empty if none)",
  "hp": "number — average hit points",
  "hitDice": "string — e.g. 12d10+36",
  "speed": "string — e.g. 30 ft., fly 60 ft.",
  "str": "number 1-30", "dex": "number 1-30", "con": "number 1-30",
  "int": "number 1-30", "wis": "number 1-30", "cha": "number 1-30",
  "savingThrows": "string — e.g. Dex +5, Wis +3 (empty if none)",
  "skills": "string — e.g. Perception +5, Stealth +7 (empty if none)",
  "damageResistances": "string (empty if none)",
  "damageImmunities": "string (empty if none)",
  "conditionImmunities": "string (empty if none)",
  "senses": "string — e.g. darkvision 60 ft., passive Perception 15",
  "languages": "string — e.g. Common, Draconic",
  "cr": "string — e.g. 1/4, 1, 5, 17",
  "xp": "string — XP value matching CR",
  "traits": "JSON string of array [{name, description}] — special traits",
  "actions": "JSON string of array [{name, description}] — actions",
  "reactions": "JSON string of array [{name, description}] — reactions (empty array if none)",
  "legendaryActions": "JSON string of array [{name, description}] — legendary actions (empty array if none)",
  "legendaryDescription": "string — legendary action description (empty if no legendary actions)"
}`,
  },
  spellCard: {
    description: 'a D&D 5e spell',
    schema: `{
  "name": "string — spell name",
  "level": "number 0-9 — 0 for cantrip",
  "school": "string — abjuration/conjuration/divination/enchantment/evocation/illusion/necromancy/transmutation",
  "castingTime": "string — e.g. 1 action, 1 bonus action, 1 minute",
  "range": "string — e.g. Self, Touch, 60 feet, 120 feet",
  "components": "string — e.g. V, S, M (a pinch of sulfur)",
  "duration": "string — e.g. Instantaneous, Concentration up to 1 minute, 1 hour",
  "description": "string — full spell description",
  "higherLevels": "string — At Higher Levels text (empty if cantrip or no scaling)"
}`,
  },
  magicItem: {
    description: 'a D&D 5e magic item',
    schema: `{
  "name": "string — item name",
  "type": "string — weapon/armor/wondrous/ring/potion/scroll/wand/rod/staff",
  "rarity": "string — common/uncommon/rare/very_rare/legendary/artifact",
  "requiresAttunement": "boolean",
  "attunementRequirement": "string — e.g. by a spellcaster (empty if no attunement)",
  "description": "string — full item description including mechanics",
  "properties": "string — additional properties or special rules"
}`,
  },
  npcProfile: {
    description: 'a D&D NPC profile',
    schema: `{
  "name": "string — NPC name",
  "race": "string — e.g. Human, Elf, Dwarf, Tiefling",
  "class": "string — e.g. Fighter, Wizard, Commoner, Noble",
  "description": "string — physical description and background",
  "personalityTraits": "string — 1-2 personality traits",
  "ideals": "string — what drives the NPC",
  "bonds": "string — connections and loyalties",
  "flaws": "string — weaknesses and vulnerabilities"
}`,
  },
  randomTable: {
    description: 'a D&D random encounter/event table',
    schema: `{
  "title": "string — table title",
  "dieType": "string — d4/d6/d8/d10/d12/d20/d100",
  "entries": "JSON string of array [{roll: string, result: string}] — one entry per die face"
}`,
  },
  encounterTable: {
    description: 'a D&D encounter table',
    schema: `{
  "environment": "string — e.g. Forest, Dungeon, Urban, Mountain",
  "crRange": "string — e.g. 1-4, 5-10",
  "entries": "JSON string of array [{weight: number, description: string, cr: string}]"
}`,
  },
  classFeature: {
    description: 'a D&D class feature',
    schema: `{
  "name": "string — feature name",
  "level": "number 1-20",
  "className": "string — e.g. Fighter, Wizard, Rogue",
  "description": "string — full feature description with mechanics"
}`,
  },
  raceBlock: {
    description: 'a D&D playable race',
    schema: `{
  "name": "string — race name",
  "abilityScoreIncreases": "string — e.g. +2 Constitution, +1 Wisdom",
  "size": "string — Small/Medium",
  "speed": "string — e.g. 30 ft.",
  "languages": "string — e.g. Common, Elvish",
  "features": "JSON string of array [{name: string, description: string}]"
}`,
  },
  handout: {
    description: 'a D&D player handout (letter, scroll, or poster)',
    schema: `{
  "title": "string — handout title",
  "style": "string — letter/scroll/poster",
  "content": "string — the full handout text, written in-character (e.g. a letter from an NPC, a wanted poster, a prophecy scroll)"
}`,
  },
  backCover: {
    description: 'a back cover blurb for a D&D adventure book',
    schema: `{
  "blurb": "string — exciting 2-4 sentence adventure description that would appear on the back of a published module",
  "authorBio": "string — a short 1-2 sentence author bio"
}`,
  },
  sidebarCallout: {
    description: 'a D&D sidebar callout box (title and type only — body is edited separately)',
    schema: `{
  "title": "string — a short, descriptive callout title (e.g. 'Roleplaying Strahd', 'Variant: Flanking', 'The Weave')",
  "calloutType": "string — info/warning/lore"
}`,
  },
  chapterHeader: {
    description: 'a D&D adventure chapter header',
    schema: `{
  "title": "string — evocative chapter title",
  "subtitle": "string — short subtitle or tagline for the chapter",
  "chapterNumber": "string — chapter number (e.g. '1', '2', 'I', 'II')"
}`,
  },
  titlePage: {
    description: 'a title page for a D&D adventure module',
    schema: `{
  "title": "string — the adventure title",
  "subtitle": "string — subtitle or tagline (e.g. 'A D&D 5e Adventure for Levels 3-7')",
  "author": "string — author name or group"
}`,
  },
  creditsPage: {
    description: 'a credits page for a D&D adventure book',
    schema: `{
  "credits": "string — multi-line credits text (use \\n for line breaks), e.g. 'Written by Name\\nEdited by Name\\nArt by Name'",
  "legalText": "string — copyright and legal disclaimer text",
  "copyrightYear": "string — the copyright year (e.g. '2026')"
}`,
  },
};

export function buildBlockPrompt(blockType: string, userPrompt: string): string {
  const spec = BLOCK_SCHEMAS[blockType];
  if (!spec) {
    throw new Error(`Unsupported block type: ${blockType}`);
  }

  return `Generate ${spec.description} based on the following request:

"${userPrompt}"

Return ONLY a valid JSON object matching this exact schema (no markdown fences, no explanation):
${spec.schema}

IMPORTANT: Fields marked as "JSON string of array" must be a JSON-encoded string, e.g. "[{\\"name\\":\\"Bite\\",\\"description\\":\\"Melee Weapon Attack: +5 to hit...\\"}]"`;
}

export function buildAutoFillPrompt(blockType: string, currentAttrs: Record<string, unknown>): string {
  const spec = BLOCK_SCHEMAS[blockType];
  if (!spec) {
    throw new Error(`Unsupported block type for auto-fill: ${blockType}`);
  }

  const filledFields: string[] = [];
  const emptyFields: string[] = [];

  for (const [key, value] of Object.entries(currentAttrs)) {
    if (key === 'portraitUrl' || key === 'coverImageUrl' || key === 'authorImageUrl' || key === 'backgroundImage' || key === 'imagePrompt') {
      continue;
    }
    let strValue = typeof value === 'string' ? value : JSON.stringify(value);
    // Limit individual field lengths in the prompt
    if (strValue.length > 500) strValue = strValue.slice(0, 500) + '...';
    const DEFAULT_PLACEHOLDER_VALUES = ['Creature Name', 'Spell Name', 'Magic Item', 'NPC Name', 'Race Name', 'Feature Name', 'Random Table', 'Chapter Title', 'Adventure Title', 'A D&D 5e Adventure', 'Author Name', 'Note'];
    if (strValue && strValue !== '' && strValue !== '[]' && strValue !== '0' && !DEFAULT_PLACEHOLDER_VALUES.includes(strValue)) {
      filledFields.push(`${key}: ${strValue}`);
    } else {
      emptyFields.push(key);
    }
  }

  return `I have a partially filled ${spec.description} with these values:
${filledFields.map(f => `- ${f}`).join('\n')}

Please suggest values for these empty/default fields: ${emptyFields.join(', ')}

Return ONLY a JSON object with just the suggested fields (only the empty ones listed above). No markdown fences, no explanation.`;
}

/**
 * Strip trailing commas before closing braces/brackets — a common LLM JSON mistake.
 * Example: `{"a": 1, "b": 2,}` → `{"a": 1, "b": 2}`
 */
function stripTrailingCommas(json: string): string {
  return json.replace(/,\s*([\]}])/g, '$1');
}

/**
 * Extract JSON from a raw AI response string. Tries multiple strategies:
 * 1. Markdown fenced code blocks
 * 2. First { to last } (object extraction)
 * 3. Array unwrapping: [{ ... }] → first element
 */
function extractJson(rawText: string): string | null {
  let jsonStr = rawText.trim();

  // Strategy 1: Extract from markdown fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Strategy 2: If it starts with an array, try to unwrap
  const bracketStart = jsonStr.indexOf('[');
  const braceStart = jsonStr.indexOf('{');
  if (bracketStart !== -1 && (braceStart === -1 || bracketStart < braceStart)) {
    const bracketEnd = jsonStr.lastIndexOf(']');
    if (bracketEnd > bracketStart) {
      const arrayStr = stripTrailingCommas(jsonStr.slice(bracketStart, bracketEnd + 1));
      try {
        const arr = JSON.parse(arrayStr);
        if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object') {
          return JSON.stringify(arr[0]);
        }
      } catch {
        // Fall through to object extraction
      }
    }
  }

  // Strategy 3: Extract first complete JSON object
  if (braceStart !== -1) {
    const braceEnd = jsonStr.lastIndexOf('}');
    if (braceEnd > braceStart) {
      return stripTrailingCommas(jsonStr.slice(braceStart, braceEnd + 1));
    }
  }

  return null;
}

/** Required fields per block type — used to validate AI output has the essential data. */
const REQUIRED_FIELDS: Record<string, string[]> = {
  statBlock: ['name'],
  spellCard: ['name', 'school'],
  magicItem: ['name', 'type'],
  npcProfile: ['name'],
  randomTable: ['title', 'entries'],
  encounterTable: ['environment', 'entries'],
  classFeature: ['name', 'className'],
  raceBlock: ['name'],
  handout: ['title', 'content'],
  backCover: ['blurb'],
  sidebarCallout: ['title'],
  chapterHeader: ['title'],
  titlePage: ['title'],
  creditsPage: ['credits'],
};

export function parseBlockResponse(rawText: string, blockType?: string): Record<string, unknown> | null {
  const jsonStr = extractJson(rawText);
  if (!jsonStr) {
    console.error('[AI] No JSON found in response:', rawText.slice(0, 300));
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err: unknown) {
    console.error('[AI] Failed to parse block response:', jsonStr.slice(0, 300), err);
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.error('[AI] Parsed result is not an object:', typeof parsed);
    return null;
  }

  const result = parsed as Record<string, unknown>;

  // Validate required fields if block type is provided
  if (blockType && REQUIRED_FIELDS[blockType]) {
    const missing = REQUIRED_FIELDS[blockType].filter(
      (f) => !(f in result) || result[f] === undefined || result[f] === ''
    );
    if (missing.length > 0) {
      console.warn(`[AI] Block response missing required fields for ${blockType}: ${missing.join(', ')}`);
      // Don't reject — return what we have and let the client handle defaults
    }
  }

  return result;
}

export function getSupportedBlockTypes(): string[] {
  return Object.keys(BLOCK_SCHEMAS);
}
