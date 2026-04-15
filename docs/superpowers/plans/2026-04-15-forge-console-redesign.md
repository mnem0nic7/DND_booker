# Forge Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose `DashboardPage.tsx` (663 lines) into a clean split-layout console: `ForgeShell` coordinator, `ChatPanel` (left column), and `AgentBoard` (right column), with agent-switching chat and a sticky gate banner for run interrupts.

**Architecture:** `ForgeShell` owns the 5-second polling loop, `selectedAgentId` state, and all API calls. It passes data down to `ChatPanel` (messages + gate) and `AgentBoard` (agent list). Clicking a card on the board or picking from the `AgentSwitcher` dropdown both call `setSelectedAgentId`. A `GateBanner` appears above the `Composer` when `activeRun.graphStateJson` has a pending interrupt, dimming the composer until resolved. Existing `AgentCard`, `MessageList`, and `Composer` components are reused unchanged.

**Tech Stack:** React 19, TypeScript strict, Zustand 5, Vitest + @testing-library/react + MSW, Tailwind-free (uses `forge-console.css`)

---

## File Map

**Create:**
- `client/src/components/console/GateBanner.tsx`
- `client/src/components/console/GateBanner.test.tsx`
- `client/src/components/console/AgentSwitcher.tsx`
- `client/src/components/console/AgentSwitcher.test.tsx`
- `client/src/components/console/AgentBoard.tsx`
- `client/src/components/console/AgentBoard.test.tsx`
- `client/src/components/console/ChatPanel.tsx`
- `client/src/components/console/ChatPanel.test.tsx`
- `client/src/components/console/ForgeShell.tsx`
- `client/src/components/console/ForgeShell.test.tsx`

**Modify:**
- `client/src/pages/DashboardPage.tsx` — strip to thin project-selector wrapper (~100 lines)
- `client/src/styles/forge-console.css` — add split layout + gate banner + switcher styles
- `client/src/test/msw/handlers.ts` — add console/interview/run API handlers

**Leave unchanged:** `AgentCard.tsx`, `MessageList.tsx`, `Composer.tsx`, `forgeConsole.ts`, `graphInterrupts.ts`

---

## Task 1: GateBanner component

**Files:**
- Create: `client/src/components/console/GateBanner.tsx`
- Create: `client/src/components/console/GateBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/console/GateBanner.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GateBanner } from './GateBanner';
import type { GraphInterrupt } from '@dnd-booker/shared';

function buildGate(overrides?: Partial<GraphInterrupt>): GraphInterrupt {
  return {
    id: 'gate-1',
    runType: 'generation',
    runId: 'run-1',
    kind: 'publication_review',
    title: 'Outline approval gate',
    summary: '6 chapters ready · Critic score 87/100',
    status: 'pending',
    payload: null,
    resolutionPayload: null,
    resolvedByUserId: null,
    createdAt: '2026-04-15T00:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

describe('GateBanner', () => {
  it('renders gate title and summary', () => {
    render(<GateBanner gate={buildGate()} onApprove={() => {}} onRequestChanges={() => {}} />);
    expect(screen.getByText('Outline approval gate')).toBeInTheDocument();
    expect(screen.getByText('6 chapters ready · Critic score 87/100')).toBeInTheDocument();
  });

  it('calls onApprove when Approve button is clicked', async () => {
    const onApprove = vi.fn();
    render(<GateBanner gate={buildGate()} onApprove={onApprove} onRequestChanges={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('calls onRequestChanges when Request changes button is clicked', async () => {
    const onRequestChanges = vi.fn();
    render(<GateBanner gate={buildGate()} onApprove={() => {}} onRequestChanges={onRequestChanges} />);
    await userEvent.click(screen.getByRole('button', { name: /request changes/i }));
    expect(onRequestChanges).toHaveBeenCalledOnce();
  });

  it('omits the summary line when summary is null', () => {
    render(<GateBanner gate={buildGate({ summary: null })} onApprove={() => {}} onRequestChanges={() => {}} />);
    expect(screen.getByText('Outline approval gate')).toBeInTheDocument();
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd client && npx vitest run src/components/console/GateBanner.test.tsx
```

Expected: FAIL — `GateBanner` not found.

- [ ] **Step 3: Implement GateBanner**

```tsx
// client/src/components/console/GateBanner.tsx
import type { GraphInterrupt } from '@dnd-booker/shared';

interface GateBannerProps {
  gate: GraphInterrupt;
  onApprove: () => void;
  onRequestChanges: () => void;
}

export function GateBanner({ gate, onApprove, onRequestChanges }: GateBannerProps) {
  return (
    <div className="forge-gate-banner">
      <span className="forge-gate-banner__icon" aria-hidden="true">⚑</span>
      <div className="forge-gate-banner__text">
        <div className="forge-gate-banner__title">{gate.title}</div>
        {gate.summary && (
          <p className="forge-gate-banner__summary">{gate.summary}</p>
        )}
      </div>
      <button className="forge-gate-banner__approve" onClick={onApprove}>
        Approve →
      </button>
      <button className="forge-gate-banner__changes" onClick={onRequestChanges}>
        Request changes
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd client && npx vitest run src/components/console/GateBanner.test.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/console/GateBanner.tsx client/src/components/console/GateBanner.test.tsx
git commit -m "feat(console): add GateBanner component"
```

