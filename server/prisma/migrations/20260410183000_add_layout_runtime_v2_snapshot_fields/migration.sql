ALTER TABLE "project_documents"
ADD COLUMN "layout_snapshot_json" JSONB,
ADD COLUMN "layout_engine_version" INTEGER,
ADD COLUMN "layout_snapshot_updated_at" TIMESTAMPTZ;
