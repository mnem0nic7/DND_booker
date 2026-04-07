ALTER TABLE "generation_runs"
ADD COLUMN "graph_thread_id" TEXT,
ADD COLUMN "graph_checkpoint_key" TEXT,
ADD COLUMN "graph_state_json" JSONB,
ADD COLUMN "resume_token" TEXT;

ALTER TABLE "agent_runs"
ADD COLUMN "graph_thread_id" TEXT,
ADD COLUMN "graph_checkpoint_key" TEXT,
ADD COLUMN "graph_state_json" JSONB,
ADD COLUMN "resume_token" TEXT;

CREATE INDEX "generation_runs_graph_thread_id_idx" ON "generation_runs"("graph_thread_id");
CREATE INDEX "generation_runs_graph_checkpoint_key_idx" ON "generation_runs"("graph_checkpoint_key");
CREATE INDEX "agent_runs_graph_thread_id_idx" ON "agent_runs"("graph_thread_id");
CREATE INDEX "agent_runs_graph_checkpoint_key_idx" ON "agent_runs"("graph_checkpoint_key");
