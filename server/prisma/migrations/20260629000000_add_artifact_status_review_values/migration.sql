-- The ArtifactStatus enum was created without the `needs_revision` and
-- `needs_review` values, but the Prisma schema and generation code both use
-- them: reviser.service escalates exhausted artifacts to `needs_review`, and the
-- critic/rewrite loop transitions through `needs_revision`. On a migration-built
-- database these writes fail with `invalid input value for enum`, crashing the
-- escalation path. Add the missing values to restore schema/database parity.
ALTER TYPE "ArtifactStatus" ADD VALUE IF NOT EXISTS 'needs_revision';
ALTER TYPE "ArtifactStatus" ADD VALUE IF NOT EXISTS 'needs_review';