---

## Task 2: AgentSwitcher component

**Files:**
- Create: `client/src/components/console/AgentSwitcher.tsx`
- Create: `client/src/components/console/AgentSwitcher.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/console/AgentSwitcher.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentSwitcher } from './AgentSwitcher';
import type { ConsoleAgent } from '@dnd-booker/shared';

function buildAgent(id: string, name: string, status: ConsoleAgent['status'] = 'idle'): ConsoleAgent {
  return { id, name, role: 'specialist', iconKey: id, status, currentTask: null, progress: 0, queue: [], lastPing: '2026-04-15T00:00:00.000Z' };
}

const agents = [
  buildAgent('interviewer', 'Interviewer', 'working'),
  buildAgent('writer', 'Writer', 'working'),
  buildAgent('critic', 'Critic', 'idle'),
];

describe('AgentSwitcher', () => {
  it('shows the selected agent name in the trigger', () => {
    render(<AgentSwitcher agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} />);
    expect(screen.getByRole('button', { name: /writer/i })).toBeInTheDocument();
  });

  it('opens the dropdown and shows all agent names on trigger click', async () => {
    render(<AgentSwitcher agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /writer/i }));
    expect(screen.getByRole('option', { name: /interviewer/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /critic/i })).toBeInTheDocument();
  });

  it('calls onSelectAgent with the agent id when an option is clicked', async () => {
    const onSelectAgent = vi.fn();
    render(<AgentSwitcher agents={agents} selectedAgentId="writer" onSelectAgent={onSelectAgent} />);
    await userEvent.click(screen.getByRole('button', { name: /writer/i }));
    await userEvent.click(screen.getByRole('option', { name: /interviewer/i }));
    expect(onSelectAgent).toHaveBeenCalledWith('interviewer');
  });

  it('closes the dropdown after selection', async () => {
    render(<AgentSwitcher agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /writer/i }));
    await userEvent.click(screen.getByRole('option', { name: /critic/i }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd client && npx vitest run src/components/console/AgentSwitcher.test.tsx
```

Expected: FAIL — `AgentSwitcher` not found.

- [ ] **Step 3: Implement AgentSwitcher**

```tsx
// client/src/components/console/AgentSwitcher.tsx
import { useEffect, useRef, useState } from 'react';
import type { ConsoleAgent } from '@dnd-booker/shared';

interface AgentSwitcherProps {
  agents: ConsoleAgent[];
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
}

export function AgentSwitcher({ agents, selectedAgentId, onSelectAgent }: AgentSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = agents.find(a => a.id === selectedAgentId) ?? agents[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="forge-agent-switcher" ref={containerRef}>
      <button
        className="forge-agent-switcher__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span
          className={`forge-agent-switcher__dot forge-agent-switcher__dot--${selected?.status ?? 'idle'}`}
          aria-hidden="true"
        />
        {selected?.name ?? 'Select agent'}
        <span className="forge-agent-switcher__caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul className="forge-agent-switcher__dropdown" role="listbox" aria-label="Select agent">
          {agents.map(agent => (
            <li
              key={agent.id}
              role="option"
              aria-selected={agent.id === selectedAgentId}
              className={`forge-agent-switcher__option${agent.id === selectedAgentId ? ' forge-agent-switcher__option--selected' : ''}`}
              onClick={() => {
                onSelectAgent(agent.id);
                setOpen(false);
              }}
            >
              <span
                className={`forge-agent-switcher__dot forge-agent-switcher__dot--${agent.status}`}
                aria-hidden="true"
              />
              {agent.name}
              <span className="forge-agent-switcher__role">{agent.role}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd client && npx vitest run src/components/console/AgentSwitcher.test.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/console/AgentSwitcher.tsx client/src/components/console/AgentSwitcher.test.tsx
git commit -m "feat(console): add AgentSwitcher dropdown component"
```

---

## Task 3: AgentBoard component

