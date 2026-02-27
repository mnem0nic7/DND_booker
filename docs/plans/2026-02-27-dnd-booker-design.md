# DND Booker - Design Document

**Date:** 2026-02-27
**Status:** Approved

## Overview

DND Booker is a web application for creating D&D campaign material (campaigns, one-shots, supplements, sourcebooks) formatted for publication on DriveThruRPG and DMsGuild. It transforms the CLI-based [booker](https://github.com/mnem0nic7/booker) tool into a full-featured web app with a WYSIWYG block editor and multi-format export.

## Architecture

**Approach: Microservices** — Three independent services communicating via REST API and Redis job queue.

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  React + TipTap Block Editor + Tailwind CSS                 │
│  Port 3000                                                   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Editor   │  │ Template │  │ Project  │  │ Dashboard  │  │
│  │ (TipTap) │  │ Gallery  │  │ Manager  │  │ & Auth     │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API / WebSocket
┌────────────────────────┴────────────────────────────────────┐
│                      API SERVICE                             │
│  Express.js + PostgreSQL + JWT Auth                         │
│  Port 4000                                                   │
│                                                              │
│  Routes: /auth, /projects, /documents, /templates, /export  │
│  Models: User, Project, Document, Template, ExportJob       │
└────────────────────────┬────────────────────────────────────┘
                         │ Redis Queue (Bull)
┌────────────────────────┴────────────────────────────────────┐
│                    PDF WORKER SERVICE                         │
│  Node.js + Puppeteer + Pandoc                               │
│                                                              │
│  Jobs: generate-pdf, generate-epub, generate-print-pdf      │
│  Reads templates & styles, outputs to S3/local storage      │
└─────────────────────────────────────────────────────────────┘

Storage:
  PostgreSQL  → Users, projects, documents (JSON), templates
  Redis       → Job queue, session cache
  S3/Local    → Uploaded images, generated PDFs/ePubs
```

### Key Technology Choices

- **TipTap** (ProseMirror-based) for the block editor — excellent custom node/extension support, drag-and-drop blocks
- **Bull + Redis** for the job queue — proven, simple, job progress tracking
- **Puppeteer** for PDF generation — renders HTML/CSS faithfully (preview matches output)
- **Pandoc** for ePub generation
- **Zustand** for frontend state management
- **Tailwind CSS** for UI styling
- **Prisma** for database ORM

## D&D Block System (TipTap Custom Nodes)

Each D&D element is a custom TipTap node that users drag from a sidebar palette into their document.

### Core Content Blocks

| Block | Description | Configurable Fields |
|-------|-------------|-------------------|
| **Chapter Header** | Titled page break with optional art | Title, subtitle, chapter number, background image |
| **Body Text** | Standard paragraph with D&D typography | Alignment, drop cap toggle, column count (1 or 2) |
| **Read-Aloud Box** | Italic boxed text for DM narration | Text content, border style (parchment/dark) |
| **Sidebar Callout** | Inset box for lore, tips, or rules notes | Title, content, style (info/warning/lore) |

### Creature & NPC Blocks

| Block | Description | Configurable Fields |
|-------|-------------|-------------------|
| **Stat Block** | Full 5e monster/NPC stat block | Name, size/type/alignment, AC, HP, speed, ability scores, skills, senses, languages, CR, traits, actions, reactions, legendary actions |
| **NPC Profile** | Compact NPC reference card | Name, race, class, description, personality traits, ideals, bonds, flaws, portrait image |

### Game Mechanic Blocks

| Block | Description | Configurable Fields |
|-------|-------------|-------------------|
| **Encounter Table** | Random encounter roller table | Environment, CR range, entries with weight/description |
| **Random Table** | Generic d4/d6/d8/d10/d12/d20/d100 table | Title, die type, entries |
| **Spell Card** | Formatted spell description | Name, level, school, casting time, range, components, duration, description |
| **Magic Item** | Item description with rarity | Name, type, rarity, attunement, description, properties |

### Class & Character Blocks

| Block | Description | Configurable Fields |
|-------|-------------|-------------------|
| **Class Feature** | Subclass or class ability description | Name, level, class, description |
| **Race/Species** | Playable race description | Name, traits, ability score increases, size, speed, languages, features |

### Layout & Visual Blocks

| Block | Description | Configurable Fields |
|-------|-------------|-------------------|
| **Full-Bleed Image** | Edge-to-edge artwork | Image, caption, position (full/half/quarter page) |
| **Map** | Map with numbered/lettered key | Image, scale, key entries |
| **Handout** | Player-facing printable page | Title, content, style (letter/scroll/poster) |
| **Page Border** | Decorative page frame | Style (elvish/dwarven/infernal/simple) |
| **Column Break** | Force content to next column | — |
| **Page Break** | Force new page | — |

### Document Structure Blocks

| Block | Description |
|-------|-------------|
| **Table of Contents** | Auto-generated from chapter headers |
| **Title Page** | Configurable cover page with title, author, art |
| **Credits Page** | Attribution, legal notices, OGL/CC text |
| **Back Cover** | Blurb, barcode placeholder, author bio |

## Data Model (PostgreSQL)

### Tables

**users**: id (UUID), email, password_hash, display_name, avatar_url, created_at, updated_at

**projects**: id (UUID), user_id (FK), title, description, type (campaign/one_shot/supplement/sourcebook), status (draft/in_progress/review/published), cover_image_url, settings (JSONB), created_at, updated_at

**documents**: id (UUID), project_id (FK), title, sort_order, content (JSONB — TipTap document JSON), created_at, updated_at

**templates**: id (UUID), name, description, type, content (JSONB), thumbnail_url, is_system, user_id (FK, nullable), created_at

**export_jobs**: id (UUID), project_id (FK), user_id (FK), format (pdf/epub/print_pdf), status (queued/processing/completed/failed), progress (0-100), output_url, error_message, created_at, completed_at

**assets**: id (UUID), user_id (FK), project_id (FK, nullable), filename, mime_type, url, size_bytes, created_at

## Authentication

- JWT-based: access tokens (15min) + refresh tokens (7 days)
- Refresh tokens in HttpOnly cookies, access tokens in memory
- Password hashing via bcrypt
- Email/password signup + optional OAuth (Google) later
- Rate limiting on auth endpoints

## API Routes

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id

GET    /api/projects/:id/documents
POST   /api/projects/:id/documents
PUT    /api/documents/:id
DELETE /api/documents/:id
PATCH  /api/documents/:id/reorder

GET    /api/templates
GET    /api/templates/:id

POST   /api/projects/:id/export
GET    /api/export-jobs/:id
GET    /api/export-jobs/:id/download

POST   /api/assets/upload
DELETE /api/assets/:id
```

## Styling System

### Built-in Themes

| Theme | Description |
|-------|-------------|
| **Classic Parchment** | Tan/brown tones, serif fonts, aged paper texture |
| **Dark Tome** | Dark background, gold/cream text |
| **Clean Modern** | White background, sans-serif, minimal |
| **Fey Wild** | Greens and golds, organic shapes |
| **Infernal** | Reds and blacks, sharp edges |

### Customizable Properties

- Page background (color, texture, image)
- Heading and body fonts
- Accent colors
- Page border style
- Drop cap styling

### CSS Architecture

- Base styles in shared stylesheet
- Theme CSS custom properties for colors, fonts, spacing
- Per-block component CSS
- Print-specific styles via `@media print` and separate export stylesheets

## Export Pipeline

```
User clicks "Export" → API creates ExportJob (queued)
    → Bull queue picks up job
    → Worker assembles HTML:
        1. Load project settings + theme CSS
        2. Serialize TipTap JSON → HTML per document
        3. Resolve asset URLs
        4. Inject page structure (ToC, title page, headers/footers)
    → Generate output:
        PDF:       Puppeteer page.pdf() with print media
        Print PDF: + 3mm bleed, crop marks, CMYK-safe, 300 DPI
        ePub:      Pandoc HTML → ePub with custom CSS
    → Upload to storage
    → Update ExportJob (completed + output_url)
    → Frontend polls, shows download
```

### DriveThruRPG/DMsGuild Compliance

- PDF/A output option
- Embedded fonts
- Proper PDF metadata (title, author, keywords)
- Print-ready: 8.5x11" with 0.125" bleed
- Image DPI warnings below 300

## Project Structure

```
DND_booker/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── editor/        # TipTap editor & toolbar
│   │   │   ├── blocks/        # D&D block node views
│   │   │   ├── sidebar/       # Block palette, properties panel
│   │   │   ├── preview/       # Live document preview
│   │   │   ├── projects/      # Project management UI
│   │   │   ├── templates/     # Template gallery
│   │   │   └── auth/          # Login/register forms
│   │   ├── hooks/
│   │   ├── stores/            # Zustand state
│   │   ├── styles/            # Tailwind + D&D themes
│   │   ├── lib/               # API client, utils
│   │   └── App.tsx
│   ├── public/fonts/
│   └── package.json
│
├── server/                    # Express API service
│   ├── src/
│   │   ├── routes/
│   │   ├── models/            # Prisma models
│   │   ├── middleware/
│   │   ├── services/
│   │   └── config/
│   └── package.json
│
├── worker/                    # PDF generation worker
│   ├── src/
│   │   ├── jobs/
│   │   ├── renderers/
│   │   ├── templates/
│   │   └── themes/
│   └── package.json
│
├── shared/                    # Shared types and utilities
│   ├── types/
│   └── constants/
│
├── docker-compose.yml
├── .env.example
└── README.md
```
