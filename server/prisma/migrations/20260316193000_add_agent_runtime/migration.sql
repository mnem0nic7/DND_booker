-- CreateEnum
CREATE TYPE "AgentRunMode" AS ENUM ('background_producer', 'persistent_editor');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('queued', 'seeding', 'observing', 'planning', 'acting', 'evaluating', 'checkpointing', 'completed', 'failed', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "linked_generation_run_id" TEXT,
    "mode" "AgentRunMode" NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'queued',
    "current_stage" TEXT,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "goal_json" JSONB NOT NULL,
    "budget_json" JSONB NOT NULL,
    "critique_backlog_json" JSONB NOT NULL DEFAULT '[]',
    "latest_scorecard_json" JSONB,
    "design_profile_json" JSONB,
    "best_checkpoint_id" TEXT,
    "latest_checkpoint_id" TEXT,
    "current_strategy" TEXT,
    "cycle_count" INTEGER NOT NULL DEFAULT 0,
    "export_count" INTEGER NOT NULL DEFAULT 0,
    "no_improvement_streak" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_checkpoints" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "summary" TEXT,
    "cycle_index" INTEGER NOT NULL DEFAULT 0,
    "is_best" BOOLEAN NOT NULL DEFAULT false,
    "scorecard_json" JSONB,
    "project_snapshot_json" JSONB NOT NULL,
    "documents_snapshot_json" JSONB NOT NULL,
    "assets_snapshot_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "cycle_index" INTEGER NOT NULL DEFAULT 0,
    "action_type" TEXT NOT NULL,
    "status" "AgentActionStatus" NOT NULL DEFAULT 'queued',
    "rationale" TEXT,
    "input_json" JSONB,
    "result_json" JSONB,
    "score_delta" DOUBLE PRECISION,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_observations" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "cycle_index" INTEGER NOT NULL DEFAULT 0,
    "observation_type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_decisions" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "cycle_index" INTEGER NOT NULL DEFAULT 0,
    "decision_type" TEXT NOT NULL,
    "chosen_action_type" TEXT,
    "rationale" TEXT NOT NULL,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_runs_project_id_idx" ON "agent_runs"("project_id");
CREATE INDEX "agent_runs_user_id_idx" ON "agent_runs"("user_id");
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");
CREATE INDEX "agent_checkpoints_run_id_idx" ON "agent_checkpoints"("run_id");
CREATE INDEX "agent_checkpoints_project_id_idx" ON "agent_checkpoints"("project_id");
CREATE INDEX "agent_checkpoints_run_id_created_at_idx" ON "agent_checkpoints"("run_id", "created_at");
CREATE INDEX "agent_actions_run_id_idx" ON "agent_actions"("run_id");
CREATE INDEX "agent_actions_run_id_cycle_index_idx" ON "agent_actions"("run_id", "cycle_index");
CREATE INDEX "agent_observations_run_id_idx" ON "agent_observations"("run_id");
CREATE INDEX "agent_observations_run_id_cycle_index_idx" ON "agent_observations"("run_id", "cycle_index");
CREATE INDEX "agent_decisions_run_id_idx" ON "agent_decisions"("run_id");
CREATE INDEX "agent_decisions_run_id_cycle_index_idx" ON "agent_decisions"("run_id", "cycle_index");

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_linked_generation_run_id_fkey" FOREIGN KEY ("linked_generation_run_id") REFERENCES "generation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_checkpoints" ADD CONSTRAINT "agent_checkpoints_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_checkpoints" ADD CONSTRAINT "agent_checkpoints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_observations" ADD CONSTRAINT "agent_observations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
