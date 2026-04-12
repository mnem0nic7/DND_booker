-- CreateEnum
CREATE TYPE "ImprovementLoopRole" AS ENUM ('creator', 'designer', 'editor', 'engineer');

-- CreateEnum
CREATE TYPE "ImprovementLoopRoleRunStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "improvement_loop_role_runs" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ImprovementLoopRole" NOT NULL,
    "status" "ImprovementLoopRoleRunStatus" NOT NULL DEFAULT 'queued',
    "objective" TEXT NOT NULL,
    "input_json" JSONB,
    "linked_generation_run_id" TEXT,
    "linked_agent_run_id" TEXT,
    "output_artifact_ids_json" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "improvement_loop_role_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "improvement_loop_role_runs_run_id_role_key" ON "improvement_loop_role_runs"("run_id", "role");

-- CreateIndex
CREATE INDEX "improvement_loop_role_runs_run_id_idx" ON "improvement_loop_role_runs"("run_id");

-- CreateIndex
CREATE INDEX "improvement_loop_role_runs_project_id_idx" ON "improvement_loop_role_runs"("project_id");

-- CreateIndex
CREATE INDEX "improvement_loop_role_runs_user_id_idx" ON "improvement_loop_role_runs"("user_id");

-- CreateIndex
CREATE INDEX "improvement_loop_role_runs_role_idx" ON "improvement_loop_role_runs"("role");

-- CreateIndex
CREATE INDEX "improvement_loop_role_runs_status_idx" ON "improvement_loop_role_runs"("status");

-- AddForeignKey
ALTER TABLE "improvement_loop_role_runs" ADD CONSTRAINT "improvement_loop_role_runs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "improvement_loop_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_loop_role_runs" ADD CONSTRAINT "improvement_loop_role_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_loop_role_runs" ADD CONSTRAINT "improvement_loop_role_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_loop_role_runs" ADD CONSTRAINT "improvement_loop_role_runs_linked_generation_run_id_fkey" FOREIGN KEY ("linked_generation_run_id") REFERENCES "generation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_loop_role_runs" ADD CONSTRAINT "improvement_loop_role_runs_linked_agent_run_id_fkey" FOREIGN KEY ("linked_agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