**Files:**
- Create: `client/src/components/console/AgentBoard.tsx`
- Create: `client/src/components/console/AgentBoard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/console/AgentBoard.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentBoard } from './AgentBoard';
import type { ConsoleAgent } from '@dnd-booker/shared';

function buildAgent(id: string, name: string, status: ConsoleAgent['status'] = 'idle'): ConsoleAgent {
  return { id, name, role: 'specialist', iconKey: id, status, currentTask: 'doing work', progress: 40, queue: [], lastPing: '2026-04-15T00:00:00.000Z' };
}

const agents = [
  buildAgent('interviewer', 'Interviewer'),
  buildAgent('writer', 'Writer', 'working'),
  buildAgent('critic', 'Critic'),
];

describe('AgentBoard', () => {
  it('renders all agent names', () => {
    render(<AgentBoard agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} runStatus={null} />);
    expect(screen.getByText('Interviewer')).toBeInTheDocument();
    expect(screen.getByText('Writer')).toBeInTheDocument();
    expect(screen.getByText('Critic')).toBeInTheDocument();
  });

  it('calls onSelectAgent with the clicked agent id', async () => {
    const onSelectAgent = vi.fn();
    render(<AgentBoard agents={agents} selectedAgentId="interviewer" onSelectAgent={onSelectAgent} runStatus={null} />);
    await userEvent.click(screen.getByText('Critic'));
    expect(onSelectAgent).toHaveBeenCalledWith('critic');
  });

  it('renders the run status in the board header', () => {
    render(<AgentBoard agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} runStatus="running" />);
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('renders nothing in the header status when runStatus is null', () => {
    render(<AgentBoard agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} runStatus={null} />);
    expect(screen.queryByText('running')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd client && npx vitest run src/components/console/AgentBoard.test.tsx
```

Expected: FAIL — `AgentBoard` not found.

- [ ] **Step 3: Implement AgentBoard**

```tsx
// client/src/components/console/AgentBoard.tsx
import type { ConsoleAgent } from '@dnd-booker/shared';
import { AgentCard } from './AgentCard';

interface AgentBoardProps {
  agents: ConsoleAgent[];
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
  runStatus: string | null;
}

export function AgentBoard({ agents, selectedAgentId, onSelectAgent, runStatus }: AgentBoardProps) {
  return (
    <aside className="forge-board">
      <div className="forge-board__header">
        <span className="forge-board__label">AGENTS</span>
        {runStatus && (
          <span className={`forge-board__run-status forge-board__run-status--${runStatus}`}>
            {runStatus}
          </span>
        )}
      </div>
      <div className="forge-board__cards">
        {agents.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            selected={agent.id === selectedAgentId}
            onSelect={() => onSelectAgent(agent.id)}
          />
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd client && npx vitest run src/components/console/AgentBoard.test.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/console/AgentBoard.tsx client/src/components/console/AgentBoard.test.tsx
git commit -m "feat(console): add AgentBoard component"
```

---

## Task 4: ChatPanel component

**Files:**
- Create: `client/src/components/console/ChatPanel.tsx`
- Create: `client/src/components/console/ChatPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/console/ChatPanel.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from './ChatPanel';
import type { ConsoleAgent, GraphInterrupt } from '@dnd-booker/shared';
import type { ConsoleMessage } from '../../lib/forgeConsole';

function buildAgent(id: string, name: string): ConsoleAgent {
  return { id, name, role: 'specialist', iconKey: id, status: 'idle', currentTask: null, progress: 0, queue: [], lastPing: '2026-04-15T00:00:00.000Z' };
}

function buildGate(): GraphInterrupt {
  return { id: 'g1', runType: 'generation', runId: 'r1', kind: 'review', title: 'Review gate', summary: '6 chapters', status: 'pending', payload: null, resolutionPayload: null, resolvedByUserId: null, createdAt: '2026-04-15T00:00:00.000Z', resolvedAt: null };
}

const agents = [buildAgent('interviewer', 'Interviewer'), buildAgent('writer', 'Writer')];
const messages: ConsoleMessage[] = [];

function renderPanel(overrides: Partial<Parameters<typeof ChatPanel>[0]> = {}) {
  return render(
    <ChatPanel
      agents={agents}
      selectedAgentId="interviewer"
      messages={messages}
      pendingGate={null}
      draft=""
      sending={false}
      onSelectAgent={() => {}}
      onDraftChange={() => {}}
      onSend={() => {}}
      onApproveGate={() => {}}
      onRequestChanges={() => {}}
      {...overrides}
    />,
  );
}

describe('ChatPanel', () => {
  it('enables the composer when no gate is pending', () => {
    renderPanel();
    expect(screen.getByRole('textbox')).not.toBeDisabled();
  });

  it('disables the composer when a gate is pending', () => {
    renderPanel({ pendingGate: buildGate() });
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('shows the gate banner when a gate is pending', () => {
    renderPanel({ pendingGate: buildGate() });
    expect(screen.getByText('Review gate')).toBeInTheDocument();
  });

  it('hides the gate banner when no gate is pending', () => {
    renderPanel();
    expect(screen.queryByText('Review gate')).not.toBeInTheDocument();
  });

  it('calls onApproveGate when the Approve button in the banner is clicked', async () => {
    const onApproveGate = vi.fn();
    renderPanel({ pendingGate: buildGate(), onApproveGate });
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onApproveGate).toHaveBeenCalledOnce();
  });

  it('calls onSend when the send button is clicked with a non-empty draft', async () => {
    const onSend = vi.fn();
    renderPanel({ draft: 'hello', onSend });
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSend).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd client && npx vitest run src/components/console/ChatPanel.test.tsx
```

