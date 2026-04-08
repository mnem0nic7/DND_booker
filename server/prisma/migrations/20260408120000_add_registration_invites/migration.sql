CREATE TABLE "registration_invites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "note" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "registration_invites_email_key" ON "registration_invites"("email");
CREATE INDEX "registration_invites_revoked_at_idx" ON "registration_invites"("revoked_at");
