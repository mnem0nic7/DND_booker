# DND Booker

A web application for creating D&D campaign material formatted for publication on DriveThruRPG and DMsGuild. Features a WYSIWYG block editor with 22 custom D&D block types, 5 visual themes, multi-format export (PDF, print-ready PDF, ePub), and an AI assistant that generates D&D content.

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
| `server/` | Express 5, Prisma 6, JWT, Zod, Vercel AI SDK | REST API, auth & AI |
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

## Deploying Changes

Use the Docker Compose service that matches the code you changed:

```bash
# Client-only changes
docker compose build client
docker compose up -d client

# Server-only changes
docker compose build server
docker compose up -d server

# Worker-only changes
docker compose build worker
docker compose up -d worker

# shared/ changes or cross-cutting changes spanning multiple packages
docker compose build server worker client
docker compose up -d server worker client
```

If a change touches `shared/`, rebuild every app service that imports it. If a change touches both generation logic and export rendering, treat it as a `server` + `worker` redeploy even when the UI also changed.

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

### AI Assistant
Built-in AI assistant powered by the Vercel AI SDK with support for **Anthropic Claude** and **OpenAI GPT** models. Users bring their own API keys (stored encrypted with AES-256-GCM).

**Chat Panel** — Streaming AI chat sidebar in the editor for discussing campaign ideas, asking D&D rules questions, and generating content interactively. Chat history is persisted per-project.

**Block Generation** — AI-powered generation for 10 D&D content block types:
- Stat Block, Spell Card, Magic Item, NPC Profile
- Random Table, Encounter Table, Class Feature, Race Block
- Handout, Back Cover

**Auto-Fill** — Smart suggestions for empty block fields based on existing content. Click "Auto-Fill" on any supported block to get AI-suggested values.

**Setup:** Open the AI settings (gear icon in editor toolbar), select a provider, enter your API key, and start generating.

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
| GET/POST | `/api/ai/settings` | Get/save AI provider settings |
| DELETE | `/api/ai/settings/key` | Remove stored API key |
| POST | `/api/ai/settings/validate` | Test API key against provider |
| POST | `/api/ai/generate-block` | Generate block attrs with AI |
| POST | `/api/ai/autofill` | Suggest values for empty fields |
| GET/POST/DELETE | `/api/projects/:id/ai/chat` | AI chat history & streaming |

## Environment Variables

See [.env.example](.env.example) for all configuration options.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | Yes | Redis connection |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Yes | JWT signing secrets |
| `PORT` | No | API server port (default: 4000) |
| `CLIENT_URL` | No | Frontend URL (default: http://localhost:3000) |
| `AI_KEY_ENCRYPTION_SECRET` | Yes | 64-char hex string for encrypting user API keys. Generate with `openssl rand -hex 32` |
| `S3_BUCKET` / `S3_REGION` | No | Asset storage (S3-compatible) |

## Project Structure

```
DND_booker/
├── client/                   # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/         # Login, register, protected routes
│   │   │   ├── blocks/       # 22 TipTap custom block components
│   │   │   ├── ai/           # AI chat panel, settings modal, generate/auto-fill buttons
│   │   │   ├── editor/       # EditorLayout, Toolbar, ThemePicker, ExportDialog
│   │   │   ├── preview/      # Live preview panel
│   │   │   ├── projects/     # Project cards, create modal
│   │   │   ├── sidebar/      # Block palette
│   │   │   └── templates/    # Template gallery
│   │   ├── pages/            # Dashboard, Editor, Login, Register
│   │   ├── stores/           # Zustand stores (auth, project, document, theme, export, ai)
│   │   └── styles/           # Block CSS + 5 theme CSS files
│   ├── Dockerfile
│   └── nginx.conf
├── server/                   # Express API
│   ├── prisma/
│   │   ├── schema.prisma     # 8 models, 4 enums
│   │   └── seed.ts           # 4 starter templates
│   ├── src/
│   │   ├── config/           # Database, Redis
│   │   ├── middleware/       # JWT auth, AI rate limiting
│   │   ├── routes/           # Auth, projects, documents, exports, templates, assets, AI
│   │   ├── services/         # Business logic, AI provider/chat/content/settings
│   │   ├── utils/            # Encryption (AES-256-GCM for API keys)
│   │   └── __tests__/        # Integration & unit tests (Vitest + Supertest)
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

## Testing

```bash
# Run all server tests (requires running PostgreSQL + Redis)
cd server && npm test

# Run specific test file
cd server && npx vitest run src/__tests__/ai-content.test.ts
```

Test coverage:
- **Auth API** — Registration, login, token refresh, logout (10 tests)
- **Projects API** — CRUD operations, authorization (15 tests)
- **Documents API** — CRUD, reordering, authorization (20 tests)
- **AI Content Service** — Prompt building, JSON parsing, block types (25 unit tests)
- **Encryption** — AES-256-GCM round-trip, tamper detection, key validation (14 unit tests)
- **AI Routes** — Settings CRUD, chat, block generation, autofill validation (32 integration tests)

## License

MIT