Expected: FAIL — `ChatPanel` not found.

- [ ] **Step 3: Implement ChatPanel**

```tsx
// client/src/components/console/ChatPanel.tsx
import type { ConsoleAgent, GraphInterrupt } from '@dnd-booker/shared';
import type { ConsoleMessage } from '../../lib/forgeConsole';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { AgentSwitcher } from './AgentSwitcher';
import { GateBanner } from './GateBanner';

interface ChatPanelProps {
  agents: ConsoleAgent[];
  selectedAgentId: string;
  messages: ConsoleMessage[];
  pendingGate: GraphInterrupt | null;
  draft: string;
  sending: boolean;
  onSelectAgent: (id: string) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onApproveGate: () => void;
  onRequestChanges: () => void;
}

export function ChatPanel({
  agents,
  selectedAgentId,
  messages,
  pendingGate,
  draft,
  sending,
  onSelectAgent,
  onDraftChange,
  onSend,
  onApproveGate,
  onRequestChanges,
}: ChatPanelProps) {
  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const thinkingLabel = sending ? `${selectedAgent?.name ?? 'Agent'} is thinking...` : null;

  return (
    <div className="forge-chat-panel">
      <div className="forge-chat-panel__header">
        <AgentSwitcher
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
        />
        <span className="forge-chat-panel__hint">click any agent card to switch</span>
      </div>

      <MessageList messages={messages} thinkingLabel={thinkingLabel} />

      {pendingGate && (
        <GateBanner
          gate={pendingGate}
          onApprove={onApproveGate}
          onRequestChanges={onRequestChanges}
        />
      )}

      <Composer
        value={draft}
        placeholder={
          pendingGate
            ? 'Approve the gate above to continue...'
            : `Message ${selectedAgent?.name ?? 'agent'}...`
        }
        sending={sending}
        disabled={!!pendingGate}
        onChange={onDraftChange}
        onSend={onSend}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd client && npx vitest run src/components/console/ChatPanel.test.tsx
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/console/ChatPanel.tsx client/src/components/console/ChatPanel.test.tsx
git commit -m "feat(console): add ChatPanel component"
```

---

## Task 5: ForgeShell component

**Files:**
- Create: `client/src/components/console/ForgeShell.tsx`
- Create: `client/src/components/console/ForgeShell.test.tsx`
- Modify: `client/src/test/msw/handlers.ts`

- [ ] **Step 1: Add MSW handlers for console/interview/run APIs**

Replace the contents of `client/src/test/msw/handlers.ts`:

```typescript
// client/src/test/msw/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/v1/projects/:projectId/export-jobs', () => HttpResponse.json([])),

  // Console
  http.get('/api/v1/projects/:projectId/console/agents', () => HttpResponse.json([])),
  http.post('/api/v1/projects/:projectId/console/chat', () =>
    HttpResponse.json({ replies: [] }),
  ),

  // Interviews
  http.get('/api/v1/projects/:projectId/interview/sessions/latest', () =>
    HttpResponse.json(null),
  ),
  http.post('/api/v1/projects/:projectId/interview/sessions', () =>
    HttpResponse.json({
      id: 'sess-default',
      projectId: 'proj-1',
      status: 'open',
      turns: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lockedAt: null,
      interviewBriefArtifactId: null,
    }),
  ),
  http.post('/api/v1/projects/:projectId/interview/sessions/:sessionId/messages', () =>
    HttpResponse.json({
      id: 'sess-default',
      projectId: 'proj-1',
      status: 'open',
      turns: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lockedAt: null,
      interviewBriefArtifactId: null,
    }),
  ),
  http.post('/api/v1/projects/:projectId/interview/sessions/:sessionId/lock', () =>
    HttpResponse.json({
      id: 'sess-default',
      projectId: 'proj-1',
      status: 'locked',
      turns: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lockedAt: new Date().toISOString(),
      interviewBriefArtifactId: null,
    }),
  ),

  // Generation runs
  http.get('/api/v1/projects/:projectId/generation-runs', () => HttpResponse.json([])),
];
```

- [ ] **Step 2: Write the failing test**

