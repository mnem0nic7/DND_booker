-- CreateEnum
CREATE TYPE "ImprovementLoopRunMode" AS ENUM ('current_project', 'create_campaign');

-- CreateEnum
CREATE TYPE "ImprovementLoopRunStatus" AS ENUM ('queued', 'bootstrapping_project', 'creator', 'designer', 'editor', 'engineering', 'completed', 'failed', 'paused', 'cancelled');

-- CreateTable
CREATE TABLE "project_github_repo_bindings" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "repository_full_name" TEXT NOT NULL,
    "installation_id" INTEGER NOT NULL,
    "default_branch" TEXT NOT NULL,
    "path_allowlist_json" JSONB NOT NULL DEFAULT '[]',
    "engineering_automation_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_validated_at" TIMESTAMP(3),
    "last_validation_status" TEXT NOT NULL DEFAULT 'unconfigured',
    "last_validation_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_github_repo_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "improvement_loop_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" "ImprovementLoopRunMode" NOT NULL,
    "status" "ImprovementLoopRunStatus" NOT NULL DEFAULT 'queued',
    "current_stage" TEXT,
    "graph_thread_id" TEXT,
    "graph_checkpoint_key" TEXT,
    "graph_state_json" JSONB,
    "resume_token" TEXT,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "input_json" JSONB NOT NULL,
    "linked_generation_run_id" TEXT,
    "linked_agent_run_id" TEXT,
    "creator_report_json" JSONB,
    "designer_ux_notes_json" JSONB,
    "editor_final_report_json" JSONB,
    "engineering_report_json" JSONB,
    "engineering_apply_result_json" JSONB,
    "github_branch_name" TEXT,
    "github_base_branch" TEXT,
    "github_head_sha" TEXT,
    "github_pull_request_number" INTEGER,
    "github_pull_request_url" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "improvement_loop_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "improvement_loop_artifacts" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "artifact_type" TEXT NOT NULL,
    "artifact_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "json_content" JSONB,
    "markdown_content" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "improvement_loop_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_github_repo_bindings_project_id_key" ON "project_github_repo_bindings"("project_id");

-- CreateIndex
CREATE INDEX "project_github_repo_bindings_repository_full_name_idx" ON "project_github_repo_bindings"("repository_full_name");

-- CreateIndex
CREATE INDEX "improvement_loop_runs_project_id_idx" ON "improvement_loop_runs"("project_id");

-- CreateIndex
CREATE INDEX "improvement_loop_runs_user_id_idx" ON "improvement_loop_runs"("user_id");

-- CreateIndex
CREATE INDEX "improvement_loop_runs_status_idx" ON "improvement_loop_runs"("status");

-- CreateIndex
CREATE INDEX "improvement_loop_runs_graph_thread_id_idx" ON "improvement_loop_runs"("graph_thread_id");

-- CreateIndex
CREATE INDEX "improvement_loop_runs_graph_checkpoint_key_idx" ON "improvement_loop_runs"("graph_checkpoint_key");

-- CreateIndex
CREATE UNIQUE INDEX "improvement_loop_artifacts_run_id_artifact_type_artifact_key_ver_key" ON "improvement_loop_artifacts"("run_id", "artifact_type", "artifact_key", "version");

-- CreateIndex
CREATE INDEX "improvement_loop_artifacts_run_id_idx" ON "improvement_loop_artifacts"("run_id");

-- CreateIndex
CREATE INDEX "improvement_loop_artifacts_project_id_idx" ON "improvement_loop_artifacts"("project_id");

-- CreateIndex
CREATE INDEX "improvement_loop_artifacts_artifact_type_idx" ON "improvement_loop_artifacts"("artifact_type");

-- AddForeignKey
ALTER TABLE "project_github_repo_bindings" ADD CONSTRAINT "project_github_repo_bindings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_loop_runs" ADD CONSTRAINT "improvement_loop_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_loop_runs" ADD CONSTRAINT "improvement_loop_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_loop_runs" ADD CONSTRAINT "improvement_loop_runs_linked_generation_run_id_fkey" FOREIGN KEY ("linked_generation_run_id") REFERENCES "generation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_loop_runs" ADD CONSTRAINT "improvement_loop_runs_linked_agent_run_id_fkey" FOREIGN KEY ("linked_agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_loop_artifacts" ADD CONSTRAINT "improvement_loop_artifacts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "improvement_loop_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_loop_artifacts" ADD CONSTRAINT "improvement_loop_artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
