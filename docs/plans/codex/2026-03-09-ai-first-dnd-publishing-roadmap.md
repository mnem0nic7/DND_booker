# AI-First D&D Publishing Roadmap

**Date:** 2026-03-09
**Author:** Codex
**Status:** Proposed
**Scope:** Product and implementation roadmap for turning DND Booker into an AI-first tool for creating professional-looking D&D material.

## Product Target

The product goal is not just "AI writing" and not just "pretty formatting."

The target is:

- prompt-to-publish D&D content
- with strong visual resemblance to professional 5e supplements
- where AI owns most of the drafting, structuring, formatting, and cleanup work
- and the user acts as reviewer/editor rather than layout operator

This puts DND Booker between two existing product expectations:

- **Homebrewery** sets the bar for "this looks like real D&D"
- **Format Magic** sets the bar for "AI can make this look polished without manual formatting"

To win, DND Booker has to combine both:

- authentic RPG publication aesthetics
- AI-driven layout and editorial finishing
- structured D&D-native authoring primitives

## Product Thesis

The core promise should be:

**Generate professional D&D supplements with AI, then automatically format them for publication.**

That implies five non-negotiable capabilities:

1. AI must generate book structure, not only paragraphs.
2. The visual system must look intentionally tabletop-native, not generic document-software clean.
3. Layout cleanup must be automatic enough that users rarely move blocks by hand.
4. Export quality must be good enough for DriveThruRPG/DMsGuild-first workflows.
5. Users must be able to inspect and revise the result when AI gets details wrong.

## What "Professional Looking" Means

For this product, "professional looking" should be defined concretely:

- strong chapter openings with clear hierarchy and visual reset
- consistent use of stat blocks, sidebars, read-aloud, tables, handouts, and art
- clean page balance with few blank or nearly blank pages
- logical proximity between narrative content and supporting blocks
- front matter, TOC, credits, and back matter that feel complete
- typography, ornaments, textures, and page rhythm that feel like RPG publishing rather than office documents
- export output that survives print/PDF review without obvious amateur artifacts

## Current Strengths In The Repo

The current codebase already has the right substrate:

- a structured editor with D&D-specific blocks and themes
- AI chat, block generation, and autofill
- project/document storage
- multi-format export
- autonomous generation infrastructure
- early layout-awareness work for AI analysis and repair

This is materially closer to the target than a markdown-only tool or a generic formatting AI.

## Main Gaps

The current gaps are mostly in finishing quality, not base infrastructure:

1. The visual language is good but not yet clearly "publisher-grade D&D" by default.
2. AI can generate and edit, but it does not yet function as a reliable art director/layout finisher.
3. Layout truth is still split between editor estimates, rendered DOM metrics, and export behavior.
4. The autonomous pipeline is still stronger at generation than at final publication polish.
5. Existing flows still assume too much user judgment during formatting cleanup.

## Must-Have Roadmap

### Track 1: Publisher-Grade D&D Visual System

This track exists to beat the visual expectation set by Homebrewery.

Must-have outcomes:

- create one flagship house style that looks unmistakably like a polished 5e-compatible supplement
- define page archetypes for chapter openers, lore pages, encounter pages, appendices, title/back matter
- improve ornamentation, heading systems, dividers, table styling, margins, and texture usage
- tighten block-specific styles so stat blocks, callouts, and handouts feel designed as a family
- make the default export look strong without user theme tweaking

Implementation notes:

- start with one canonical "pro" theme before expanding theme count further
- treat theme work as a layout system, not only a color/font swap
- add golden export fixtures for flagship layouts

### Track 2: AI Art Director / Formatting Pass

This track exists to beat the convenience expectation set by Format Magic.

Must-have outcomes:

- add a dedicated AI finishing pass after draft generation
- let AI evaluate page balance, section starts, block proximity, and layout rhythm
- let AI fix issues through structural edit operations instead of only recommending changes
- automatically resolve duplicate page breaks, weak chapter starts, isolated blocks, and poor supporting-block placement
- surface a concise "what I changed for publication polish" report to the user

Implementation notes:

- use rendered node/page metrics as the main authority when available
- add export-validated checks for final acceptance
- favor move operations before rewrites when the problem is placement rather than content quality

### Track 3: AI-First Prompt-To-Book Workflow

This track ensures the product is primarily "done by AI."

Must-have outcomes:

- support short prompt -> complete adventure structure with no mandatory follow-up
- generate front matter, TOC, chapter packets, appendices, and back matter automatically
- make chapter/scene packets explicit so later formatting passes know narrative intent
- give the user one clear run flow: brief, generate, review, export
- persist intermediate artifacts so the user can inspect the book plan and regeneration history

