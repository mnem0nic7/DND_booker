# Phase 13: Client — Artifact Review + Canon Browser Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Users can inspect generated artifacts, browse canon entities, view evaluation results, and trigger assembly — all from within the client UI alongside the existing GenerationRunPanel.

**Architecture:** Extend `generationStore` with artifact/canon/evaluation/assembly state and fetch actions. Add missing server API routes (artifact detail, canon list, evaluations, assemble). Create three new React components: `ArtifactReviewPanel` (browse/inspect/filter artifacts), `CanonBrowser` (entity roster by type), and `AssemblyReviewPanel` (document manifest, preflight, assemble trigger).

**Tech Stack:** React 19, Zustand 5, Tailwind CSS 4, Express 5, Prisma 6

---

### Task 1: Add Missing Server API Routes

**Files:**
- Modify: `server/src/routes/generation.ts`

**Step 1: Add the new endpoints**

Add after the existing `GET /ai/generation-runs/:runId/artifacts` endpoint (after line 216):

```typescript
// GET /ai/generation-runs/:runId/artifacts/:artifactId — Artifact detail with evaluations
generationRoutes.get(
  '/ai/generation-runs/:runId/artifacts/:artifactId',
  requireAuth,
  validateUuid('projectId', 'runId', 'artifactId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const { runId, artifactId } = req.params;

    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { id: artifactId, runId },
      include: { evaluations: { orderBy: { createdAt: 'desc' } } },
    });

    if (!artifact) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }

    res.json(artifact);
  }),
);

// GET /ai/generation-runs/:runId/canon — Canon entity list
generationRoutes.get(
  '/ai/generation-runs/:runId/canon',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;

    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const entities = await prisma.canonEntity.findMany({
      where: { runId },
      orderBy: [{ entityType: 'asc' }, { canonicalName: 'asc' }],
    });

    res.json(entities);
  }),
);

// GET /ai/generation-runs/:runId/evaluations — All evaluations for this run
generationRoutes.get(
  '/ai/generation-runs/:runId/evaluations',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;

    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const evaluations = await prisma.artifactEvaluation.findMany({
      where: { artifact: { runId } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(evaluations);
  }),
);

// GET /ai/generation-runs/:runId/assembly — Assembly manifest
generationRoutes.get(
  '/ai/generation-runs/:runId/assembly',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;

    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const manifest = await prisma.assemblyManifest.findFirst({
      where: { runId },
      orderBy: { version: 'desc' },
    });

    if (!manifest) {
      res.status(404).json({ error: 'No assembly manifest found' });
      return;
    }

    res.json(manifest);
  }),
);
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/routes/generation.ts
git commit -m "feat: add artifact detail, canon, evaluations, and assembly API routes"
```

---

### Task 2: Extend Generation Store

**Files:**
- Modify: `client/src/stores/generationStore.ts`

**Step 1: Add artifact, canon, evaluation, and assembly state + actions**

Add these imports at the top (alongside existing imports):
```typescript
import type {
  GeneratedArtifact,
  ArtifactCategory,
  ARTIFACT_CATEGORY_MAP,
} from '@dnd-booker/shared';
import type { ArtifactEvaluation } from '@dnd-booker/shared';
import type { CanonEntity } from '@dnd-booker/shared';
import type { AssemblyManifest } from '@dnd-booker/shared';
```

