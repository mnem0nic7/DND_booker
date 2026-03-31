# Agent Catalog

This directory documents the product-facing agents that already exist in the DND Booker runtime, plus one proposed agent that should be added next.

Use these docs when you are:

- extending the persistent agent runtime
- adding a new autonomous mutation strategy
- debugging a run that edits content or layout
- deciding whether a behavior belongs in the top-level controller or in a specialist

Important distinctions:

- `persistent_editor` and `background_producer` are run modes for the same top-level controller, not separate specialist agents
- CRUD, memory, image, and document-edit capabilities are tools, not agents
- specialists should own narrow mutation surfaces and be safe to checkpoint and roll back

Current and proposed agents:

- [Autonomous Creative Director](./autonomous-creative-director.md)
- [Layout Refresh Specialist](./layout-refresh-specialist.md)
- [Stat Block Repair Specialist](./stat-block-repair-specialist.md)
- [Random Table Expansion Specialist](./random-table-expansion-specialist.md)
- [Utility Densifier Specialist](./utility-densifier-specialist.md)
- [Pretext Layout Parity Auditor](./pretext-layout-parity-auditor.md)
