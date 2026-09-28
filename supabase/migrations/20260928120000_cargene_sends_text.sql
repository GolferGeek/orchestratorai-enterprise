-- CarGene reads a data part as a structured request of its own ({skill, ...}).
-- A trigger's call carries its event as data, so CarGene gets text only.
UPDATE public.agents
SET metadata = jsonb_set(metadata, '{a2a,target,send}', '"text"')
WHERE slug = 'cargene';
