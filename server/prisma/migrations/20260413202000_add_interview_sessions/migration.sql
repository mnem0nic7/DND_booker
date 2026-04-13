CREATE TABLE "interview_sessions" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'collecting',
  "turns" JSONB NOT NULL DEFAULT '[]',
  "brief_draft" JSONB,
  "locked_brief" JSONB,
  "max_user_turns" INTEGER NOT NULL DEFAULT 8,
  "locked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "interview_sessions_project_id_user_id_key" ON "interview_sessions"("project_id", "user_id");
CREATE INDEX "interview_sessions_project_id_idx" ON "interview_sessions"("project_id");
CREATE INDEX "interview_sessions_user_id_idx" ON "interview_sessions"("user_id");

ALTER TABLE "interview_sessions"
ADD CONSTRAINT "interview_sessions_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interview_sessions"
ADD CONSTRAINT "interview_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