```tsx
// client/src/components/console/ForgeShell.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw/server';
import { renderWithProviders } from '../../test/render';
import { ForgeShell } from './ForgeShell';
import type { ConsoleAgent, InterviewSession } from '@dnd-booker/shared';

function buildAgent(id: string, name: string): ConsoleAgent {
  return { id, name, role: 'specialist', iconKey: id, status: 'working', currentTask: 'working', progress: 50, queue: [], lastPing: new Date().toISOString() };
}

function buildSession(turns: Array<{ role: string; content: string }> = []): InterviewSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    status: 'open',
    turns: turns.map(t => ({ ...t, createdAt: new Date().toISOString() })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: null,
    interviewBriefArtifactId: null,
  } as InterviewSession;
}

describe('ForgeShell', () => {
  it('renders agent names fetched from the API', async () => {
    server.use(
      http.get('/api/v1/projects/:projectId/console/agents', () =>
        HttpResponse.json([buildAgent('writer', 'Writer'), buildAgent('critic', 'Critic')]),
      ),
    );
    renderWithProviders(<ForgeShell projectId="proj-1" />);
    await waitFor(() => expect(screen.getByText('Writer')).toBeInTheDocument());
    expect(screen.getByText('Critic')).toBeInTheDocument();
  });

  it('shows the interviewer greeting message from the interview session', async () => {
    server.use(
      http.get('/api/v1/projects/:projectId/interview/sessions/latest', () =>
        HttpResponse.json(buildSession([{ role: 'assistant', content: 'What are you building today?' }])),
      ),
    );
    renderWithProviders(<ForgeShell projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByText('What are you building today?')).toBeInTheDocument(),
    );
  });

  it('sends a message to the interview API when interviewer is selected', async () => {
    let capturedBody: unknown;
    server.use(
      http.get('/api/v1/projects/:projectId/interview/sessions/latest', () =>
        HttpResponse.json(buildSession()),
      ),
      http.post('/api/v1/projects/:projectId/interview/sessions/:sessionId/messages', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(buildSession());
      }),
    );
    renderWithProviders(<ForgeShell projectId="proj-1" />);
    await waitFor(() => screen.getByRole('textbox'));

    await userEvent.type(screen.getByRole('textbox'), 'A gothic horror campaign');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({ content: 'A gothic horror campaign' }),
    );
  });

  it('sends a message to the console chat API when a non-interviewer agent is selected', async () => {
    let capturedBody: unknown;
    server.use(
      http.get('/api/v1/projects/:projectId/console/agents', () =>
        HttpResponse.json([buildAgent('writer', 'Writer')]),
      ),
      http.post('/api/v1/projects/:projectId/console/chat', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ replies: [{ fromAgentId: 'writer', fromLabel: 'Writer', reply: 'Got it.', responseMode: 'model' }] });
      }),
    );
    renderWithProviders(<ForgeShell projectId="proj-1" />);
    await waitFor(() => screen.getByText('Writer'));

    await userEvent.click(screen.getByText('Writer'));
    await userEvent.type(screen.getByRole('textbox'), 'Add more traps');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({ agentId: 'writer', message: 'Add more traps' }),
    );
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd client && npx vitest run src/components/console/ForgeShell.test.tsx
```

Expected: FAIL — `ForgeShell` not found.

- [ ] **Step 4: Implement ForgeShell**

