-- CreateTable
CREATE TABLE "ai_tool_audits" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "tool_name" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "result_status" TEXT NOT NULL,
    "old_content_hash" TEXT,
    "new_content_hash" TEXT,
    "old_updated_at" TIMESTAMP(3),
    "new_updated_at" TIMESTAMP(3),
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_tool_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_chunks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "block_type" TEXT NOT NULL,
    "heading_path" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attrs" JSONB NOT NULL DEFAULT '{}',
    "node_index" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_tool_audits_user_id_idx" ON "ai_tool_audits"("user_id");

-- CreateIndex
CREATE INDEX "ai_tool_audits_project_id_idx" ON "ai_tool_audits"("project_id");

-- CreateIndex
CREATE INDEX "ai_tool_audits_tool_name_idx" ON "ai_tool_audits"("tool_name");

-- CreateIndex
CREATE INDEX "ai_tool_audits_created_at_idx" ON "ai_tool_audits"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "content_chunks_project_id_chunk_id_key" ON "content_chunks"("project_id", "chunk_id");

-- CreateIndex
CREATE INDEX "content_chunks_project_id_idx" ON "content_chunks"("project_id");

-- AddForeignKey
ALTER TABLE "content_chunks" ADD CONSTRAINT "content_chunks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
