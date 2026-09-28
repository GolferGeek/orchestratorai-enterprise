-- The marketing swarm on the workflow runtime: facets (Jev questions, plus
-- length measured in code), content types with length limits, writers
-- (persona + model), editors (weights + threshold) and evaluators (weights).
-- All editable in the workflow's admin. The old swarm's tables are dropped
-- in a later migration, with its code.
BEGIN;

CREATE TABLE marketing.swarm_facets (
  organization_slug text NOT NULL,
  key               text NOT NULL CHECK (key ~ '^[a-z][a-z0-9-]*$'),
  label             text NOT NULL CHECK (label <> ''),
  description       text NOT NULL CHECK (description <> ''),
  -- jev: a Jev rubric's noul question; length: words/characters against the content type
  source            text NOT NULL CHECK (source IN ('jev', 'length')),
  rubric            text,
  question          text,
  -- rubric input name -> 'draft' | 'brief' | 'evidence'
  inputs            jsonb,
  -- positive: the probability is the score; negative: 1 - probability
  polarity          text NOT NULL DEFAULT 'positive' CHECK (polarity IN ('positive', 'negative')),
  evaluator_only    boolean NOT NULL DEFAULT false,
  active            boolean NOT NULL DEFAULT true,
  display_order     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_slug, key),
  CHECK ((source = 'jev') = (rubric IS NOT NULL AND question IS NOT NULL AND inputs IS NOT NULL))
);

CREATE TABLE marketing.swarm_content_types (
  organization_slug text NOT NULL,
  slug              text NOT NULL,
  name              text NOT NULL CHECK (name <> ''),
  guidance          text NOT NULL CHECK (guidance <> ''),
  min_words         integer NOT NULL CHECK (min_words >= 0),
  max_words         integer NOT NULL CHECK (max_words >= min_words),
  max_chars         integer CHECK (max_chars IS NULL OR max_chars > 0),
  active            boolean NOT NULL DEFAULT true,
  display_order     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_slug, slug)
);

CREATE TABLE marketing.swarm_writers (
  organization_slug text NOT NULL,
  slug              text NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]*$'),
  name              text NOT NULL CHECK (name <> ''),
  description       text,
  persona           text NOT NULL CHECK (persona <> ''),
  provider          text NOT NULL,
  model             text NOT NULL,
  active            boolean NOT NULL DEFAULT true,
  display_order     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_slug, slug),
  CONSTRAINT swarm_writers_known_model FOREIGN KEY (model, provider) REFERENCES public.llm_models (model_name, provider_name)
);

CREATE TABLE marketing.swarm_editors (
  organization_slug text NOT NULL,
  slug              text NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]*$'),
  name              text NOT NULL CHECK (name <> ''),
  description       text,
  -- a draft passes this editor when its weighted facet score reaches this (0-1)
  threshold         numeric(3,2) NOT NULL CHECK (threshold BETWEEN 0 AND 1),
  active            boolean NOT NULL DEFAULT true,
  display_order     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_slug, slug)
);

CREATE TABLE marketing.swarm_evaluators (
  organization_slug text NOT NULL,
  slug              text NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]*$'),
  name              text NOT NULL CHECK (name <> ''),
  description       text,
  active            boolean NOT NULL DEFAULT true,
  display_order     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_slug, slug)
);

-- How much each editor or evaluator cares about each facet (0 = not at all, 5 = most).
CREATE TABLE marketing.swarm_weights (
  organization_slug text NOT NULL,
  owner_kind        text NOT NULL CHECK (owner_kind IN ('editor', 'evaluator')),
  owner_slug        text NOT NULL,
  facet_key         text NOT NULL,
  weight            integer NOT NULL CHECK (weight BETWEEN 0 AND 5),
  PRIMARY KEY (organization_slug, owner_kind, owner_slug, facet_key),
  FOREIGN KEY (organization_slug, facet_key) REFERENCES marketing.swarm_facets (organization_slug, key) ON DELETE CASCADE
);

