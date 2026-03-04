# AI Agent CRUD Tools — Full Design

## Summary

Migrate from control blocks (post-stream JSON extraction) to Vercel AI SDK `tool()` definitions. Add project CRUD tools, content indexing pipeline, and per-tool audit logging.

## Decisions

| Decision | Choice |
|----------|--------|
| AI tool pattern | Vercel AI SDK `tool()` definitions |
| Migration scope | Full — convert ALL control blocks to tools |
| Write safety | Timestamp comparison on `Project.updatedAt` |
| Indexing | Full pipeline (BullMQ worker, ContentChunk table, freshness fallback) |
| Audit storage | Prisma `AiToolAudit` table |
| Architecture | Tool Registry pattern (individual tool modules + central registry) |

---

## 1. Tool Registry Architecture

### File Structure

```
server/src/services/ai-tools/
  index.ts              — re-exports
  registry.ts           — ToolRegistry class
  types.ts              — ToolContext, ToolResult, AuditEntry interfaces

  crud/
    list-projects.ts
    get-project.ts
    create-project.ts
    update-project.ts
    delete-project.ts
    get-project-content.ts
    update-project-content.ts

  content/
    edit-document.ts          — replaces _documentEdit
    evaluate-document.ts      — replaces _evaluation
    generate-adventure.ts     — replaces _wizardGenerate
    generate-images.ts        — replaces _generateImage

  memory/
    update-working-memory.ts  — replaces _memoryUpdate
    remember-fact.ts          — replaces _remember
    update-task-plan.ts       — replaces _planUpdate
```

### Core Interfaces

```typescript
interface ToolContext {
  userId: string;
  projectId: string;
  requestId: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  contexts: ('project-chat' | 'global')[];
  execute: (params: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR';
    message: string;
  };
}
```

### Registry

```typescript
class ToolRegistry {
  private tools: Map<string, ToolDefinition>;

  register(tool: ToolDefinition): void;
  getToolsForContext(context: string, ctx: ToolContext): Record<string, CoreTool>;
  executeWithAudit(toolName: string, params: unknown, ctx: ToolContext): Promise<ToolResult>;
}
```

The registry wraps every `execute` with timing, audit logging, and error handling. `getToolsForContext` filters by context and creates Vercel AI SDK `tool()` definitions with `execute` callbacks wired to `executeWithAudit`.

---

## 2. Streaming Refactor

### Current Flow (control blocks)

