# Pretext Layout Parity Auditor

Status: proposed

## Purpose

Audit parity between legacy layout behavior and the Pretext-backed measurement path. This agent should exist to keep preview, export measurement, and server estimation aligned as the text engine expands.

## Why This Agent Should Exist

The repo now has:

- a flagged Pretext measurement engine in `shared/src/text-layout.ts`
- explicit page boundary metadata in `shared/src/layout-plan.ts`
- page metrics snapshots in `shared/src/page-metrics.ts`
- `legacy`, `shadow`, and `pretext` rollout modes across client, worker, and server

That creates a new class of issues that are not pure content problems and not pure layout-plan problems. They are parity problems.

## Proposed Inputs

- `FlowTextLayoutShadowTelemetry`
- `PageMetricsSnapshot`
- measured page models from client preview, worker export measurement, and server estimate paths
- unsupported-unit counts
- page-count deltas and total-height deltas

## Proposed Responsibilities

- detect preview/export drift on supported text surfaces
- detect blank or nearly blank pages caused by manual `pageBreak` use
- detect grouped packet regressions after Pretext measurement changes
- separate true plan problems from engine-support gaps
- route fix recommendations to the right owner:
  - layout refresh
  - content mutation
  - explicit legacy fallback
  - engine support expansion

## Suggested First Actions

- `audit_pretext_shadow_diff`
- `recommend_layout_refresh_for_parity`
- `flag_unsupported_group_fallbacks`
- `report_manual_break_anomalies`

## Guardrails

- do not rewrite content directly
- do not silently widen unsupported Pretext coverage without tests
- do not mark intentional manual page boundaries as defects without checking page metrics context

## Exit Criteria

- supported-surface parity stays within agreed thresholds
- grouped layouts and manual page breaks produce the same structural pagination decisions across editor, worker, and server