ALTER TABLE marketing.swarm_facets OWNER TO postgres;
ALTER TABLE marketing.swarm_content_types OWNER TO postgres;
ALTER TABLE marketing.swarm_writers OWNER TO postgres;
ALTER TABLE marketing.swarm_editors OWNER TO postgres;
ALTER TABLE marketing.swarm_evaluators OWNER TO postgres;
ALTER TABLE marketing.swarm_weights OWNER TO postgres;
ALTER TABLE marketing.swarm_facets ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.swarm_content_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.swarm_writers ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.swarm_editors ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.swarm_evaluators ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing.swarm_weights ENABLE ROW LEVEL SECURITY;

-- Facets (orchestratorai-jev rubrics/marketing/copy-*.yaml, question "meets").
INSERT INTO marketing.swarm_facets (organization_slug, key, label, description, source, rubric, question, inputs, polarity, evaluator_only, display_order) VALUES
  ('marketing', 'hook',                 'Hook',                'The first sentence makes the reader want to keep reading.',            'jev', 'copy-hook',                'meets', '{"draft":"draft","brief":"brief"}', 'positive', false, 1),
  ('marketing', 'personable',           'Personable',          'Reads like a person talking to the reader.',                           'jev', 'copy-personable',          'meets', '{"draft":"draft","brief":"brief"}', 'positive', false, 2),
  ('marketing', 'complete',             'Complete',            'Covers everything the brief asks for.',                                'jev', 'copy-complete',            'meets', '{"draft":"draft","brief":"brief"}', 'positive', false, 3),
  ('marketing', 'call-to-action',       'Call to action',      'One clear next step for the reader.',                                  'jev', 'copy-call-to-action',      'meets', '{"draft":"draft","brief":"brief"}', 'positive', false, 4),
  ('marketing', 'specific',             'Specific',            'Numbers, names and examples instead of adjectives.',                  'jev', 'copy-specific',            'meets', '{"draft":"draft","brief":"brief"}', 'positive', false, 5),
  ('marketing', 'plain-language',       'Plain language',      'Free of jargon the audience would not use.',                           'jev', 'copy-plain-language',      'meets', '{"draft":"draft","brief":"brief"}', 'positive', false, 6),
  ('marketing', 'on-brand',             'On brand',            'Matches the brand voice in the brief.',                                'jev', 'copy-on-brand',            'meets', '{"draft":"draft","brief":"brief"}', 'positive', false, 7),
  ('marketing', 'audience-fit',         'Audience fit',        'Pitched at the audience in the brief.',                                'jev', 'copy-audience-fit',        'meets', '{"draft":"draft","brief":"brief"}', 'positive', false, 8),
  ('marketing', 'seo-natural',          'SEO, natural',        'The keywords are there, used naturally.',                              'jev', 'copy-seo-natural',         'meets', '{"draft":"draft","brief":"brief"}', 'positive', false, 9),
  ('marketing', 'right-length',         'Right length',        'Within the content type''s word and character limits.',                'length', NULL, NULL, NULL, 'positive', false, 10),
  ('marketing', 'claims-substantiated', 'Claims substantiated','Every factual claim is backed by the evidence on file.',               'jev', 'claims-substantiated',     'unsupported', '{"copy":"draft","evidence":"evidence"}', 'negative', false, 11),
  ('marketing', 'inclusive-language',   'Inclusive language',  'Every reader in the audience feels addressed.',                        'jev', 'copy-inclusive-language',  'meets', '{"draft":"draft","brief":"brief"}', 'positive', false, 12),
  ('marketing', 'audience-would-read',  'Audience would read', 'The target audience would read it all the way through.',               'jev', 'copy-audience-would-read', 'meets', '{"draft":"draft","brief":"brief"}', 'positive', true, 13);

INSERT INTO marketing.swarm_content_types (organization_slug, slug, name, guidance, min_words, max_words, max_chars, display_order)
SELECT 'marketing', ct.slug, ct.name, ct.system_context, v.min_words, v.max_words, v.max_chars, v.ord
FROM marketing.content_types ct
JOIN (VALUES
  ('linkedin-post', 100, 300, 3000, 1),
  ('email-newsletter', 150, 600, NULL, 2),
  ('blog-post', 600, 1500, NULL, 3),
  ('twitter-thread', 60, 450, NULL, 4),
  ('product-description', 80, 300, NULL, 5),
  ('landing-page', 200, 800, NULL, 6),
  ('press-release', 300, 700, NULL, 7),
  ('case-study', 500, 1200, NULL, 8)
) AS v(slug, min_words, max_words, max_chars, ord) ON v.slug = ct.slug
WHERE ct.organization_slug = 'marketing';

