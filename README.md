# DND Booker

A web application for creating D&D campaign material formatted for publication on DriveThruRPG and DMsGuild. Features a WYSIWYG block editor with 22 custom D&D block types, 5 visual themes, and multi-format export (PDF, print-ready PDF, ePub).

## Architecture

```
Client (React + TipTap)  -->  API Server (Express + Prisma)  -->  PDF Worker (Puppeteer + Pandoc)
       :3000                         :4000                              BullMQ
                                       |
                              PostgreSQL + Redis
```

| Package | Tech | Purpose |
|---------|------|---------|
| `client/` | React, TipTap v3, Zustand, Tailwind CSS v4, Vite | WYSIWYG editor & UI |
| `server/` | Express 5, Prisma 6, JWT, Zod | REST API & auth |
| `worker/` | Puppeteer 24, Pandoc, BullMQ | PDF/ePub generation |
| `shared/` | TypeScript | Shared types & constants |

## Quick Start (Docker)

```bash
# Clone and start all services
git clone https://github.com/mnem0nic7/DND_booker.git
cd DND_booker
docker compose up -d

# Run database migrations (first time only)
docker compose exec server npx prisma migrate dev --name init

# Seed starter templates
docker compose exec server npx prisma db seed

# Open the app
open http://localhost:3000
```

## Local Development

```bash
# Prerequisites: Node.js 20+, PostgreSQL 16, Redis 7

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start Postgres & Redis
docker compose up -d postgres redis

# Run database migrations
cd server && npx prisma migrate dev --name init && cd ..

# Seed templates
cd server && npx prisma db seed && cd ..

# Start all services (in separate terminals)
npm run dev --workspace=server    # API on :4000
npm run dev --workspace=client    # UI on :3000
npm run dev --workspace=worker    # PDF worker
```

## Features

### Block Editor
22 custom D&D block types organized into categories:

**D&D Blocks:** Stat Block, Read Aloud Box, Sidebar Callout, Chapter Header, Spell Card, Magic Item, Random Table, NPC Profile, Encounter Table, Class Feature, Race Block

**Layout Blocks:** Full Bleed Image, Map, Handout, Page Border, Page Break, Column Break

**Structure Blocks:** Title Page, Table of Contents, Credits Page, Back Cover

### Themes
5 built-in CSS variable-based themes:
- **Classic Parchment** - Traditional D&D look (Cinzel/Crimson Text)
- **Dark Tome** - Dark mode spellbook (Uncial Antiqua/EB Garamond)
- **Clean Modern** - Modern RPG layout (Inter/Merriweather)
- **Fey Wild** - Fairy/nature theme (Dancing Script/Lora)
- **Infernal** - Demon/hell theme (Pirata One/Bitter)

### Export
- **PDF** - Letter-sized with page numbers
- **Print-Ready PDF** - With 0.125" bleed margins and crop marks
- **ePub** - Via Pandoc conversion

### Templates
4 starter templates:
- Blank Campaign (title, ToC, 3 chapters, credits, back cover)
- Blank One-Shot (title, ToC, 1 chapter, credits)
- Blank Supplement (title, ToC, 2 chapters, credits)
- Blank Sourcebook (title, ToC, 4 chapters with class/race blocks, credits, back cover)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Refresh JWT |
| POST | `/api/auth/logout` | Logout |
| GET/POST | `/api/projects` | List/create projects |
| GET/PUT/DELETE | `/api/projects/:id` | Project CRUD |
| GET/POST | `/api/projects/:id/documents` | List/create documents |
| GET/PUT/DELETE | `/api/documents/:id` | Document CRUD |
| POST | `/api/documents/reorder` | Reorder documents |
| POST | `/api/projects/:id/export` | Start export job |
| GET | `/api/export-jobs/:id` | Check export status |
| GET | `/api/templates` | List templates |
| GET/POST | `/api/projects/:id/assets` | List/upload assets |
| DELETE | `/api/assets/:id` | Delete asset |

## Environment Variables

See [.env.example](.env.example) for all configuration options.

## Project Structure

```
DND_booker/
├── client/                   # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/         # Login, register, protected routes
│   │   │   ├── blocks/       # 22 TipTap custom block components
│   │   │   ├── editor/       # EditorLayout, Toolbar, ThemePicker, ExportDialog
│   │   │   ├── preview/      # Live preview panel
│   │   │   ├── projects/     # Project cards, create modal
│   │   │   ├── sidebar/      # Block palette
│   │   │   └── templates/    # Template gallery
│   │   ├── pages/            # Dashboard, Editor, Login, Register
│   │   ├── stores/           # Zustand stores (auth, project, document, theme, export)
│   │   └── styles/           # Block CSS + 5 theme CSS files
│   ├── Dockerfile
│   └── nginx.conf
├── server/                   # Express API
│   ├── prisma/
│   │   ├── schema.prisma     # 6 models, 4 enums
│   │   └── seed.ts           # 4 starter templates
│   ├── src/
│   │   ├── config/           # Database, Redis
│   │   ├── middleware/       # JWT auth
│   │   ├── routes/           # Auth, projects, documents, exports, templates, assets
│   │   └── services/         # Business logic
│   └── Dockerfile
├── worker/                   # PDF export worker
│   ├── src/
│   │   ├── config/           # Database
│   │   ├── generators/       # PDF, print-PDF, ePub generators
│   │   ├── jobs/             # BullMQ job processor
│   │   └── renderers/        # TipTap JSON-to-HTML, HTML assembler
│   └── Dockerfile
├── shared/                   # Shared TypeScript types
├── docker-compose.yml        # Full stack: Postgres, Redis, server, worker, client
└── docs/plans/               # Design doc & implementation plan
```

## License

MIT
