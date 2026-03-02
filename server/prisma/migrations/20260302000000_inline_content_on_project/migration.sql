-- Step 1: Add content column to projects
ALTER TABLE "projects" ADD COLUMN "content" JSONB NOT NULL DEFAULT '{}';

-- Step 2: Migrate document content into project content
-- For projects with 0 documents: set blank TipTap doc
-- For projects with 1 document: copy that document's content
-- For projects with N documents: concatenate with pageBreak nodes between them

-- First, handle single-document projects (most common case)
UPDATE "projects" p
SET "content" = d."content"
FROM "documents" d
WHERE d."project_id" = p."id"
AND (SELECT COUNT(*) FROM "documents" WHERE "project_id" = p."id") = 1;

-- Handle multi-document projects by merging content arrays with pageBreak separators
-- Uses a CTE to build the merged JSON for each project
WITH multi_doc_projects AS (
  SELECT "project_id", COUNT(*) as doc_count
  FROM "documents"
  GROUP BY "project_id"
  HAVING COUNT(*) > 1
),
ordered_docs AS (
  SELECT
    d."project_id",
    d."content",
    d."sort_order",
    ROW_NUMBER() OVER (PARTITION BY d."project_id" ORDER BY d."sort_order") as rn,
    mdp.doc_count
  FROM "documents" d
  JOIN multi_doc_projects mdp ON mdp."project_id" = d."project_id"
),
merged_content AS (
  SELECT
    "project_id",
    jsonb_build_object(
      'type', 'doc',
      'content', (
        SELECT jsonb_agg(elem ORDER BY sub.sort_order, sub.elem_order)
        FROM (
          SELECT
            od2.sort_order,
            elem,
            ROW_NUMBER() OVER (PARTITION BY od2.sort_order) as elem_order
          FROM ordered_docs od2,
          LATERAL jsonb_array_elements(
            CASE
              WHEN od2."content" ? 'content' THEN od2."content"->'content'
              ELSE '[]'::jsonb
            END
          ) AS elem
          WHERE od2."project_id" = ordered_docs."project_id"

          UNION ALL

          -- Insert pageBreak between documents (not after the last one)
          SELECT
            od3.sort_order + 0.5 as sort_order,
            '{"type": "pageBreak"}'::jsonb as elem,
            1 as elem_order
          FROM ordered_docs od3
          WHERE od3."project_id" = ordered_docs."project_id"
            AND od3.rn < od3.doc_count
        ) sub
      )
    ) as merged
  FROM ordered_docs
  GROUP BY "project_id"
)
UPDATE "projects" p
SET "content" = mc.merged
FROM merged_content mc
WHERE mc."project_id" = p."id";

-- Handle projects with 0 documents: set a blank TipTap doc
UPDATE "projects"
SET "content" = '{"type": "doc", "content": [{"type": "paragraph"}]}'::jsonb
WHERE "content" = '{}'::jsonb;

-- Step 3: Drop the documents table
DROP TABLE "documents";