-- Writers: today's personas, each with its default model.
INSERT INTO marketing.swarm_writers (organization_slug, slug, name, description, persona, provider, model, display_order)
SELECT 'marketing', a.slug, a.name,
       array_to_string(ARRAY(SELECT jsonb_array_elements_text(a.personality->'strengths')), ', '),
       (a.personality->>'system_context') || E'\n\nStyle:\n- ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(a.personality->'style_guidelines')), E'\n- '),
       c.llm_provider, c.llm_model,
       row_number() OVER (ORDER BY a.slug)
FROM marketing.agents a
JOIN marketing.agent_llm_configs c ON c.agent_slug = a.slug AND c.is_default
WHERE a.role = 'writer' AND a.organization_slug = 'marketing' AND a.personality ? 'system_context';

-- The Gemini variant ran on gpt-4o; give it the Gemini model it is named for.
UPDATE marketing.swarm_writers SET provider = 'openrouter', model = 'google/gemini-2.5-flash-lite'
WHERE organization_slug = 'marketing' AND slug = 'writer-conversational-google';

INSERT INTO marketing.swarm_editors (organization_slug, slug, name, description, threshold, display_order) VALUES
  ('marketing', 'editor-brand',      'Brand editor',      'Voice, inclusiveness and claims we can stand behind.', 0.70, 1),
  ('marketing', 'editor-clarity',    'Clarity editor',    'Plain, specific and complete.',                        0.70, 2),
  ('marketing', 'editor-engagement', 'Engagement editor', 'Hook, warmth and a clear next step.',                  0.70, 3),
  ('marketing', 'editor-seo',        'SEO editor',        'Keywords used naturally, at the right length.',        0.70, 4);

INSERT INTO marketing.swarm_evaluators (organization_slug, slug, name, description, display_order) VALUES
  ('marketing', 'evaluator-quality',    'Quality',    'Complete, clear, accurate and on brand.',     1),
  ('marketing', 'evaluator-creativity', 'Creativity', 'Memorable: a hook, a voice, a reason to read.', 2),
  ('marketing', 'evaluator-conversion', 'Conversion', 'Moves the reader to act.',                     3);

INSERT INTO marketing.swarm_weights (organization_slug, owner_kind, owner_slug, facet_key, weight) VALUES
  ('marketing', 'editor', 'editor-brand', 'on-brand', 5),
  ('marketing', 'editor', 'editor-brand', 'claims-substantiated', 4),
  ('marketing', 'editor', 'editor-brand', 'inclusive-language', 3),
  ('marketing', 'editor', 'editor-brand', 'plain-language', 2),
  ('marketing', 'editor', 'editor-clarity', 'plain-language', 5),
  ('marketing', 'editor', 'editor-clarity', 'specific', 3),
  ('marketing', 'editor', 'editor-clarity', 'complete', 3),
  ('marketing', 'editor', 'editor-clarity', 'audience-fit', 2),
  ('marketing', 'editor', 'editor-engagement', 'hook', 5),
  ('marketing', 'editor', 'editor-engagement', 'personable', 4),
  ('marketing', 'editor', 'editor-engagement', 'call-to-action', 3),
  ('marketing', 'editor', 'editor-seo', 'seo-natural', 5),
  ('marketing', 'editor', 'editor-seo', 'right-length', 3),
  ('marketing', 'editor', 'editor-seo', 'hook', 2),
  ('marketing', 'editor', 'editor-seo', 'complete', 2),
  ('marketing', 'evaluator', 'evaluator-quality', 'complete', 3),
  ('marketing', 'evaluator', 'evaluator-quality', 'specific', 3),
  ('marketing', 'evaluator', 'evaluator-quality', 'plain-language', 3),
  ('marketing', 'evaluator', 'evaluator-quality', 'claims-substantiated', 3),
  ('marketing', 'evaluator', 'evaluator-quality', 'audience-would-read', 3),
  ('marketing', 'evaluator', 'evaluator-quality', 'on-brand', 2),
  ('marketing', 'evaluator', 'evaluator-quality', 'right-length', 2),
  ('marketing', 'evaluator', 'evaluator-quality', 'inclusive-language', 2),
  ('marketing', 'evaluator', 'evaluator-creativity', 'hook', 5),
  ('marketing', 'evaluator', 'evaluator-creativity', 'personable', 4),
  ('marketing', 'evaluator', 'evaluator-creativity', 'audience-would-read', 4),
  ('marketing', 'evaluator', 'evaluator-creativity', 'specific', 2),
  ('marketing', 'evaluator', 'evaluator-conversion', 'call-to-action', 5),
  ('marketing', 'evaluator', 'evaluator-conversion', 'audience-fit', 4),
  ('marketing', 'evaluator', 'evaluator-conversion', 'hook', 3),
  ('marketing', 'evaluator', 'evaluator-conversion', 'claims-substantiated', 3),
  ('marketing', 'evaluator', 'evaluator-conversion', 'audience-would-read', 3);

