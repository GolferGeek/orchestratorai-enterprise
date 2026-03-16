/**
 * useOutputRenderer — Composable for rendering typed invoke outputs.
 *
 * Drives UI rendering by outputType instead of backend mode semantics:
 *   text     → normal conversation text
 *   markdown → preview with See Markdown toggle
 *   json     → friendly table/tree/card with See JSON toggle
 *   image    → image preview
 *   video    → video player
 *   audio    → audio player
 */

import { computed, type Ref } from 'vue';
import type { OutputType } from '@orchestrator-ai/transport-types';

export interface RenderedOutput {
  /** The output type for rendering dispatch */
  outputType: OutputType;

  /** The content to render */
  content: unknown;

  /** Whether content is viewable as raw source (markdown, json) */
  hasRawView: boolean;

  /** Whether content is editable inline */
  isEditable: boolean;

  /** Whether content is a media preview */
  isMedia: boolean;

  /** Content as string (for text/markdown) */
  textContent: string;

  /** Content as parsed JSON (for json type) */
  jsonContent: Record<string, unknown> | unknown[] | null;

  /** Media URL (for image/video/audio) */
  mediaUrl: string | null;
}

export function useOutputRenderer(
  outputType: Ref<OutputType>,
  content: Ref<unknown>,
) {
  const rendered = computed<RenderedOutput>(() => {
    const type = outputType.value;
    const raw = content.value;

    const base: RenderedOutput = {
      outputType: type,
      content: raw,
      hasRawView: false,
      isEditable: false,
      isMedia: false,
      textContent: '',
      jsonContent: null,
      mediaUrl: null,
    };

    switch (type) {
      case 'text':
        return {
          ...base,
          textContent: typeof raw === 'string' ? raw : String(raw ?? ''),
        };

      case 'markdown':
        return {
          ...base,
          hasRawView: true,
          isEditable: true,
          textContent: typeof raw === 'string' ? raw : String(raw ?? ''),
        };

      case 'json': {
        let parsed: Record<string, unknown> | unknown[] | null = null;
        if (typeof raw === 'string') {
          try {
            parsed = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            parsed = null;
          }
        } else if (typeof raw === 'object' && raw !== null) {
          parsed = raw as Record<string, unknown>;
        }
        return {
          ...base,
          hasRawView: true,
          isEditable: true,
          jsonContent: parsed,
          textContent: typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2),
        };
      }

      case 'image':
        return {
          ...base,
          isMedia: true,
          mediaUrl: typeof raw === 'string' ? raw : null,
        };

      case 'video':
        return {
          ...base,
          isMedia: true,
          mediaUrl: typeof raw === 'string' ? raw : null,
        };

      case 'audio':
        return {
          ...base,
          isMedia: true,
          mediaUrl: typeof raw === 'string' ? raw : null,
        };

      default:
        return {
          ...base,
          textContent: typeof raw === 'string' ? raw : String(raw ?? ''),
        };
    }
  });

  return { rendered };
}
