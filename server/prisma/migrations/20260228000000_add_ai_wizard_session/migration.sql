-- CreateTable
CREATE TABLE "ai_wizard_sessions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'questionnaire',
    "parameters" JSONB,
    "outline" JSONB,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error_msg" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_wizard_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_wizard_sessions_project_id_idx" ON "ai_wizard_sessions"("project_id");

-- CreateIndex
CREATE INDEX "ai_wizard_sessions_user_id_idx" ON "ai_wizard_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_wizard_sessions_project_id_user_id_key" ON "ai_wizard_sessions"("project_id", "user_id");

-- AddForeignKey
ALTER TABLE "ai_wizard_sessions" ADD CONSTRAINT "ai_wizard_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_wizard_sessions" ADD CONSTRAINT "ai_wizard_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