-- The two agents the swarm runs. A writer's persona is its framing; its model is the writer's own.
INSERT INTO workflows.agent_definitions
  (slug, name, description, instructions, model_role, output_format, input_schema, output_schema, max_tokens)
VALUES
  ('swarm-writer', 'Swarm writer', 'Writes (and revises) one draft of marketing copy in a writer''s persona.',
   'You write marketing copy for the brief, in the persona described below. Follow the content type''s guidance and stay within its length. Use only facts in the brief and the evidence on file; do not invent numbers, customers or claims. When you are given a previous draft and feedback, revise that draft to address the feedback, keeping what works and keeping your voice. Return only the copy itself: no title line unless the content type needs one, no notes, no commentary.',
   'writer', 'text',
   '{"type":"object","properties":{"brief":{"type":"string","minLength":1},"evidence":{"type":"string"},"contentType":{"type":"object"},"revision":{"type":["object","null"]}},"required":["brief","evidence","contentType","revision"],"additionalProperties":false}'::jsonb,
   NULL, 3000),
  ('swarm-coach', 'Swarm editor coach', 'Turns a draft''s facet shortfalls into feedback its writer can act on.',
   'You coach a marketing writer. You receive the brief, the draft, and where it fell short: for each editor, the facets that editor cares about, how much, the draft''s score on each (0-1), and the reason. Write feedback the writer can act on in one revision: the two to four changes that matter most, most important first, each concrete (what to change and how), quoting the draft where it helps. Do not rewrite the draft yourself, do not praise, and do not mention scores or facet names.',
   'coach', 'json',
   '{"type":"object","properties":{"brief":{"type":"string","minLength":1},"draft":{"type":"string","minLength":1},"shortfalls":{"type":"array","minItems":1}},"required":["brief","draft","shortfalls"],"additionalProperties":false}'::jsonb,
   '{"type":"object","properties":{"feedback":{"type":"string","minLength":1}},"required":["feedback"],"additionalProperties":false}'::jsonb,
   800);

-- The old swarm's links and profiles go with it; these are the new one's.
DELETE FROM workflows.agent_definition_links WHERE workflow_slug = 'marketing-swarm';
INSERT INTO workflows.agent_definition_links (agent_slug, workflow_slug, purpose) VALUES
  ('swarm-writer', 'marketing-swarm', 'step'),
  ('swarm-coach', 'marketing-swarm', 'step'),
  ('workflow-trace-reviewer', 'marketing-swarm', 'trace_review');

DELETE FROM workflows.model_profiles WHERE workflow_slug = 'marketing-swarm';
INSERT INTO workflows.model_profiles (organization_slug, workflow_slug, role, provider, model) VALUES
  ('marketing', 'marketing-swarm', 'coach', 'openrouter', 'google/gemini-2.5-flash-lite'),
  ('marketing', 'marketing-swarm', 'reviewer', 'openrouter', 'google/gemini-2.5-flash-lite');

COMMIT;
