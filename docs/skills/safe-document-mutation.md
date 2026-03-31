# Safe Document Mutation

## Purpose

Use this skill whenever an automated path edits document content or layout-bearing blocks.

## Rules

- preserve stable node IDs whenever possible
- prefer narrow block-local edits over broad rewrites
- re-run layout resolution after content mutations that can affect grouping or placement
- checkpoint before risky multi-block changes
- never mutate unrelated sections just because they are nearby in the JSON tree

## Required Follow-Up After Accepted Changes

- resolve document layout again
- persist both content and layout-plan changes when the resolver changes them
- mark the document `edited`
- record a concise action summary for the run log

## High-Risk Mutation Families

- stat blocks
- random tables
- inserted utility packets
- heading and packet structures that influence layout grouping
- manual `pageBreak` insertion or removal

## Anti-Patterns

- replacing the whole document to edit one block
- inserting duplicate utility packets
- deleting a manual `pageBreak` without checking whether it marks a real section boundary
- editing content to hide a layout bug that should be fixed in the layout plan or the engine