Add to the `GenerationState` interface:
```typescript
  // Artifacts
  artifacts: GeneratedArtifact[];
  selectedArtifactId: string | null;
  artifactDetail: (GeneratedArtifact & { evaluations?: ArtifactEvaluation[] }) | null;
  isLoadingArtifacts: boolean;

  // Canon
  canonEntities: CanonEntity[];
  isLoadingCanon: boolean;

  // Evaluations
  evaluations: ArtifactEvaluation[];
  isLoadingEvaluations: boolean;

  // Assembly
  assemblyManifest: AssemblyManifest | null;
  isLoadingAssembly: boolean;

  // New actions
  fetchArtifacts: (projectId: string, runId: string) => Promise<void>;
  fetchArtifactDetail: (projectId: string, runId: string, artifactId: string) => Promise<void>;
  fetchCanonEntities: (projectId: string, runId: string) => Promise<void>;
  fetchEvaluations: (projectId: string, runId: string) => Promise<void>;
  fetchAssemblyManifest: (projectId: string, runId: string) => Promise<void>;
  selectArtifact: (artifactId: string | null) => void;
```

Add initial state values:
```typescript
  artifacts: [],
  selectedArtifactId: null,
  artifactDetail: null,
  isLoadingArtifacts: false,
  canonEntities: [],
  isLoadingCanon: false,
  evaluations: [],
  isLoadingEvaluations: false,
  assemblyManifest: null,
  isLoadingAssembly: false,
```

Add action implementations:
```typescript
  fetchArtifacts: async (projectId, runId) => {
    set({ isLoadingArtifacts: true });
    try {
      const { data } = await api.get(`/projects/${projectId}/ai/generation-runs/${runId}/artifacts`);
      set({ artifacts: data, isLoadingArtifacts: false });
    } catch {
      set({ isLoadingArtifacts: false });
    }
  },

  fetchArtifactDetail: async (projectId, runId, artifactId) => {
    try {
      const { data } = await api.get(
        `/projects/${projectId}/ai/generation-runs/${runId}/artifacts/${artifactId}`,
      );
      set({ artifactDetail: data, selectedArtifactId: artifactId });
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      set({ error: message || 'Failed to fetch artifact detail' });
    }
  },

  fetchCanonEntities: async (projectId, runId) => {
    set({ isLoadingCanon: true });
    try {
      const { data } = await api.get(`/projects/${projectId}/ai/generation-runs/${runId}/canon`);
      set({ canonEntities: data, isLoadingCanon: false });
    } catch {
      set({ isLoadingCanon: false });
    }
  },

  fetchEvaluations: async (projectId, runId) => {
    set({ isLoadingEvaluations: true });
    try {
      const { data } = await api.get(`/projects/${projectId}/ai/generation-runs/${runId}/evaluations`);
      set({ evaluations: data, isLoadingEvaluations: false });
    } catch {
      set({ isLoadingEvaluations: false });
    }
  },

  fetchAssemblyManifest: async (projectId, runId) => {
    set({ isLoadingAssembly: true });
    try {
      const { data } = await api.get(`/projects/${projectId}/ai/generation-runs/${runId}/assembly`);
      set({ assemblyManifest: data, isLoadingAssembly: false });
    } catch {
      set({ isLoadingAssembly: false, assemblyManifest: null });
    }
  },

  selectArtifact: (artifactId) => {
    set({ selectedArtifactId: artifactId, artifactDetail: null });
  },
```

Update `reset()` to clear new state:
```typescript
  reset: () => {
    get().unsubscribe();
    set({
      currentRun: null,
      isStarting: false,
      error: null,
      progressPercent: 0,
      currentStage: null,
      events: [],
      artifactCount: 0,
      artifacts: [],
      selectedArtifactId: null,
      artifactDetail: null,
      isLoadingArtifacts: false,
      canonEntities: [],
      isLoadingCanon: false,
      evaluations: [],
      isLoadingEvaluations: false,
      assemblyManifest: null,
      isLoadingAssembly: false,
    });
  },
```

