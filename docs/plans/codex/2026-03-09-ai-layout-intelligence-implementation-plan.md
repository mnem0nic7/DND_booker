# AI Layout Intelligence Implementation Plan

**Date:** 2026-03-09
**Author:** Codex
**Status:** In progress
**Scope:** Plan plus implementation of the first layout-intelligence foundation.

## Goal

Improve the AI system's ability to read, reason about, and repair document layout so formatting decisions are based on rendered structure instead of only prompt heuristics.

This plan focuses on the gap between:

- the editor's actual rendered layout
- the layout information passed to AI chat and evaluation
- the autonomous generation pipeline's limited layout awareness

## Current Problem

The current system gives the AI three weak signals instead of one canonical layout model:

1. An estimated document outline built server-side from hardcoded node heights.
2. A coarse page-metrics snapshot built client-side from rendered DOM boundaries.
3. Prompt instructions that tell the model how the layout "should" work.

That leaves the AI with incomplete answers to the questions that matter for formatting:

- Which page is each node actually on?
- Which column is it in?
- Did a block split awkwardly across a boundary?
- Is a stat block orphaned from the encounter that references it?
- Is a chapter opening buried mid-page?
- Is a blank or nearly blank page caused by a manual break or natural flow?

## Product Outcomes

After this work, the AI should be able to:

- evaluate page balance using real rendered measurements
- understand the local neighborhood around each node
- reason about block placement relative to headings and sections
- identify obvious layout pathologies before proposing edits
- receive deterministic layout findings in addition to raw layout metrics

## Architecture Direction

Introduce a richer `LayoutSnapshot` inside the existing `PageMetricsSnapshot` payload rather than creating a second parallel API.

The enriched payload should contain:

- page-level metrics for quick summary and blank-page detection
- node-level metrics for exact page and column placement
- deterministic layout findings computed before the model runs

This keeps the existing chat/evaluation surface area intact while giving the AI materially better context.

## Phase 1: Foundational Layout Snapshot

### Deliverables

- extend shared layout types to include node-level metrics and findings
- collect richer layout telemetry from the live editor DOM
- send the enriched snapshot through chat requests
- validate the richer payload server-side
- expose the new layout details in the system prompt

### New Data Shapes

Add `LayoutNodeMetric`:

- `nodeIndex`
- `nodeType`
- `page`
- `column`
- `topPx`
- `bottomPx`
- `heightPx`
- `isColumnSpanning`
- `isNearPageTop`
- `isNearPageBottom`
- `isSplit`
- `textPreview`
- `label`
- `sectionHeading`

Add `LayoutFinding`:

- `code`
- `severity`
- `message`
- `page`
- `nodeIndex`

Extend `PageMetric` with:

- `nodeIndices`
- `nodeSummaries`

Extend `PageMetricsSnapshot` with:

- `nodes`
- `findings`

## Phase 2: Deterministic Layout Analysis

### Deliverables

- derive layout findings from rendered metrics before AI evaluation
- cover the highest-value formatting failures first

### Initial Finding Set

- `blank_page`
- `nearly_blank_page`
- `chapter_heading_mid_page`
- `duplicate_page_breaks`
- `consecutive_page_breaks`
- `orphaned_reference_block`
- `isolated_visual_block`

### Notes

The first implementation should stay conservative. Findings should only encode strong signals that can be detected deterministically from rendered layout plus nearby headings and block types.

## Phase 3: Prompt and Agent Improvements

### Deliverables

- update `buildSystemPrompt()` to include the enriched layout model
- render node-level snapshots in a compact human-readable format
- render deterministic findings before the AI responds

### Prompt Direction

The model should be told:

- page-level summaries are real rendered measurements
- node-level entries are authoritative for page and column placement
- layout findings are precomputed signals, not guesses
- edits should use those authoritative signals instead of relying on estimated heights when possible

## Phase 4: Generation Integration

### Deliverables

- feed the same layout snapshot into autonomous evaluation and revision stages
- add document-level layout checks to generation acceptance criteria

### Not included in this implementation pass

- export-renderer layout snapshots
- new layout-native edit operations like `moveNode` or `moveRange`
- chapter writer layout contracts
- server-side persistent layout history

Those remain follow-on work after the foundational snapshot is stable.

## Testing Plan

- unit tests for prompt construction with enriched layout input
- unit tests for layout finding generation
- route validation tests for the richer `pageMetrics` payload
- regression tests to ensure older callers still work when `nodes` and `findings` are absent

## Implementation Scope For This Change

This implementation will complete:

- the new shared snapshot types
- the client-side layout snapshot collector
- deterministic layout findings
- server request validation updates
- prompt integration
- targeted tests

This implementation will not complete:

- full autonomous-generation layout integration
- new AI document-edit operations
- export-based canonical layout snapshots
- full chapter/appendix formatting contracts

## Success Criteria

This change is successful if:

- AI chat receives page-level and node-level layout context from the rendered editor
- prompt text includes deterministic layout findings
- the richer payload is type-safe and validated server-side
- tests cover both prompt behavior and payload validation
- no existing chat flow regresses when layout data is not provided

## Follow-On Priorities

1. Add server-side layout analyzers usable by generation evaluators and revisers.
2. Introduce layout-native edit operations instead of relying only on low-level insert/remove.
3. Use export or preview rendering as the final acceptance truth for publication fit.
4. Add golden layout fixtures for blank-page, orphaned-block, and chapter-boundary scenarios.
