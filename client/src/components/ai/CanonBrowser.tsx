import { useEffect, useState } from 'react';
import { useGenerationStore } from '../../stores/generationStore';
import type { CanonEntityType } from '@dnd-booker/shared';

const ENTITY_TYPE_CONFIG: Record<CanonEntityType, { label: string; color: string }> = {
  npc: { label: 'NPCs', color: 'bg-blue-100 text-blue-700' },
  location: { label: 'Locations', color: 'bg-green-100 text-green-700' },
  faction: { label: 'Factions', color: 'bg-purple-100 text-purple-700' },
  item: { label: 'Items', color: 'bg-yellow-100 text-yellow-700' },
  quest: { label: 'Quests', color: 'bg-orange-100 text-orange-700' },
  monster: { label: 'Monsters', color: 'bg-red-100 text-red-700' },
  encounter: { label: 'Encounters', color: 'bg-pink-100 text-pink-700' },
};

const ENTITY_TYPE_ORDER: CanonEntityType[] = [
  'npc',
  'location',
  'faction',
  'item',
  'quest',
  'monster',
  'encounter',
];

interface Props {
  projectId: string;
  runId: string;
}

export function CanonBrowser({ projectId, runId }: Props) {
  const { canonEntities, isLoadingCanon, fetchCanonEntities } = useGenerationStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<CanonEntityType | 'all'>('all');

  useEffect(() => {
    fetchCanonEntities(projectId, runId);
  }, [projectId, runId, fetchCanonEntities]);

  if (isLoadingCanon && canonEntities.length === 0) {
    return <div className="text-sm text-gray-500 p-3">Loading canon...</div>;
  }

  if (canonEntities.length === 0) {
    return <div className="text-sm text-gray-500 p-3">No canon entities yet.</div>;
  }

  // Group by entity type
  const grouped = canonEntities.reduce<Record<string, typeof canonEntities>>((acc, e) => {
    if (!acc[e.entityType]) acc[e.entityType] = [];
    acc[e.entityType].push(e);
    return acc;
  }, {});

  const filteredTypes =
    filterType === 'all'
      ? ENTITY_TYPE_ORDER.filter((t) => grouped[t]?.length)
      : [filterType];

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Campaign Canon</h3>
        <span className="text-xs text-gray-500">{canonEntities.length} entities</span>
      </div>

      {/* Type filter buttons */}
      <div className="flex gap-1 mb-3 flex-wrap">
        <button
          onClick={() => setFilterType('all')}
          className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
            filterType === 'all'
              ? 'border-purple-500 bg-purple-50 text-purple-700'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          All
        </button>
        {ENTITY_TYPE_ORDER.map((t) => {
          const count = grouped[t]?.length ?? 0;
          if (count === 0) return null;
          const config = ENTITY_TYPE_CONFIG[t];
          return (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                filterType === t
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {config.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Entity list grouped by type */}
      {filteredTypes.map((type) => {
        const entities = grouped[type];
        if (!entities?.length) return null;
        const config = ENTITY_TYPE_CONFIG[type];

        return (
          <div key={type} className="mb-3">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
              {config.label}
            </div>
            <div className="space-y-1">
              {entities.map((entity) => {
                const isExpanded = expandedId === entity.id;
                return (
                  <div
                    key={entity.id}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    {/* Entity header (click to expand) */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entity.id)}
                      className="w-full text-left flex items-center justify-between px-2.5 py-2 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-700 truncate">
                          {entity.canonicalName}
                        </div>
                        {entity.aliases.length > 0 && (
                          <div className="text-[10px] text-gray-400 truncate">
                            aka {entity.aliases.join(', ')}
                          </div>
                        )}
                      </div>
                      <svg
                        className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8.25 4.5l7.5 7.5-7.5 7.5"
                        />
                      </svg>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-2.5 pb-2 border-t border-gray-100">
                        <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                          {entity.summary}
                        </p>

                        {entity.canonicalData != null &&
                          typeof entity.canonicalData === 'object' ? (
                            <div className="mt-2 bg-gray-50 rounded p-2">
                              <div className="text-[10px] font-medium text-gray-500 mb-1">
                                Details
                              </div>
                              <pre className="text-[10px] text-gray-600 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
                                {JSON.stringify(entity.canonicalData, null, 2)}
                              </pre>
                            </div>
                          ) : null}

                        <div className="flex gap-2 mt-1.5 text-[10px] text-gray-400">
                          <span className={`px-1.5 py-0.5 rounded ${config.color}`}>
                            {entity.entityType}
                          </span>
                          <span>{entity.slug}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
