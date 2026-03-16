-- =============================================================================
-- REGISTER CAD AGENT
-- =============================================================================
-- Creates the CAD Agent for generating parametric 3D CAD models
-- Uses LangGraph workflow with OpenCASCADE.js and qwen2.5-coder
-- Features custom UI with 3D viewer
-- Created: 2025-12-29
-- =============================================================================

INSERT INTO public.agents (
    slug,
    organization_slug,
    name,
    description,
    version,
    agent_type,
    department,
    tags,
    io_schema,
    capabilities,
    context,
    endpoint,
    llm_config,
    metadata,
    created_at,
    updated_at
)
VALUES (
    'cad-agent',
    ARRAY['engineering', 'global']::TEXT[],
    'CAD Agent',
    'LangGraph-powered CAD agent that generates parametric 3D CAD models from natural language descriptions. Uses OpenCASCADE.js for geometry creation and exports to STEP, STL, GLTF formats. Includes custom UI with 3D viewer.',
    '1.0.0',
    'api',
    'engineering',
    ARRAY['cad', '3d-modeling', 'parametric', 'engineering', 'opencascade', 'langgraph', 'custom-ui']::TEXT[],

    -- Input/Output Schema
    '{
        "input": {
            "type": "object",
            "required": ["prompt"],
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Natural language description of the CAD model to generate"
                },
                "projectId": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Optional project ID to associate the drawing with"
                },
                "constraints": {
                    "type": "object",
                    "properties": {
                        "units": {
                            "type": "string",
                            "enum": ["mm", "inches"],
                            "default": "mm"
                        },
                        "material": {
                            "type": "string",
                            "enum": ["Aluminum 6061", "Steel", "Titanium", "ABS Plastic", "PLA"],
                            "default": "Aluminum 6061"
                        },
                        "manufacturing_method": {
                            "type": "string",
                            "enum": ["CNC", "3D Print", "Casting", "Sheet Metal"],
                            "default": "CNC"
                        },
                        "tolerance_class": {
                            "type": "string",
                            "enum": ["loose", "standard", "precision"],
                            "default": "standard"
                        },
                        "wall_thickness_min": {
                            "type": "number",
                            "minimum": 0.5,
                            "default": 2.0
                        }
                    }
                },
                "outputFormats": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["step", "stl", "gltf", "dxf"]
                    },
                    "default": ["step", "stl", "gltf"]
                }
            }
        },
        "output": {
            "type": "object",
            "properties": {
                "success": {
                    "type": "boolean"
                },
                "drawingId": {
                    "type": "string",
                    "format": "uuid"
                },
                "outputs": {
                    "type": "object",
                    "properties": {
                        "step": {
                            "type": "string",
                            "description": "URL to STEP file"
                        },
                        "stl": {
                            "type": "string",
                            "description": "URL to STL file"
                        },
                        "gltf": {
                            "type": "string",
                            "description": "URL to GLTF file for 3D viewer"
                        },
                        "thumbnail": {
                            "type": "string",
                            "description": "URL to thumbnail image"
                        }
                    }
                },
                "generatedCode": {
                    "type": "string",
                    "description": "The OpenCASCADE.js code that was generated"
                },
                "meshStats": {
                    "type": "object",
                    "properties": {
                        "vertices": { "type": "number" },
                        "faces": { "type": "number" },
                        "boundingBox": {
                            "type": "object",
                            "properties": {
                                "min": { "type": "array" },
                                "max": { "type": "array" }
                            }
                        }
                    }
                }
            }
        }
    }'::JSONB,

    -- Capabilities
    ARRAY['cad-generation', 'step-export', 'stl-export', 'gltf-export', 'parametric-modeling', 'code-generation']::TEXT[],

    -- Context (system prompt for the agent)
    '{"markdown": "# CAD Agent\n\nA LangGraph-powered agent that generates parametric 3D CAD models from natural language descriptions.\n\n## Capabilities\n- **Code Generation**: Uses qwen2.5-coder to generate OpenCASCADE.js code\n- **Geometry Execution**: Runs generated code in Node.js WASM environment\n- **Multi-Format Export**: Exports to STEP, STL, GLTF, DXF\n- **Constraint Application**: Respects project-wide and per-drawing constraints\n\n## Workflow\n1. Receive natural language prompt\n2. Apply project constraints to prompt\n3. Generate OpenCASCADE.js code with LLM\n4. Validate TypeScript code\n5. Execute code in WASM environment\n6. Export to multiple formats\n7. Store files in Supabase storage\n\n## Custom UI\nThis agent has a custom UI with:\n- Config tab: Set project constraints\n- Progress tab: Real-time generation progress via SSE\n- Deliverables tab: 3D viewer for GLTF, download buttons for all formats"}'::JSONB,

    -- Endpoint (API agents need an endpoint - matches LangGraph controller POST path)
    '{"url": "http://localhost:6200/agents/engineering/cad-agent/generate"}'::JSONB,

    -- LLM config (null for API agents - LangGraph manages its own LLM internally)
    NULL,

    -- Metadata with custom UI configuration
    '{
        "provider": "langgraph",
        "langgraphWorkflow": "cad-agent",
        "langgraphPath": "agents/engineering/cad-agent",
        "hasCustomUI": true,
        "customUIComponent": "cad-agent",
        "features": [
            "code-generation",
            "wasm-execution",
            "multi-format-export",
            "3d-viewer",
            "constraint-system"
        ],
        "supportedFormats": ["step", "stl", "gltf", "dxf"],
        "defaultLLM": {
            "provider": "ollama",
            "model": "qwen2.5-coder:14b",
            "description": "Code-capable model required for OpenCASCADE.js code generation"
        },
        "defaultConstraints": {
            "units": "mm",
            "material": "Aluminum 6061",
            "manufacturing_method": "CNC",
            "tolerance_class": "standard",
            "wall_thickness_min": 2.0
        },
        "executionCapabilities": {
            "canConverse": true,
            "canPlan": false,
            "canBuild": true,
            "requiresHumanGate": false
        },
        "streaming": {
            "enabled": true,
            "eventTypes": [
                "prompt_received",
                "constraints_applied",
                "llm_started",
                "llm_completed",
                "code_validation",
                "execution_started",
                "execution_completed",
                "export_started",
                "export_completed"
            ]
        }
    }'::JSONB,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    organization_slug = EXCLUDED.organization_slug,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    version = EXCLUDED.version,
    agent_type = EXCLUDED.agent_type,
    department = EXCLUDED.department,
    tags = EXCLUDED.tags,
    io_schema = EXCLUDED.io_schema,
    capabilities = EXCLUDED.capabilities,
    context = EXCLUDED.context,
    endpoint = EXCLUDED.endpoint,
    llm_config = EXCLUDED.llm_config,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
DECLARE
    agent_exists BOOLEAN;
    has_custom_ui BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.agents
        WHERE slug = 'cad-agent'
        AND agent_type = 'api'
    ) INTO agent_exists;

    SELECT (metadata->>'hasCustomUI')::BOOLEAN
    INTO has_custom_ui
    FROM public.agents
    WHERE slug = 'cad-agent';

    IF NOT agent_exists THEN
        RAISE EXCEPTION 'CAD Agent was not created successfully';
    END IF;

    IF NOT has_custom_ui THEN
        RAISE EXCEPTION 'CAD Agent hasCustomUI metadata not set correctly';
    END IF;

    RAISE NOTICE '================================================';
    RAISE NOTICE 'CAD Agent registered successfully';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Slug: cad-agent';
    RAISE NOTICE 'Type: api (LangGraph backend)';
    RAISE NOTICE 'Endpoint: http://localhost:6200/agents/engineering/cad-agent/generate';
    RAISE NOTICE 'Organizations: engineering, global';
    RAISE NOTICE 'Custom UI: enabled (cad-agent component)';
    RAISE NOTICE '================================================';
END $$;