Implementation notes:

- keep interactive chat for refinement
- do not require the chat panel for the main generation path
- generation should produce a reviewable publishing packet, not just editor content

### Track 4: Canonical Layout Intelligence

This track is the backbone for publication-quality automation.

Must-have outcomes:

- unify editor-rendered and generation-side layout reasoning around a shared layout model
- detect deterministic layout failures before and after AI runs
- classify failures by severity: blocking, warning, informational
- use export or preview rendering as the final truth for publication fit
- store enough layout evidence that the AI can explain why it moved or reformatted something

Implementation notes:

- the in-progress layout snapshot work is the correct foundation
- the follow-on requirement is export-truth validation rather than editor-only reasoning
- final acceptance should consider both content quality and physical page composition

### Track 5: Publication-Ready Review And Export

This track converts "looks good in editor" into "safe to publish."

Must-have outcomes:

- add a pre-export publication review pass with clear scores and blocking issues
- validate cover/front matter/TOC/back matter completeness
- validate print-friendly margins, page counts, and obvious layout defects
- produce exports that match the on-screen promise closely enough to trust
- present a final "ready to publish" decision, not just a raw export button

Implementation notes:

- use the generation preflight and evaluation pipeline as the base
- add explicit publication-fit gates
- make "accepted for export" a first-class artifact state

## Nice-To-Have

These can wait until the must-have loop is stable:

- more theme variants beyond one flagship style and one alternate style
- advanced ornament packs and visual presets
- one-click remix of a supplement into another visual style
- AI-generated illustration briefs and interior art placement presets
- marketplace-specific packaging helpers beyond core PDF/export needs
- import/reformat of arbitrary DOCX/PDF source material
- collaborative review flows

## Recommended Delivery Sequence

### Phase 1: Finish Layout Intelligence Foundation

Target outcome:

- AI can reliably see rendered pages/nodes and identify obvious layout problems

Ship first:

- rendered snapshot collection
- deterministic findings
- prompt integration
- move-aware structural edits
- generation-side merge of deterministic layout findings

### Phase 2: Build The Flagship House Style

Target outcome:

- exports look immediately credible as D&D-adjacent publication material

Ship next:

- one high-quality theme tuned for chapter openings, stat pages, appendices, and sidebars
- golden export fixtures for representative page types
- style QA against example adventures/modules

### Phase 3: Add The AI Finishing Pass

Target outcome:

- a generated project can be automatically polished after draft creation

Ship next:

- dedicated publication-polish step in the generation pipeline
- AI move/reorder/cleanup actions
- pre-export layout repair loop

### Phase 4: Add Export-Truth Acceptance

Target outcome:

- the final acceptance gate reflects actual publishable output, not only editor approximations

Ship next:

- export or preview-rendered layout analysis
- blocking publication-fit checks
- ready-to-publish artifact/report

### Phase 5: Tighten Prompt-To-Book UX

Target outcome:

- the default user journey is "brief -> wait -> review -> export"

Ship next:

- guided generation run entry
- better progress and artifact inspection
- focused review UI for AI changes and blocking issues

## Concrete Next Implementation Steps

The next engineering sequence should be:

1. Complete the current layout-intelligence follow-ons:
   - generation evaluators/revisers consume the same layout model
   - export/preview truth replaces editor-only truth for final checks
   - more deterministic findings for orphaned support blocks and bad chapter openings

2. Introduce a dedicated `publication_polish` stage in the generation pipeline:
   - input: assembled documents plus layout analysis
   - output: structural edits, targeted rewrites, accepted/retry decision

3. Create a flagship D&D publication theme:
   - chapter opener treatment
   - polished stat/read-aloud/sidebar/table family
   - front matter and appendix archetypes

4. Add a publication review artifact:
   - visual/layout score
   - blocking issues
   - auto-fixed issues
   - export readiness decision

5. Tighten the top-level product UX around generation:
   - make autonomous generation the primary path
   - keep manual editing as a refinement path

## Success Metrics

This roadmap is working if:

- a user can produce a credible one-shot or short module mostly from a prompt
- generated output needs light editorial correction, not extensive page surgery
- exported pages look closer to commercial D&D supplements than to generic documents
- layout issues are usually fixed by AI before the user sees them
- users describe the product as "AI that makes my adventure look publishable"

## Product Positioning

The product should not be framed as:

- a markdown alternative
- a generic document formatter
- a general-purpose AI writer

It should be framed as:

**An AI D&D publisher: generate, structure, format, and polish tabletop supplements for release-quality output.**