**Step 2: Verify client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add client/src/stores/generationStore.ts
git commit -m "feat: extend generation store with artifact, canon, evaluation, and assembly state"
```

---

### Task 3: ArtifactReviewPanel Component

**Files:**
- Create: `client/src/components/ai/ArtifactReviewPanel.tsx`

**Step 1: Create the component**

This panel shows all artifacts for the current run, grouped by category (planning/reference/written). Clicking an artifact shows its detail including content preview and evaluation results.

```tsx
// client/src/components/ai/ArtifactReviewPanel.tsx
import { useEffect, useState } from 'react';
import { useGenerationStore } from '../../stores/generationStore';
import type {
  GeneratedArtifact,
  ArtifactCategory,
  ArtifactStatus,
  ArtifactEvaluation,
  FindingSeverity,
} from '@dnd-booker/shared';
import { ARTIFACT_CATEGORY_MAP } from '@dnd-booker/shared';

const CATEGORY_LABELS: Record<ArtifactCategory, string> = {
  planning: 'Planning',
  reference: 'Reference Assets',
  written: 'Written Content',
  evaluation: 'Evaluations',
  assembly: 'Assembly',
};

const STATUS_STYLES: Record<ArtifactStatus, { label: string; color: string }> = {
  queued: { label: 'Queued', color: 'bg-gray-100 text-gray-600' },
  generating: { label: 'Generating', color: 'bg-blue-100 text-blue-700' },
  generated: { label: 'Generated', color: 'bg-blue-100 text-blue-700' },
  evaluating: { label: 'Evaluating', color: 'bg-yellow-100 text-yellow-700' },
  passed: { label: 'Passed', color: 'bg-green-100 text-green-700' },
  failed_evaluation: { label: 'Failed', color: 'bg-red-100 text-red-700' },
  revising: { label: 'Revising', color: 'bg-yellow-100 text-yellow-700' },
  accepted: { label: 'Accepted', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  assembled: { label: 'Assembled', color: 'bg-purple-100 text-purple-700' },
};

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  major: 'bg-orange-100 text-orange-700 border-orange-200',
  minor: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  informational: 'bg-blue-100 text-blue-700 border-blue-200',
};

interface Props {
  projectId: string;
  runId: string;
}

