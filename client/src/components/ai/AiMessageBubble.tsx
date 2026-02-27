import { useMemo } from 'react';

interface AiMessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  onInsertBlock: (blockType: string, attrs: Record<string, unknown>) => void;
}

// Detect JSON code blocks in assistant messages that look like D&D content blocks
const BLOCK_TYPE_PATTERNS: Record<string, { label: string; requiredFields: string[] }> = {
  statBlock: { label: 'Stat Block', requiredFields: ['name', 'ac', 'hp'] },
  spellCard: { label: 'Spell', requiredFields: ['name', 'school', 'castingTime'] },
  magicItem: { label: 'Magic Item', requiredFields: ['name', 'rarity'] },
  npcProfile: { label: 'NPC', requiredFields: ['name', 'race'] },
  randomTable: { label: 'Random Table', requiredFields: ['title', 'dieType', 'entries'] },
  encounterTable: { label: 'Encounter Table', requiredFields: ['environment', 'entries'] },
  classFeature: { label: 'Class Feature', requiredFields: ['name', 'className'] },
  raceBlock: { label: 'Race', requiredFields: ['name', 'features'] },
  handout: { label: 'Handout', requiredFields: ['title', 'content'] },
  backCover: { label: 'Back Cover', requiredFields: ['blurb', 'authorBio'] },
};

function detectBlockType(obj: Record<string, unknown>): string | null {
  for (const [type, { requiredFields }] of Object.entries(BLOCK_TYPE_PATTERNS)) {
    if (requiredFields.every((f) => f in obj)) {
      return type;
    }
  }
  return null;
}

interface DetectedBlock {
  type: string;
  label: string;
  attrs: Record<string, unknown>;
}

function extractBlocks(content: string): { text: string; blocks: DetectedBlock[] } {
  const blocks: DetectedBlock[] = [];
  const text = content.replace(/```(?:json)?\s*([\s\S]*?)```/g, (match, jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr.trim());
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const blockType = detectBlockType(parsed);
        if (blockType) {
          const label = BLOCK_TYPE_PATTERNS[blockType].label;
          blocks.push({ type: blockType, label, attrs: parsed });
          return `[${label}: ${parsed.name || parsed.title || 'Generated'}]`;
        }
      }
    } catch {
      // Not valid JSON, leave as-is
    }
    return match;
  });
  return { text, blocks };
}

export function AiMessageBubble({ role, content, isStreaming, onInsertBlock }: AiMessageBubbleProps) {
  const { text, blocks } = useMemo(
    () => (role === 'assistant' ? extractBlocks(content) : { text: content, blocks: [] }),
    [content, role],
  );

  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-purple-600 text-white'
            : 'bg-white border border-gray-200 text-gray-800'
        }`}
      >
        {/* Message text */}
        <div className="whitespace-pre-wrap break-words">{text}</div>

        {/* Streaming cursor */}
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-0.5" />
        )}

        {/* Detected block cards */}
        {blocks.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {blocks.map((block, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded px-2.5 py-1.5"
              >
                <span className="text-xs font-medium text-purple-800">
                  {block.label}: {(block.attrs.name || block.attrs.title || 'Generated') as string}
                </span>
                <button
                  onClick={() => onInsertBlock(block.type, block.attrs)}
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium ml-2"
                >
                  Insert
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
