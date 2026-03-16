-- Drop and recreate active_composite_scores view to include scope_id for filtering
DROP VIEW IF EXISTS risk.active_composite_scores;
CREATE VIEW risk.active_composite_scores AS
SELECT DISTINCT ON (cs.subject_id)
  cs.*,
  s.scope_id,
  s.identifier AS subject_identifier,
  s.name AS subject_name,
  s.subject_type,
  sc.name AS scope_name,
  sc.domain AS scope_domain
FROM risk.composite_scores cs
JOIN risk.subjects s ON s.id = cs.subject_id
JOIN risk.scopes sc ON sc.id = s.scope_id
WHERE cs.status = 'active'
  AND cs.is_test = false
ORDER BY cs.subject_id, cs.created_at DESC;

-- Drop and recreate pending_learnings view to include scope_id for filtering
DROP VIEW IF EXISTS risk.pending_learnings;
CREATE VIEW risk.pending_learnings AS
SELECT
  lq.*,
  s.identifier AS subject_identifier,
  s.name AS subject_name,
  sc.name AS scope_name
FROM risk.learning_queue lq
LEFT JOIN risk.subjects s ON s.id = lq.subject_id
LEFT JOIN risk.scopes sc ON sc.id = lq.scope_id
WHERE lq.status = 'pending'
  AND lq.is_test = false
ORDER BY lq.created_at DESC;
