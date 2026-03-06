-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'planning', 'generating_assets', 'generating_prose', 'evaluating', 'revising', 'assembling', 'completed', 'failed', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "GenerationMode" AS ENUM ('one_shot', 'module', 'campaign', 'sourcebook');

-- CreateEnum
CREATE TYPE "GenerationQuality" AS ENUM ('quick', 'polished');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('queued', 'blocked', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('queued', 'generating', 'generated', 'evaluating', 'passed', 'failed_evaluation', 'revising', 'accepted', 'rejected', 'assembled');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('front_matter', 'chapter', 'appendix', 'back_matter');

-- CreateTable
CREATE TABLE "generation_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" "GenerationMode" NOT NULL,
    "quality" "GenerationQuality" NOT NULL DEFAULT 'quick',
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "current_stage" TEXT,
    "input_prompt" TEXT NOT NULL,
    "input_parameters" JSONB,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "estimated_pages" INTEGER,
    "estimated_tokens" INTEGER,
    "estimated_cost" DOUBLE PRECISION,
    "actual_tokens" INTEGER NOT NULL DEFAULT 0,
    "actual_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "metrics_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_tasks" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "parent_task_id" TEXT,
    "task_type" TEXT NOT NULL,
    "artifact_type" TEXT,
    "artifact_key" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 2,
    "depends_on" JSONB NOT NULL DEFAULT '[]',
    "input_payload" JSONB,
    "result_payload" JSONB,
    "error_message" TEXT,
    "token_count" INTEGER,
    "cost_estimate" DOUBLE PRECISION,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_bibles" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "premise" TEXT,
    "world_rules" JSONB,
    "act_structure" JSONB,
    "timeline" JSONB,
    "level_progression" JSONB,
    "page_budget" JSONB,
    "style_guide" JSONB,
    "open_threads" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_bibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canon_entities" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "canonical_data" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "source_artifact_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canon_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canon_references" (
    "id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "reference_type" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "canon_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_artifacts" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_task_id" TEXT,
    "artifact_type" TEXT NOT NULL,
    "artifact_key" TEXT NOT NULL,
    "parent_artifact_id" TEXT,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'queued',
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "json_content" JSONB,
    "markdown_content" TEXT,
    "tiptap_content" JSONB,
    "metadata" JSONB,
    "page_estimate" INTEGER,
    "token_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifact_evaluations" (
    "id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "artifact_version" INTEGER NOT NULL,
    "evaluation_type" TEXT NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL,
    "structural_completeness" DOUBLE PRECISION,
    "continuity_score" DOUBLE PRECISION,
    "dnd_sanity" DOUBLE PRECISION,
    "editorial_quality" DOUBLE PRECISION,
    "publication_fit" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL,
    "findings" JSONB NOT NULL,
    "recommended_actions" JSONB,
    "evaluator_model" TEXT,
    "token_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifact_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifact_revisions" (
    "id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "from_version" INTEGER NOT NULL,
    "to_version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "finding_codes" JSONB,
    "revision_prompt" TEXT,
    "token_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifact_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_manifests" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "documents" JSONB NOT NULL,
    "assembly_rules" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assembly_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_documents" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "run_id" TEXT,
    "kind" "DocumentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "target_page_count" INTEGER,
    "outline_json" JSONB,
    "content" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "source_artifact_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generation_runs_project_id_idx" ON "generation_runs"("project_id");

-- CreateIndex
CREATE INDEX "generation_runs_user_id_idx" ON "generation_runs"("user_id");

-- CreateIndex
CREATE INDEX "generation_runs_status_idx" ON "generation_runs"("status");

-- CreateIndex
CREATE INDEX "generation_tasks_run_id_idx" ON "generation_tasks"("run_id");

-- CreateIndex
CREATE INDEX "generation_tasks_run_id_status_idx" ON "generation_tasks"("run_id", "status");

-- CreateIndex
CREATE INDEX "generation_tasks_parent_task_id_idx" ON "generation_tasks"("parent_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_bibles_run_id_key" ON "campaign_bibles"("run_id");

-- CreateIndex
CREATE INDEX "campaign_bibles_project_id_idx" ON "campaign_bibles"("project_id");

-- CreateIndex
CREATE INDEX "canon_entities_project_id_idx" ON "canon_entities"("project_id");

-- CreateIndex
CREATE INDEX "canon_entities_run_id_idx" ON "canon_entities"("run_id");

-- CreateIndex
CREATE INDEX "canon_entities_entity_type_idx" ON "canon_entities"("entity_type");

-- CreateIndex
CREATE UNIQUE INDEX "canon_entities_run_id_entity_type_slug_key" ON "canon_entities"("run_id", "entity_type", "slug");

-- CreateIndex
CREATE INDEX "canon_references_entity_id_idx" ON "canon_references"("entity_id");

-- CreateIndex
CREATE INDEX "canon_references_artifact_id_idx" ON "canon_references"("artifact_id");

-- CreateIndex
CREATE INDEX "generated_artifacts_run_id_idx" ON "generated_artifacts"("run_id");

-- CreateIndex
CREATE INDEX "generated_artifacts_project_id_idx" ON "generated_artifacts"("project_id");

-- CreateIndex
CREATE INDEX "generated_artifacts_artifact_type_idx" ON "generated_artifacts"("artifact_type");

-- CreateIndex
CREATE INDEX "generated_artifacts_status_idx" ON "generated_artifacts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "generated_artifacts_run_id_artifact_type_artifact_key_versi_key" ON "generated_artifacts"("run_id", "artifact_type", "artifact_key", "version");

-- CreateIndex
CREATE INDEX "artifact_evaluations_artifact_id_idx" ON "artifact_evaluations"("artifact_id");

-- CreateIndex
CREATE INDEX "artifact_revisions_artifact_id_idx" ON "artifact_revisions"("artifact_id");

-- CreateIndex
CREATE INDEX "assembly_manifests_run_id_idx" ON "assembly_manifests"("run_id");

-- CreateIndex
CREATE INDEX "project_documents_project_id_idx" ON "project_documents"("project_id");

-- CreateIndex
CREATE INDEX "project_documents_project_id_sort_order_idx" ON "project_documents"("project_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "project_documents_project_id_slug_key" ON "project_documents"("project_id", "slug");

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "generation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "generation_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_bibles" ADD CONSTRAINT "campaign_bibles_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "generation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_bibles" ADD CONSTRAINT "campaign_bibles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_entities" ADD CONSTRAINT "canon_entities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_entities" ADD CONSTRAINT "canon_entities_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "generation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_references" ADD CONSTRAINT "canon_references_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "canon_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canon_references" ADD CONSTRAINT "canon_references_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "generated_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifacts" ADD CONSTRAINT "generated_artifacts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "generation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifacts" ADD CONSTRAINT "generated_artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifacts" ADD CONSTRAINT "generated_artifacts_parent_artifact_id_fkey" FOREIGN KEY ("parent_artifact_id") REFERENCES "generated_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_evaluations" ADD CONSTRAINT "artifact_evaluations_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "generated_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "generated_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_manifests" ADD CONSTRAINT "assembly_manifests_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "generation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