```
Client POST → Server streamText() → AI streams text with ```json blocks
→ Server collects full text → stripControlBlocks() → processAssistantResponse()
→ Client receives text, also extracts blocks client-side for UI effects
```

### New Flow (Vercel AI SDK tools)

```
Client POST → Server streamText({ tools, maxSteps: 5 })
→ AI calls tools mid-stream → Registry executes + audits → result feeds back to AI
→ Server streams via toDataStream() (text + tool events)
→ Client parses events, renders text + tool status indicators
```

### Data Stream Protocol

```
0:"Hello, "                                    # text delta
9:{"toolCallId":"tc1","toolName":"getProject","args":{...}}  # tool call
a:{"toolCallId":"tc1","result":{...}}          # tool result
0:"I found your project..."                    # text continues
```

### Control Block → Tool Migration

| Control Block | Tool Name | Execution Location |
|---|---|---|
| `_memoryUpdate` | `updateWorkingMemory` | Server (DB write) |
| `_planUpdate` | `updateTaskPlan` | Server (DB write) |
| `_remember` | `rememberFact` | Server (DB write) |
| `_wizardGenerate` | `generateAdventure` | Server (generates sections, returns data) |
| `_documentEdit` | `editDocument` | Server validates, returns ops → client applies to ProseMirror |
| `_generateImage` | `generateImages` | Server calls image API, returns URLs → client applies |
| `_evaluation` | `evaluateDocument` | Server returns structured findings → client renders card |

### Document Edit Strategy

`editDocument` tool returns ProseMirror operations; client applies them. This preserves undo/redo history and avoids editor state desync. The existing `executeDocumentEdits()` function in AiChatPanel is reused.

---

## 3. CRUD Tools

### Read Tools

- `listProjects()` — all user projects (id, title, type, status, updatedAt)
- `getProject(projectId)` — full project metadata
- `getProjectContent(projectId)` — TipTap JSON content (or indexed chunks if fresh)

### Write Tools (require `expectedUpdatedAt`)

- `createProject({ title, description?, type?, templateId? })`
- `updateProject(projectId, expectedUpdatedAt, patch)`
- `updateProjectContent(projectId, expectedUpdatedAt, content)`
- `deleteProject(projectId, expectedUpdatedAt)`

### Optimistic Concurrency

```typescript
async function updateWithVersionCheck(projectId, userId, expectedUpdatedAt, updateFn) {
  const current = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!current) return { success: false, error: { code: 'NOT_FOUND' } };
  if (current.updatedAt.toISOString() !== expectedUpdatedAt) {
    return { success: false, error: { code: 'CONFLICT', message: 'Modified since last read' } };
  }
  const updated = await updateFn(prisma);
  return { success: true, data: { id: updated.id, updatedAt: updated.updatedAt } };
}
```

### Authorization

All queries filter by `userId` at the DB level. Cross-project access is impossible at query level.

---

## 4. Content Indexing Pipeline

### Schema

```prisma
model ContentChunk {
  id          String   @id @default(uuid())
  projectId   String   @map("project_id")
  chunkId     String   @map("chunk_id")       // "node-{nodeIndex}"
  blockType   String   @map("block_type")
  headingPath String   @map("heading_path")   // "Chapter 1 > The Goblin Cave"
  text        String
  attrs       Json     @default("{}")
  nodeIndex   Int      @map("node_index")
  updatedAt   DateTime @updatedAt @map("updated_at")

  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, chunkId])
  @@index([projectId])
  @@map("content_chunks")
}
```

### Worker Pipeline

1. `project.content.changed` event emitted after content save
2. BullMQ job: `{ projectId, updatedAt }`
3. Worker fetches `Project.content`, walks TipTap JSON nodes
4. For each node: extract text, compute headingPath, normalize attrs
5. Upsert chunks (delete stale, upsert current)

### Freshness Contract

- Check `ContentChunk.updatedAt` vs `Project.updatedAt`
- Fresh → use indexed chunks
- Stale → fall back to `buildDocumentOutline()` on raw content

---

## 5. Audit Model

```prisma
model AiToolAudit {
  id              String   @id @default(uuid())
  requestId       String   @map("request_id")
  userId          String   @map("user_id")
  projectId       String?  @map("project_id")
  toolName        String   @map("tool_name")
  inputHash       String   @map("input_hash")
  resultStatus    String   @map("result_status")
  oldContentHash  String?  @map("old_content_hash")
  newContentHash  String?  @map("new_content_hash")
  oldUpdatedAt    DateTime? @map("old_updated_at")
  newUpdatedAt    DateTime? @map("new_updated_at")
  latencyMs       Int      @map("latency_ms")
  createdAt       DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@index([projectId])
  @@index([toolName])
  @@index([createdAt])
  @@map("ai_tool_audits")
}
```

---

## 6. Client-Side Changes

### Stream Consumption

Replace raw `fetch()` + text reader with data stream event parser:

```typescript
function parseDataStreamEvents(reader) {
  // Yields: { type: 'text-delta' | 'tool-call' | 'tool-result', ... }
}
```

### AiChatPanel

**Remove**: All `extract*()` functions, module-level tracking sets, `stripPlanningBlocks()`, `processImageGenerations()`.

**Add**: Tool event handler in stream reader:

```typescript
for await (const event of parseDataStreamEvents(reader)) {
  switch (event.type) {
    case 'text-delta': appendToMessage(event.value); break;
    case 'tool-call': showToolStatus(event.toolCallId, 'running'); break;
    case 'tool-result': handleToolResult(event.toolName, event.result); break;
  }
}
```

**`handleToolResult` dispatcher**: Routes results to appropriate UI handlers (editor operations, eval card, image progress, wizard progress).

### Store Changes

`aiStore.ts`:
```typescript
activeToolCalls: Map<string, { toolName: string; status: 'running' | 'complete' | 'error' }>;
```

---

## 7. Testing Strategy

### Unit Tests (per tool)

```
server/src/__tests__/ai-tools/
  list-projects.test.ts
  create-project.test.ts
  update-project-content.test.ts  — includes concurrency conflict
  edit-document.test.ts
  ...
```

### Integration Tests

```
server/src/__tests__/ai-crud.test.ts
```

- Authorized CRUD success cycle
- Forbidden cross-project access
- Stale update conflict detection
- Retrieval freshness fallback

### E2E Tests

Extend `client/e2e/ai-campaign-creation.spec.ts`:
- AI creates project via tool call
- AI reads/describes content
- AI updates metadata

### Acceptance Bar

- 99%+ CRUD correctness
- 0 cross-project violations
- 100% stale-write conflict detection
- <2% retrieval freshness misses

---

## 8. Rollout Phases

### Phase 1: Tool Registry + CRUD Tools
- Tool registry, types, base audit wrapper
- 7 CRUD tool modules
- Prisma migration (AiToolAudit)
- Unit + integration tests

### Phase 2: Control Block Migration
- Convert all 7 control blocks to tool definitions
- Refactor streaming (streamText with tools, toDataStream)
- Update system prompt (remove control block instructions, add tool descriptions)

### Phase 3: Client Refactor
- Data stream event parser
- Tool event handler + result dispatcher
- Remove all control block extraction code
- Tool status indicators in UI

### Phase 4: Indexing Pipeline
- Prisma migration (ContentChunk)
- BullMQ worker job for content chunking
- Freshness-aware content retrieval in tools
- Integration with getProjectContent tool

### Phase 5: E2E Tests + Polish
- Full E2E test coverage
- Audit dashboard queries
- Performance validation
