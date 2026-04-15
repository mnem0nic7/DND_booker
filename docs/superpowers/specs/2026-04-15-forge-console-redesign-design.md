# Forge Console Redesign — Design Spec

**Date:** 2026-04-15  
**Status:** Approved

## Goal

Replace the 663-line `DashboardPage.tsx` monolith with a clean, intentional split-layout console: persistent chat on the left, autonomous agent monitoring board on the right. The experience is built around observation — agents work autonomously and rarely interrupt — with chat available on demand for direct agent communication.

## Design Decisions

| Question | Decision |
|---|---|
| Overall layout | Side-by-side: chat left, agent board right, always visible |
| Monitoring panel | Agent board — mission control grid of agent cards |
| Chat during a run | Click an agent card to open a direct thread with that agent |
| Default chat context | Interviewer pre-selected; agent-switcher dropdown in chat header |
| Interrupt / gate UX | Sticky banner above the composer, dims composer until resolved |
| Agent autonomy | Agents pass work between themselves; interrupts are rare and consequential |

## Component Architecture

```
DashboardPage.tsx           ← thin shell: project selector + mounts ForgeShell
  ForgeShell.tsx            ← split layout owner; selectedAgentId state; polling loop
    ChatPanel.tsx           ← left column: header, messages, gate banner, composer
      AgentSwitcher.tsx     ← dropdown in chat header to switch agent context
      GateBanner.tsx        ← sticky interrupt band above composer
    AgentBoard.tsx          ← right column: scrollable grid of AgentCards
```

**Existing components that survive unchanged:** `MessageList`, `Composer`, `AgentCard`. They are embedded into `ChatPanel` and `AgentBoard` rather than living directly in the page.

## Component Specs

### `DashboardPage.tsx`

Becomes a thin wrapper. Handles project selection (top bar or sidebar). Once a project is selected, mounts `ForgeShell` for that project. All Forge Console logic moves out of this file.

### `ForgeShell.tsx`

Owns:
- `selectedAgentId: string` — which agent's thread is shown in `ChatPanel`. Starts as `'interviewer'` when no run is active.
- The polling loop — fetches console agents, latest interview session, and active generation runs on a 5-second interval. Same three API calls as today.
- `pendingGate` — derived from `readPendingGraphInterrupts(run.graphStateJson)`. Passed to `ChatPanel`.
- `messagesByAgent` — in-memory map of `(agentId → ConsoleMessage[])`. Interviewer thread is hydrated from `InterviewSession.turns[]` on load; other agent threads accumulate during the session.

Handlers:
- `handleSelectAgent(agentId)` — updates `selectedAgentId`; called by both `AgentBoard` (card click) and `AgentSwitcher` (dropdown).
- `handleSendMessage(agentId, text)` — dispatches to interview session API when `agentId === 'interviewer'`, console chat API otherwise.
- `handleResolveGate(action, payload?)` — calls `resolveInterrupt()`, clears pending gate on success.

Layout: two-column flex. Chat column takes remaining width; agent board is a fixed 220px right column.

### `ChatPanel.tsx`

Left column. Three vertical regions:

**Header** — `AgentSwitcher` dropdown showing the currently selected agent name, status dot, and a caret. Subtitle hint: "click any agent card to switch." When the agent switcher opens it lists all 9 agents with their current status.

**Message list** — `MessageList` showing the thread for `selectedAgentId`. Switches thread when `selectedAgentId` changes. The interviewer thread shows the full interview history with a visual divider ("— Interview locked · Run started —") once the session is locked.

**Gate banner** — `GateBanner`, rendered only when `pendingGate` is non-null. Sits between the message list and composer. Shows gate title, brief summary line (artifact count, critic score), and two buttons: **Approve →** and **Request changes**. While visible, the composer is `opacity: 0.4` and `pointer-events: none`.

**Composer** — `Composer`, disabled while a gate is pending. Placeholder text changes to "Approve the gate above to continue..." when a gate is active.

### `AgentSwitcher.tsx`

A button in the `ChatPanel` header that renders the current agent name with a status dot and `▾` caret. On click, opens a dropdown listing all agents from `agentList` with their status pill. Selecting an agent calls `onSelectAgent(agentId)`. Closes on outside click.

