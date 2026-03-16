-- Migration: Add Video Generator Agent
-- Description: Creates a media-type agent for video generation using the MediaAgentRunner
-- This agent uses the new media runner to generate videos via OpenAI Sora and Google Veo

-- ============================================================================
-- Add video-generator agent definition
-- ============================================================================

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
  metadata,
  created_at,
  updated_at
)
VALUES (
  'video-generator',
  ARRAY['global'],
  'Video Generator',
  'Generates high-quality videos using AI models from OpenAI (Sora 2) and Google (Veo 3). Supports various durations, aspect ratios, and resolutions. Video generation is asynchronous and may take several minutes.',
  '1.0.0',
  'media',
  'creative',
  ARRAY['video', 'generation', 'creative', 'media', 'ai-video', 'sora', 'veo'],
  '{
    "input": {
      "type": "object",
      "required": ["prompt"],
      "properties": {
        "prompt": {
          "type": "string",
          "description": "Text description of the video to generate"
        },
        "duration": {
          "type": "number",
          "minimum": 5,
          "maximum": 60,
          "default": 10,
          "description": "Video duration in seconds (5-60)"
        },
        "aspectRatio": {
          "type": "string",
          "enum": ["16:9", "9:16", "1:1"],
          "default": "16:9",
          "description": "Video aspect ratio"
        },
        "resolution": {
          "type": "string",
          "enum": ["480p", "720p", "1080p"],
          "default": "720p",
          "description": "Video resolution"
        },
        "fps": {
          "type": "number",
          "enum": [24, 30, 60],
          "default": 24,
          "description": "Frames per second"
        },
        "firstFrameImageUrl": {
          "type": "string",
          "description": "Optional URL of an image to use as the first frame (image-to-video)"
        }
      }
    },
    "output": {
      "type": "object",
      "properties": {
        "success": {
          "type": "boolean"
        },
        "videos": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "assetId": { "type": "string" },
              "url": { "type": "string" },
              "mimeType": { "type": "string" },
              "durationSeconds": { "type": "number" }
            }
          }
        },
        "metadata": {
          "type": "object",
          "properties": {
            "provider": { "type": "string" },
            "model": { "type": "string" },
            "prompt": { "type": "string" },
            "processingTimeSeconds": { "type": "number" }
          }
        }
      }
    }
  }'::jsonb,
  ARRAY['video-generation'],
  '{"input_modes": ["text/plain", "image/png", "image/jpeg"], "output_modes": ["video/mp4", "video/webm"]}'::jsonb,
  NULL,
  '{
    "mediaType": "video",
    "defaultProvider": "openai",
    "defaultModel": "sora-2",
    "supportedProviders": ["openai", "google"],
    "supportedModels": {
      "openai": ["sora-2"],
      "google": ["veo-3-generate"]
    },
    "executionCapabilities": {
      "canConverse": false,
      "canPlan": false,
      "canBuild": true
    },
    "asyncGeneration": true,
    "estimatedProcessingTime": "2-10 minutes depending on duration and resolution"
  }'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  version = EXCLUDED.version,
  agent_type = EXCLUDED.agent_type,
  department = EXCLUDED.department,
  tags = EXCLUDED.tags,
  io_schema = EXCLUDED.io_schema,
  capabilities = EXCLUDED.capabilities,
  context = EXCLUDED.context,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  agent_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.agents WHERE slug = 'video-generator' AND agent_type = 'media'
  ) INTO agent_exists;

  IF NOT agent_exists THEN
    RAISE EXCEPTION 'Video generator agent was not created successfully';
  END IF;

  RAISE NOTICE 'Successfully created video-generator agent with media type';
END $$;