export function ArtifactReviewPanel({ projectId, runId }: Props) {
  const {
    artifacts, isLoadingArtifacts, fetchArtifacts,
    artifactDetail, selectedArtifactId, fetchArtifactDetail, selectArtifact,
    evaluations, fetchEvaluations,
  } = useGenerationStore();

  const [filterCategory, setFilterCategory] = useState<ArtifactCategory | 'all'>('all');

  useEffect(() => {
    fetchArtifacts(projectId, runId);
    fetchEvaluations(projectId, runId);
  }, [projectId, runId, fetchArtifacts, fetchEvaluations]);

  // Group artifacts by category
  const grouped = artifacts.reduce<Record<string, GeneratedArtifact[]>>((acc, a) => {
    const cat = ARTIFACT_CATEGORY_MAP[a.artifactType as keyof typeof ARTIFACT_CATEGORY_MAP] ?? 'written';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {});

  const filteredGroups = filterCategory === 'all'
    ? grouped
    : { [filterCategory]: grouped[filterCategory] ?? [] };

  // Build evaluation lookup
  const evalByArtifact = new Map<string, ArtifactEvaluation>();
  for (const ev of evaluations) {
    const existing = evalByArtifact.get(ev.artifactId);
    if (!existing || ev.artifactVersion > existing.artifactVersion) {
      evalByArtifact.set(ev.artifactId, ev);
    }
  }

  if (isLoadingArtifacts && artifacts.length === 0) {
    return <div className="text-sm text-gray-500 p-3">Loading artifacts...</div>;
  }

  if (artifacts.length === 0) {
    return <div className="text-sm text-gray-500 p-3">No artifacts generated yet.</div>;
  }

  // Detail view
  if (selectedArtifactId && artifactDetail) {
    const detail = artifactDetail;
    const evaluation = evalByArtifact.get(detail.id);
    const statusStyle = STATUS_STYLES[detail.status] ?? STATUS_STYLES.queued;

    return (
      <div className="p-3">
        {/* Back button */}
        <button
          onClick={() => selectArtifact(null)}
          className="text-xs text-purple-600 hover:text-purple-800 mb-2 flex items-center gap-1 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to list
        </button>

        {/* Title + status */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">{detail.title}</h3>
            <span className="text-xs text-gray-500">{detail.artifactType} v{detail.version}</span>
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusStyle.color}`}>
            {statusStyle.label}
          </span>
        </div>

        {/* Summary */}
        {detail.summary && (
          <p className="text-xs text-gray-600 mb-3">{detail.summary}</p>
        )}

        {/* Evaluation score */}
        {evaluation && (
          <div className="border border-gray-200 rounded-lg p-2 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                evaluation.overallScore >= 85 ? 'bg-green-500' :
                evaluation.overallScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
              }`}>
                {Math.round(evaluation.overallScore)}
              </div>
              <span className="text-xs font-medium text-gray-700">
                {evaluation.passed ? 'Passed' : 'Failed'}
              </span>
            </div>

            {/* Dimension scores */}
            <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500 mb-2">
              {evaluation.structuralCompleteness != null && (
                <span>Structure: {evaluation.structuralCompleteness}</span>
              )}
              {evaluation.continuityScore != null && (
                <span>Continuity: {evaluation.continuityScore}</span>
              )}
              {evaluation.dndSanity != null && (
                <span>D&D Sanity: {evaluation.dndSanity}</span>
              )}
              {evaluation.editorialQuality != null && (
                <span>Editorial: {evaluation.editorialQuality}</span>
              )}
              {evaluation.publicationFit != null && (
                <span>Pub Fit: {evaluation.publicationFit}</span>
              )}
            </div>

            {/* Findings */}
            {evaluation.findings.length > 0 && (
              <div className="space-y-1">
                {evaluation.findings.map((f, i) => (
                  <div key={i} className={`text-xs px-2 py-1 rounded border ${SEVERITY_COLORS[f.severity]}`}>
                    <span className="font-medium">{f.code}:</span> {f.message}
                    {f.suggestedFix && (
                      <div className="text-[10px] mt-0.5 opacity-80">Fix: {f.suggestedFix}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content preview */}
        {detail.markdownContent && (
          <div className="border border-gray-200 rounded-lg p-2">
            <div className="text-[10px] font-medium text-gray-500 mb-1">Content Preview</div>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
              {detail.markdownContent.slice(0, 2000)}
              {detail.markdownContent.length > 2000 && '...'}
            </pre>
          </div>
        )}

        {detail.jsonContent && !detail.markdownContent && (
          <div className="border border-gray-200 rounded-lg p-2">
            <div className="text-[10px] font-medium text-gray-500 mb-1">Structured Data</div>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
              {JSON.stringify(detail.jsonContent, null, 2).slice(0, 2000)}
            </pre>
          </div>
        )}

        {/* Meta */}
        <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
          {detail.pageEstimate && <span>{detail.pageEstimate} pages</span>}
          {detail.tokenCount && <span>{detail.tokenCount.toLocaleString()} tokens</span>}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Artifacts</h3>
        <span className="text-xs text-gray-500">{artifacts.length} total</span>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 mb-3 flex-wrap">
        <button
          onClick={() => setFilterCategory('all')}
          className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
            filterCategory === 'all'
              ? 'border-purple-500 bg-purple-50 text-purple-700'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          All
        </button>
        {(['planning', 'reference', 'written'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
              filterCategory === cat
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {CATEGORY_LABELS[cat]} ({grouped[cat]?.length ?? 0})
          </button>
        ))}
      </div>

      {/* Grouped artifact list */}
      {Object.entries(filteredGroups).map(([cat, items]) => {
        if (!items || items.length === 0) return null;
        return (
          <div key={cat} className="mb-3">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
              {CATEGORY_LABELS[cat as ArtifactCategory] ?? cat}
            </div>
            <div className="space-y-1">
              {items.map((a) => {
                const statusStyle = STATUS_STYLES[a.status] ?? STATUS_STYLES.queued;
                const ev = evalByArtifact.get(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      selectArtifact(a.id);
                      fetchArtifactDetail(projectId, runId, a.id);
                    }}
                    className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-100 transition-colors group"
                  >
                    <div className="min-w-0">
                      <div className="text-xs text-gray-700 truncate group-hover:text-purple-700">
                        {a.title}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {a.artifactType} v{a.version}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {ev && (
                        <span className={`text-[10px] font-medium ${
                          ev.overallScore >= 85 ? 'text-green-600' :
                          ev.overallScore >= 70 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {Math.round(ev.overallScore)}
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusStyle.color}`}>
                        {statusStyle.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Verify client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add client/src/components/ai/ArtifactReviewPanel.tsx
git commit -m "feat: add ArtifactReviewPanel with category filtering and evaluation display"
```

---

### Task 4: CanonBrowser Component

**Files:**
- Create: `client/src/components/ai/CanonBrowser.tsx`

**Step 1: Create the component**

Browse canon entities grouped by type (NPC, Location, Faction, etc.) with expandable detail panels showing the entity's summary and canonical data.

```tsx
// client/src/components/ai/CanonBrowser.tsx
import { useEffect, useState } from 'react';
import { useGenerationStore } from '../../stores/generationStore';
import type { CanonEntityType } from '@dnd-booker/shared';

const ENTITY_TYPE_CONFIG: Record<CanonEntityType, { label: string; icon: string; color: string }> = {
  npc: { label: 'NPCs', icon: '👤', color: 'bg-blue-100 text-blue-700' },
  location: { label: 'Locations', icon: '📍', color: 'bg-green-100 text-green-700' },
  faction: { label: 'Factions', icon: '⚔️', color: 'bg-purple-100 text-purple-700' },
  item: { label: 'Items', icon: '💎', color: 'bg-yellow-100 text-yellow-700' },
  quest: { label: 'Quests', icon: '📜', color: 'bg-orange-100 text-orange-700' },
  monster: { label: 'Monsters', icon: '🐉', color: 'bg-red-100 text-red-700' },
  encounter: { label: 'Encounters', icon: '⚡', color: 'bg-pink-100 text-pink-700' },
};

const ENTITY_TYPE_ORDER: CanonEntityType[] = [
  'npc', 'location', 'faction', 'item', 'quest', 'monster', 'encounter',
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

  // Group by type
  const grouped = canonEntities.reduce<Record<string, typeof canonEntities>>((acc, e) => {
    if (!acc[e.entityType]) acc[e.entityType] = [];
    acc[e.entityType].push(e);
    return acc;
  }, {});

  const filteredTypes = filterType === 'all'
    ? ENTITY_TYPE_ORDER.filter((t) => grouped[t]?.length)
    : [filterType];

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Campaign Canon</h3>
        <span className="text-xs text-gray-500">{canonEntities.length} entities</span>
      </div>

      {/* Type filter */}
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
              {config.icon} {config.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Entity list by type */}
      {filteredTypes.map((type) => {
        const entities = grouped[type];
        if (!entities?.length) return null;
        const config = ENTITY_TYPE_CONFIG[type];

        return (
          <div key={type} className="mb-3">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
              {config.icon} {config.label}
            </div>
            <div className="space-y-1">
              {entities.map((entity) => {
                const isExpanded = expandedId === entity.id;
                return (
                  <div key={entity.id} className="border border-gray-200 rounded-lg overflow-hidden">
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
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className="px-2.5 pb-2 border-t border-gray-100">
                        <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{entity.summary}</p>

                        {entity.canonicalData && typeof entity.canonicalData === 'object' && (
                          <div className="mt-2 bg-gray-50 rounded p-2">
                            <div className="text-[10px] font-medium text-gray-500 mb-1">Details</div>
                            <pre className="text-[10px] text-gray-600 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
                              {JSON.stringify(entity.canonicalData, null, 2)}
                            </pre>
                          </div>
                        )}

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
```

**Step 2: Verify client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add client/src/components/ai/CanonBrowser.tsx
git commit -m "feat: add CanonBrowser component for entity browsing by type"
```

---

### Task 5: AssemblyReviewPanel Component

**Files:**
- Create: `client/src/components/ai/AssemblyReviewPanel.tsx`

**Step 1: Create the component**

Shows the assembly manifest's document list with their artifact mappings, page estimates, and kind labels.

```tsx
// client/src/components/ai/AssemblyReviewPanel.tsx
import { useEffect } from 'react';
import { useGenerationStore } from '../../stores/generationStore';
import type { AssemblyDocumentSpec } from '@dnd-booker/shared';

const KIND_STYLES: Record<string, { label: string; color: string }> = {
  front_matter: { label: 'Front Matter', color: 'bg-blue-100 text-blue-700' },
  chapter: { label: 'Chapter', color: 'bg-purple-100 text-purple-700' },
  appendix: { label: 'Appendix', color: 'bg-green-100 text-green-700' },
  back_matter: { label: 'Back Matter', color: 'bg-gray-100 text-gray-600' },
};

interface Props {
  projectId: string;
  runId: string;
}

export function AssemblyReviewPanel({ projectId, runId }: Props) {
  const { assemblyManifest, isLoadingAssembly, fetchAssemblyManifest } = useGenerationStore();

  useEffect(() => {
    fetchAssemblyManifest(projectId, runId);
  }, [projectId, runId, fetchAssemblyManifest]);

  if (isLoadingAssembly) {
    return <div className="text-sm text-gray-500 p-3">Loading assembly manifest...</div>;
  }

  if (!assemblyManifest) {
    return <div className="text-sm text-gray-500 p-3">No assembly manifest yet. Assembly happens after all artifacts are accepted.</div>;
  }

  const docs = assemblyManifest.documents as AssemblyDocumentSpec[];
  const totalPages = docs.reduce((sum, d) => sum + (d.targetPageCount ?? 0), 0);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Assembly Manifest</h3>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>v{assemblyManifest.version}</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
            assemblyManifest.status === 'assembled'
              ? 'bg-green-100 text-green-700'
              : assemblyManifest.status === 'accepted'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {assemblyManifest.status}
          </span>
        </div>
      </div>

      {/* Page budget summary */}
      {totalPages > 0 && (
        <div className="text-xs text-gray-500 mb-3">
          {docs.length} documents, ~{totalPages} pages estimated
        </div>
      )}

      {/* Document list */}
      <div className="space-y-1.5">
        {docs.sort((a, b) => a.sortOrder - b.sortOrder).map((doc) => {
          const kindStyle = KIND_STYLES[doc.kind] ?? KIND_STYLES.chapter;
          return (
            <div
              key={doc.documentSlug}
              className="flex items-center justify-between px-2.5 py-2 border border-gray-200 rounded-lg"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${kindStyle.color}`}>
                    {kindStyle.label}
                  </span>
                  <span className="text-xs font-medium text-gray-700 truncate">{doc.title}</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {doc.artifactKeys.length} artifact{doc.artifactKeys.length !== 1 ? 's' : ''}
                  {doc.targetPageCount ? ` · ~${doc.targetPageCount}pp` : ''}
                </div>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0 ml-2">#{doc.sortOrder}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Verify client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add client/src/components/ai/AssemblyReviewPanel.tsx
git commit -m "feat: add AssemblyReviewPanel with document manifest display"
```

---

### Task 6: Integration Verification

**Files:**
- No new files

**Step 1: Run client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 2: Run server type check (regression)**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Run server tests (regression)**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/ 2>&1 | tail -20`
Expected: All tests PASS (except pre-existing pubsub timeout)
