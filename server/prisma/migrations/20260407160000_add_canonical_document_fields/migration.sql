-- Add canonical publication document storage alongside the legacy TipTap content.
ALTER TABLE "project_documents"
ADD COLUMN "canonical_doc_json" JSONB,
ADD COLUMN "editor_projection_json" JSONB,
ADD COLUMN "typst_source" TEXT,
ADD COLUMN "canonical_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "editor_projection_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "typst_version" INTEGER NOT NULL DEFAULT 1;
