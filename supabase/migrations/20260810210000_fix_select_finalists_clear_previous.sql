-- select_finalists previously only set is_finalist=true for the top N and never
-- cleared prior finalists. Concurrent or repeated selection could accumulate
-- more finalists than top_n (e.g. expected 3, found 4).

BEGIN;

CREATE OR REPLACE FUNCTION marketing.select_finalists(
  p_task_id uuid,
  p_top_n integer DEFAULT 10
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  finalist_count INTEGER;
BEGIN
  UPDATE marketing.outputs
  SET is_finalist = false,
      updated_at = NOW()
  WHERE task_id = p_task_id
    AND is_finalist = true;

  WITH ranked AS (
    SELECT id
    FROM marketing.outputs
    WHERE task_id = p_task_id
      AND initial_rank IS NOT NULL
    ORDER BY initial_rank
    LIMIT p_top_n
  )
  UPDATE marketing.outputs o
  SET is_finalist = true,
      updated_at = NOW()
  FROM ranked r
  WHERE o.id = r.id;

  GET DIAGNOSTICS finalist_count = ROW_COUNT;
  RETURN finalist_count;
END;
$$;

COMMIT;
