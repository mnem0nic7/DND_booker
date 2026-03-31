# Layout Review Triage

## Purpose

Use this skill when a document has export-review findings, page-metrics findings, or visible preview/export drift and you need to decide the right fix path quickly.

## Inputs

- export review findings
- page metrics snapshot
- measured page model when available
- text-layout mode and any `shadow` telemetry

## Triage Order

1. Confirm whether the issue is content, layout, or engine parity.
2. Check whether the affected blocks are in the supported Pretext set.
3. Check whether a manual `pageBreak` caused the page boundary intentionally.
4. Check whether the issue is grouped-layout specific.
5. Only then choose the mutation path.

## Fix Routing

- Use layout refresh when the content is acceptable but placement, grouping, or page economy is wrong.
- Use stat-block repair when mechanics are untrustworthy.
- Use random-table expansion when entries are too thin.
- Use utility densification when prose is not runnable.
- Use explicit fallback or engine work when the failure is really unsupported Pretext coverage.

## Signals That It Is A Parity Problem

- `shadow` page-count delta is non-zero
- total height deltas spike without content changes
- preview and export disagree on manual page-break handling
- grouped units paginate differently only in `pretext`

## Signals That It Is Not A Parity Problem

- the same issue appears in `legacy`
- review codes point to weak content rather than spacing or page structure
- the offending block family is unsupported and expected to fall back
