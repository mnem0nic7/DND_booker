-- CreateTable
CREATE TABLE "ai_working_memories" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bullets" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_working_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_memory_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_memory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_task_plans" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tasks" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_task_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_working_memories_project_id_user_id_key" ON "ai_working_memories"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "ai_memory_items_user_id_idx" ON "ai_memory_items"("user_id");

-- CreateIndex
CREATE INDEX "ai_memory_items_user_id_project_id_idx" ON "ai_memory_items"("user_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_task_plans_project_id_user_id_key" ON "ai_task_plans"("project_id", "user_id");

-- AddForeignKey
ALTER TABLE "ai_working_memories" ADD CONSTRAINT "ai_working_memories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_working_memories" ADD CONSTRAINT "ai_working_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_memory_items" ADD CONSTRAINT "ai_memory_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_memory_items" ADD CONSTRAINT "ai_memory_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_task_plans" ADD CONSTRAINT "ai_task_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_task_plans" ADD CONSTRAINT "ai_task_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