```tsx
// client/src/components/console/ForgeShell.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConsoleAgent, GenerationRun, GraphInterrupt, InterviewSession } from '@dnd-booker/shared';
import { v1Client } from '../../lib/api';
import {
  buildConsoleAgentMessage,
  buildConsoleUserMessage,
  buildInterviewThreadMessages,
  type ConsoleMessage,
} from '../../lib/forgeConsole';
import { readPendingGraphInterrupts } from '../../lib/graphInterrupts';
import { useGenerationStore } from '../../stores/generationStore';
import { ChatPanel } from './ChatPanel';
import { AgentBoard } from './AgentBoard';

const INTERVIEWER_ID = 'interviewer';

interface ForgeShellProps {
  projectId: string;
}

export function ForgeShell({ projectId }: ForgeShellProps) {
  const [selectedAgentId, setSelectedAgentId] = useState(INTERVIEWER_ID);
  const [agents, setAgents] = useState<ConsoleAgent[]>([]);
  const [interview, setInterview] = useState<InterviewSession | null>(null);
  const [activeRun, setActiveRun] = useState<GenerationRun | null>(null);
  const [messagesByAgent, setMessagesByAgent] = useState<Record<string, ConsoleMessage[]>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const { resolveInterrupt } = useGenerationStore();

  const loadProjectState = useCallback(async () => {
    try {
      const [agentList, session, runs] = await Promise.all([
        v1Client.console.listConsoleAgents({ projectId }),
        v1Client.interviews.getLatestInterviewSession({ projectId }),
        v1Client.generationRuns.listGenerationRuns({ projectId }),
      ]);
      setAgents(agentList);
      setInterview(session);
      setActiveRun(
        runs.find(r => r.status !== 'complete' && r.status !== 'cancelled') ?? null,
      );
    } catch {
      // polling failures are silent — board stays at last known state
    }
  }, [projectId]);

  useEffect(() => {
    loadProjectState();
    const timer = setInterval(loadProjectState, 5_000);
    return () => clearInterval(timer);
  }, [loadProjectState]);

  // Synthetic interviewer entry at position 0, then real agents
  const allAgents = useMemo<ConsoleAgent[]>(() => [
    {
      id: INTERVIEWER_ID,
      name: 'Interviewer',
      role: 'intake',
      iconKey: 'interviewer',
      status: interview?.status === 'locked' ? 'idle' : 'working',
      currentTask: interview?.status === 'locked' ? 'Brief locked' : 'Ready for intake',
      progress: interview?.status === 'locked' ? 100 : 0,
      queue: [],
      lastPing: new Date().toISOString(),
    },
    ...agents,
  ], [interview, agents]);

  const visibleMessages = useMemo<ConsoleMessage[]>(() => {
    if (selectedAgentId === INTERVIEWER_ID) {
      return buildInterviewThreadMessages(interview);
    }
    return messagesByAgent[selectedAgentId] ?? [];
  }, [selectedAgentId, interview, messagesByAgent]);

  const pendingGate = useMemo<GraphInterrupt | null>(() => {
    if (!activeRun) return null;
    const pending = readPendingGraphInterrupts(
      activeRun.graphStateJson,
      'generation',
      activeRun.id,
    );
    return pending[0] ?? null;
  }, [activeRun]);

  const ensureInterviewSession = useCallback(async (): Promise<InterviewSession> => {
    if (interview) return interview;
    const session = await v1Client.interviews.createInterviewSession({ projectId }, {});
    setInterview(session);
    return session;
  }, [interview, projectId]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setSending(true);
    try {
      if (selectedAgentId === INTERVIEWER_ID) {
        const session = await ensureInterviewSession();
        const updated = await v1Client.interviews.appendInterviewMessage(
          { projectId, sessionId: session.id },
          { content: text },
        );
        setInterview(updated);
      } else {
        setMessagesByAgent(prev => ({
          ...prev,
          [selectedAgentId]: [
            ...(prev[selectedAgentId] ?? []),
            buildConsoleUserMessage(text, selectedAgentId),
          ],
        }));
        const response = await v1Client.console.sendConsoleMessage(
          { projectId },
          { agentId: selectedAgentId, message: text },
        );
        const replies = response.replies.map(r =>
          buildConsoleAgentMessage(
            r.reply,
            r.fromAgentId,
            r.fromLabel,
            selectedAgentId,
            r.responseMode,
          ),
        );
        setMessagesByAgent(prev => ({
          ...prev,
          [selectedAgentId]: [...(prev[selectedAgentId] ?? []), ...replies],
        }));
      }
    } finally {
      setSending(false);
    }
  }, [draft, sending, selectedAgentId, projectId, ensureInterviewSession]);

  const handleApproveGate = useCallback(async () => {
    if (!activeRun || !pendingGate) return;
    await resolveInterrupt(projectId, activeRun.id, pendingGate.id, 'approve');
    await loadProjectState();
  }, [activeRun, pendingGate, projectId, resolveInterrupt, loadProjectState]);

  const handleRequestChanges = useCallback(async () => {
    if (!activeRun || !pendingGate) return;
    await resolveInterrupt(projectId, activeRun.id, pendingGate.id, 'request_changes');
    await loadProjectState();
  }, [activeRun, pendingGate, projectId, resolveInterrupt, loadProjectState]);

  return (
    <div className="forge-shell">
      <ChatPanel
        agents={allAgents}
        selectedAgentId={selectedAgentId}
        messages={visibleMessages}
        pendingGate={pendingGate}
        draft={draft}
        sending={sending}
        onSelectAgent={setSelectedAgentId}
        onDraftChange={setDraft}
        onSend={handleSend}
        onApproveGate={handleApproveGate}
        onRequestChanges={handleRequestChanges}
      />
      <AgentBoard
        agents={allAgents}
        selectedAgentId={selectedAgentId}
        onSelectAgent={setSelectedAgentId}
        runStatus={activeRun?.status ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
cd client && npx vitest run src/components/console/ForgeShell.test.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/console/ForgeShell.tsx client/src/components/console/ForgeShell.test.tsx client/src/test/msw/handlers.ts
git commit -m "feat(console): add ForgeShell coordinator component"
```

---

## Task 6: Refactor DashboardPage

**Files:**
- Modify: `client/src/pages/DashboardPage.tsx`

