-- Fix duplicate training_progress rows.
--
-- The table lacks a unique constraint on (user_id, quiz_id, song_ann_id),
-- so multiple rows for the same song can accumulate. The .single() lookup
-- errors on duplicates, causing the code to fall into the INSERT branch
-- and create yet more duplicates (a self-reinforcing cycle).
--
-- 1. Merge duplicate rows: for each (user_id, quiz_id, song_ann_id) group,
--    keep the row with the highest attempt_count and aggregate stats.
-- 2. Delete the extra rows.
-- 3. Add a partial unique index on (user_id, quiz_id, song_ann_id) to
--    prevent future duplicates at the database level.

-- Step 1: Aggregate stats from duplicates into the "winner" row.
WITH ranked AS (
  SELECT
    id,
    user_id,
    quiz_id,
    song_ann_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, quiz_id, song_ann_id
      ORDER BY attempt_count DESC NULLS LAST,
               last_attempt_at DESC NULLS LAST,
               created_at ASC
    ) AS rn
  FROM training_progress
  WHERE song_ann_id IS NOT NULL
),
aggregated AS (
  SELECT
    tp.user_id,
    tp.quiz_id,
    tp.song_ann_id,
    SUM(tp.attempt_count)  AS total_attempts,
    SUM(tp.success_count)  AS total_success,
    SUM(tp.failure_count)  AS total_failure
  FROM training_progress tp
  INNER JOIN ranked r ON r.id = tp.id
  WHERE tp.song_ann_id IS NOT NULL
  GROUP BY tp.user_id, tp.quiz_id, tp.song_ann_id
  HAVING COUNT(*) > 1
)
UPDATE training_progress tp
SET
  attempt_count = agg.total_attempts,
  success_count = agg.total_success,
  failure_count = agg.total_failure
FROM aggregated agg
INNER JOIN ranked r ON r.user_id = agg.user_id
                   AND r.quiz_id = agg.quiz_id
                   AND r.song_ann_id = agg.song_ann_id
                   AND r.rn = 1
WHERE tp.id = r.id;

-- Step 2: Delete the duplicate rows (keep only rn=1 per group).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, quiz_id, song_ann_id
      ORDER BY attempt_count DESC NULLS LAST,
               last_attempt_at DESC NULLS LAST,
               created_at ASC
    ) AS rn
  FROM training_progress
  WHERE song_ann_id IS NOT NULL
)
DELETE FROM training_progress
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 3: Add partial unique index on (user_id, quiz_id, song_ann_id)
-- to prevent future duplicates for the same integer song ID.
CREATE UNIQUE INDEX IF NOT EXISTS idx_training_progress_unique_song_ann_id
ON training_progress(user_id, quiz_id, song_ann_id)
WHERE song_ann_id IS NOT NULL;
