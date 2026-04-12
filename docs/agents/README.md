# Agent Catalog

This directory documents the product-facing agents that exist in the DND Booker runtime.

Use these docs when you are:

- extending the persistent agent runtime
- adding a new autonomous mutation strategy
- debugging a run that edits content or layout
- deciding whether a behavior belongs in the top-level controller or in a specialist

If you need the broader package and persistence map first, start with `docs/architecture/current-state.md`.

Important distinctions:

- `persistent_editor` and `background_producer` are run modes for the same top-level controller, not separate specialist agents
- CRUD, memory, image, and document-edit capabilities are tools, not agents
- specialists should own narrow mutation surfaces and be safe to checkpoint and roll back
- the top-level controller now executes as a persisted node graph; retries should resume from `AgentRun.graphStateJson.runtime.currentNode`, not from cycle 0

Current agents:

- [Autonomous Creative Director](./autonomous-creative-director.md)
- [Layout Refresh Specialist](./layout-refresh-specialist.md)
- [Stat Block Repair Specialist](./stat-block-repair-specialist.md)
- [Random Table Expansion Specialist](./random-table-expansion-specialist.md)
- [Utility Densifier Specialist](./utility-densifier-specialist.md)
- [Pretext Layout Parity Auditor](./pretext-layout-parity-auditor.md)