The current file is 663 lines. Replace it entirely with the thin wrapper below — it keeps project selection, create modal, auth logout, and mounts `ForgeShell`.

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/pages/DashboardPage.test.tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw/server';
import { renderWithProviders } from '../test/render';
import DashboardPage from './DashboardPage';
import { useProjectStore } from '../stores/projectStore';

function seedProjects() {
  useProjectStore.setState({
    projects: [
      { id: 'proj-1', title: 'Shadowveil Campaign', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z' },
      { id: 'proj-2', title: 'One-Shot: Dungeon of Despair', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' },
    ],
  });
}

describe('DashboardPage', () => {
  it('renders the most recently updated project tab as active by default', async () => {
    seedProjects();
    renderWithProviders(<DashboardPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /shadowveil/i })).toHaveClass('forge-topbar__project--active'),
    );
  });

  it('switches to ForgeShell for the clicked project', async () => {
    seedProjects();
    server.use(
      http.get('/api/v1/projects/proj-2/console/agents', () => HttpResponse.json([])),
      http.get('/api/v1/projects/proj-2/interview/sessions/latest', () => HttpResponse.json(null)),
      http.get('/api/v1/projects/proj-2/generation-runs', () => HttpResponse.json([])),
    );
    renderWithProviders(<DashboardPage />);
    await userEvent.click(screen.getByRole('button', { name: /dungeon/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /dungeon/i })).toHaveClass('forge-topbar__project--active'),
    );
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd client && npx vitest run src/pages/DashboardPage.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Replace DashboardPage.tsx**

```tsx
// client/src/pages/DashboardPage.tsx
import { useState } from 'react';
import { LogOut, Plus } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useProjectStore, type Project } from '../stores/projectStore';
import CreateProjectModal from '../components/projects/CreateProjectModal';
import { ForgeShell } from '../components/console/ForgeShell';
import '../styles/forge-console.css';

function sortProjects(projects: Project[]) {
  return [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export default function DashboardPage() {
  const { logout } = useAuthStore();
  const { projects } = useProjectStore();
  const sorted = sortProjects(projects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    sorted[0]?.id ?? null,
  );
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="forge-page">
      <div className="forge-topbar">
        <div className="forge-topbar__projects">
          {sorted.map(p => (
            <button
              key={p.id}
              className={`forge-topbar__project${p.id === selectedProjectId ? ' forge-topbar__project--active' : ''}`}
              onClick={() => setSelectedProjectId(p.id)}
            >
              {p.title}
            </button>
          ))}
          <button
            className="forge-topbar__new"
            aria-label="New project"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={14} />
          </button>
        </div>
        <button className="forge-topbar__logout" aria-label="Log out" onClick={logout}>
          <LogOut size={14} />
        </button>
      </div>

      {selectedProjectId ? (
        <ForgeShell key={selectedProjectId} projectId={selectedProjectId} />
      ) : (
        <div className="forge-empty">Create a project to get started.</div>
      )}

      {showCreateModal && (
        <CreateProjectModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}
```

Note: `key={selectedProjectId}` on `ForgeShell` ensures the component fully remounts (resetting state and restarting the polling loop) when the user switches projects.

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd client && npx vitest run src/pages/DashboardPage.test.tsx
```

Expected: 2 tests PASS.

- [ ] **Step 5: Run full client unit suite to catch regressions**

```bash
npm run test:unit --workspace=client
```

Expected: all pre-existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/DashboardPage.tsx client/src/pages/DashboardPage.test.tsx
git commit -m "refactor(console): replace DashboardPage monolith with ForgeShell split layout"
```

---

## Task 7: CSS — split layout and new component styles

**Files:**
- Modify: `client/src/styles/forge-console.css`

- [ ] **Step 1: Append new styles to the end of `forge-console.css`**

```css
/* ── FORGE PAGE SHELL ──────────────────────────────────────────── */

.forge-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #0a0a0f;
  color: #94a3b8;
}

/* Top bar */
.forge-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-bottom: 1px solid #1e1e2e;
  background: #0f0f18;
  flex-shrink: 0;
}

.forge-topbar__projects {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
}

.forge-topbar__project {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 3px 10px;
  color: #475569;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}

.forge-topbar__project:hover {
  color: #94a3b8;
  border-color: #2d2d3d;
}

.forge-topbar__project--active {
  color: #e2e8f0;
  border-color: #3730a3;
  background: #1a1a2e;
}

.forge-topbar__new,
.forge-topbar__logout {
  background: transparent;
  border: 1px solid #2d2d3d;
  border-radius: 4px;
  padding: 4px 7px;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}

.forge-topbar__new:hover,
.forge-topbar__logout:hover {
  color: #94a3b8;
}

.forge-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #334155;
  font-size: 12px;
}

/* ── SPLIT LAYOUT ──────────────────────────────────────────────── */

.forge-shell {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ── CHAT PANEL (left) ─────────────────────────────────────────── */

.forge-chat-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  border-right: 1px solid #1e1e2e;
}

.forge-chat-panel__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border-bottom: 1px solid #1e1e2e;
  background: #0d0d16;
  flex-shrink: 0;
}

.forge-chat-panel__hint {
  color: #2d2d4a;
  font-size: 9px;
}

/* ── GATE BANNER ───────────────────────────────────────────────── */

.forge-gate-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  background: #140e04;
  border-top: 2px solid #d97706;
  flex-shrink: 0;
}

.forge-gate-banner__icon {
  color: #f59e0b;
  font-size: 14px;
}

.forge-gate-banner__text {
  flex: 1;
  min-width: 0;
}

.forge-gate-banner__title {
  color: #fbbf24;
  font-size: 10px;
  font-weight: 600;
}

.forge-gate-banner__summary {
  color: #78716c;
  font-size: 9px;
  margin: 0;
  margin-top: 1px;
}

.forge-gate-banner__approve {
  background: #7c3aed;
  border: none;
  border-radius: 4px;
  padding: 5px 13px;
  color: #fff;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.forge-gate-banner__approve:hover {
  background: #6d28d9;
}

.forge-gate-banner__changes {
  background: transparent;
  border: 1px solid #44403c;
  border-radius: 4px;
  padding: 5px 10px;
  color: #78716c;
  font-size: 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}

.forge-gate-banner__changes:hover {
  color: #94a3b8;
  border-color: #6b7280;
}

/* ── AGENT SWITCHER ────────────────────────────────────────────── */

.forge-agent-switcher {
  position: relative;
}

.forge-agent-switcher__trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1a1a2e;
  border: 1px solid #3730a3;
  border-radius: 4px;
  padding: 4px 10px;
  color: #a78bfa;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.forge-agent-switcher__trigger:hover {
  background: #1e1b3a;
}

.forge-agent-switcher__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.forge-agent-switcher__dot--working { background: #a78bfa; animation: forge-pulse 1.5s infinite; }
.forge-agent-switcher__dot--idle    { background: #334155; }
.forge-agent-switcher__dot--waiting { background: #f59e0b; }
.forge-agent-switcher__dot--error   { background: #ef4444; }

@keyframes forge-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

.forge-agent-switcher__caret {
  font-size: 8px;
  color: #4d4d6a;
  margin-left: 2px;
}

.forge-agent-switcher__dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 100;
  background: #13131e;
  border: 1px solid #2d2d3d;
  border-radius: 6px;
  padding: 4px;
  min-width: 180px;
  list-style: none;
  margin: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.forge-agent-switcher__option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  color: #94a3b8;
  transition: background 0.1s;
}

.forge-agent-switcher__option:hover {
  background: #1a1a2e;
  color: #e2e8f0;
}

.forge-agent-switcher__option--selected {
  color: #c4b5fd;
}

.forge-agent-switcher__role {
  margin-left: auto;
  color: #334155;
  font-size: 9px;
}

/* ── AGENT BOARD (right) ───────────────────────────────────────── */

.forge-board {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #0d0d16;
}

.forge-board__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-bottom: 1px solid #1e1e2e;
  flex-shrink: 0;
}

.forge-board__label {
  color: #334155;
  font-size: 9px;
  letter-spacing: 0.07em;
}

.forge-board__run-status {
  font-size: 9px;
  border-radius: 3px;
  padding: 1px 6px;
  text-transform: capitalize;
}

.forge-board__run-status--running  { background: #1a2e1a; color: #4ade80; }
.forge-board__run-status--paused   { background: #1c1408; color: #f59e0b; }
.forge-board__run-status--complete { background: #1a1a24; color: #475569; }
.forge-board__run-status--queued   { background: #1a1a2e; color: #818cf8; }

.forge-board__cards {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
```

- [ ] **Step 2: Verify the app builds without errors**

```bash
npm run build --workspace=client
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/styles/forge-console.css
git commit -m "style(console): add split layout, gate banner, and agent switcher styles"
```

---

## Task 8: Smoke check

- [ ] **Step 1: Run the full client unit suite**

```bash
npm run test:unit --workspace=client
```

Expected: all tests PASS (no regressions in existing tests).

- [ ] **Step 2: Run the full verify build**

```bash
npm run verify
```

Expected: shared, sdk, server, worker, client all build cleanly.

- [ ] **Step 3: Verify the running app in Docker**

```bash
docker compose build client && docker compose up -d client
```

Open http://localhost:3000 and confirm:
- Top bar shows project tabs
- Selecting a project shows the split layout (chat left, agent board right)
- Interviewer is pre-selected in the chat header
- Agent board shows the Interviewer card highlighted
- Typing and sending a message to the interviewer works

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(console): complete Forge Console split-layout redesign"
```
