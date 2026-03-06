This project is DND Booker: a full-stack web app for writing, organizing, and exporting Dungeons & Dragons campaign material and publishable books.

At a high level, it gives users a rich WYSIWYG editor for D&D-specific content like stat blocks, spell cards, NPC profiles, random tables, title pages, and other custom block types. It also includes multiple visual themes, project/document management, and export pipelines for PDF, print-ready PDF, and ePub.

The architecture is a monorepo with four packages:
- client: React + TipTap editor UI
- server: Express API with auth, project/document CRUD, AI endpoints, and Prisma
- worker: background export jobs for PDF/ePub generation
- shared: shared TypeScript types/constants

A big part of the product is the built-in AI assistant. Users can connect their own Anthropic or OpenAI API keys, chat in the editor, generate D&D content blocks, and auto-fill empty fields. The app also handles auth, templates, assets, and export job tracking.

So in plain terms: it’s a D&D content authoring and publishing tool, aimed at producing polished material for places like DriveThruRPG and DMsGuild.

If you want, I can also give you one of these next:
1. a 2-minute tour of how the codebase is organized
2. a frontend/backend/data-flow breakdown
3. the quickest way to run it locally