### `GateBanner.tsx`

Props: `gate: GraphInterrupt`, `onApprove()`, `onRequestChanges()`.

Renders:
- Warning icon `⚑`
- Gate title (from `gate.title`)
- Subtitle (from `gate.summary`)
- `Approve →` button (primary, purple)
- `Request changes` button (ghost)

No internal state. Parent (`ForgeShell`) handles the resolve call and clears the gate.

### `AgentBoard.tsx`

Right column, fixed 220px. Scrollable grid of `AgentCard` components, one per agent in `agentList`. Header shows "AGENTS" label and agent count / run status.

Clicking a card calls `onSelectAgent(agentId)`. The card matching `selectedAgentId` renders with a highlighted border. Idle agents are rendered at reduced opacity so active agents visually dominate.

## Data Flow

```
ForgeShell (polling every 5s)
  ├── fetchConsoleAgents()      → agentList       → AgentBoard → AgentCard[]
  ├── fetchLatestInterview()    → interviewSession → messagesByAgent['interviewer']
  ├── fetchGenerationRuns()     → activeRun        → pendingGate (derived)
  │                                                → AgentBoard run status
  └── messagesByAgent[selectedAgentId]             → ChatPanel → MessageList

User sends message:
  ChatPanel.Composer → ForgeShell.handleSendMessage(agentId, text)
    → if agentId === 'interviewer': interview.appendMessage()
    → else: console.sendConsoleMessage({ agentId, message })
    → append reply to messagesByAgent[agentId]

User clicks agent card:
  AgentBoard.AgentCard → ForgeShell.handleSelectAgent(agentId)
    → selectedAgentId updates → ChatPanel shows that agent's thread
    → AgentBoard highlights that card

User approves gate:
  ChatPanel.GateBanner → ForgeShell.handleResolveGate('approve')
    → resolveInterrupt() → pendingGate clears → GateBanner unmounts
    → Composer re-enables
```

## Entry State (No Active Run)

- `selectedAgentId` defaults to `'interviewer'`
- Interviewer card on the agent board shows `● ready`
- `AgentSwitcher` shows "Interviewer" with a live status dot
- Chat shows interviewer greeting: "What are you building today?"
- All other agent cards show `IDLE` at reduced opacity
- No gate banner

Once the interview is locked and a generation run is enqueued, `ForgeShell` polls the new run, agent statuses begin updating, and the interviewer card transitions to `DONE`.

## Out of Scope

- SSE live board (polling continues; 5-second interval unchanged)
- Persisting non-interviewer chat threads across page refreshes
- Multiple concurrent runs per project
- Mobile layout

## Future Direction

### 1 — SSE live board *(next most valuable)*
Replace the polling loop with a subscription to `/api/v1/projects/:projectId/generation-runs/:runId/events`. The SSE endpoint already emits `run_status` and `artifact_created` events. Polling becomes a fallback for when no run is active. `ForgeShell` adds `subscribeToRunEvents()` and tears it down on project change or run completion.

### 2 — Artifact inline review
When a gate fires, surface the actual artifact inline in the chat thread — a collapsible chapter draft, outline, or critic report — so the operator can read the work before approving. Requires threading artifact content through the interrupt payload in `graphStateJson.interrupts[].payload`.

### 3 — Persistent agent threads
Add a `console_message` table (`projectId`, `agentId`, `role`, `content`, `createdAt`) so all agent conversations survive page refreshes and provide a run audit trail. Low API complexity; high value for longer sessions.

### 4 — Proactive agent pings
Agents surface notable information without being asked (e.g. "D&D Expert flagged encounter CR mismatch"). These appear as unsolicited messages in the agent's thread and badge the agent card. Requires a server-side push mechanism (SSE event type or worker pub/sub).

### 5 — Run history view
A collapsible panel in the agent board footer showing past runs: stage summaries, critic scores, exported artifacts. Lets the operator review prior sessions without opening the editor.

### 6 — Multi-run support
Multiple concurrent runs on different documents within the same project. `ForgeShell` holds `runsByDocumentId` instead of a single active run; the board groups agent cards by document. Deferred until the single-run experience is solid.
