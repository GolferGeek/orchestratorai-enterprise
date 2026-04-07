/**
 * useJobEventStream — encapsulates the history fetch + live SSE merge
 * for a single legal-department job. Lifted out of `JobDetailPanel.vue`
 * so the new `JobDetailModal` (Phase 3+) and the in-row ticker
 * (Phase 4) consume the same logic.
 *
 * Why this exists:
 * - Both modal and ticker need the same dedupe semantics.
 * - The live SSE controller emits a `{event_type:"connected"}` wrapper
 *   that has no `id`, no `hook_event_type`, and no timestamps. Naive
 *   dedupe blows up on it (see Phase 1 root cause).
 * - History events come from the DB with `{ id, created_at }`. Live
 *   SSE events come from the in-memory subject with
 *   `{ hook_event_type, timestamp }` and no `id`/`created_at`. The
 *   composable handles both shapes.
 *
 * The composable returns reactive `events` and `streaming` refs and a
 * `cleanup()` function the caller invokes when the job changes or the
 * component unmounts.
 */
import { ref, type Ref } from 'vue';
import {
  legalJobsService,
  type ObservabilityEvent,
} from '../legalJobsService';

export interface UseJobEventStreamOptions {
  jobId: string;
  conversationId: string;
  orgSlug: string;
}

export interface UseJobEventStreamResult {
  events: Ref<ObservabilityEvent[]>;
  streaming: Ref<boolean>;
  /** Re-fetch the durable history. Idempotent. */
  reloadHistory: () => Promise<void>;
  /** Stop the SSE stream + clear all internal state. */
  cleanup: () => void;
}

export function useJobEventStream(
  opts: UseJobEventStreamOptions,
): UseJobEventStreamResult {
  const events = ref<ObservabilityEvent[]>([]) as Ref<ObservabilityEvent[]>;
  const streaming = ref(false);
  const seenKeys = new Set<string>();
  let eventSource: EventSource | null = null;

  function dedupeAdd(ev: ObservabilityEvent): void {
    // Skip the SSE controller's "connected" wrapper — it's a metadata
    // message, not a real observability event. It has neither id nor
    // hook_event_type, and if we add it the dedupe set ends up
    // containing an "undefined-undefined" key that swallows every
    // subsequent live event.
    const wrapper = ev as ObservabilityEvent & { event_type?: string };
    if (wrapper.event_type === 'connected') return;

    // History events come from the DB and have { id, created_at }.
    // Live SSE events have { hook_event_type, timestamp } and no
    // `id`/`created_at`. Build a stable key for each shape.
    const liveEv = ev as ObservabilityEvent & { timestamp?: number };
    const key =
      ev.id != null
        ? `db:${ev.id}`
        : `live:${ev.hook_event_type}:${liveEv.timestamp ?? Math.random()}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    // Live events don't have created_at; backfill from timestamp so
    // downstream sort and render paths work uniformly.
    if (!ev.created_at && liveEv.timestamp) {
      (ev as ObservabilityEvent).created_at = new Date(
        liveEv.timestamp,
      ).toISOString();
    }

    events.value.push(ev);
    events.value.sort(
      (a, b) =>
        new Date(a.created_at ?? 0).getTime() -
        new Date(b.created_at ?? 0).getTime(),
    );
  }

  async function reloadHistory(): Promise<void> {
    try {
      const history = await legalJobsService.getJobEvents(
        opts.jobId,
        opts.orgSlug,
      );
      for (const ev of history) dedupeAdd(ev);
    } catch (err) {
      console.error(
        '[useJobEventStream] history fetch failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  function openStream(): void {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    try {
      eventSource = legalJobsService.openEventStream(opts.conversationId);
      streaming.value = true;
      eventSource.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data) as ObservabilityEvent;
          dedupeAdd(parsed);
        } catch {
          // ignore malformed
        }
      };
      eventSource.onerror = () => {
        streaming.value = false;
      };
    } catch (err) {
      console.error(
        '[useJobEventStream] SSE open failed:',
        err instanceof Error ? err.message : String(err),
      );
      streaming.value = false;
    }
  }

  function cleanup(): void {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    streaming.value = false;
    events.value = [];
    seenKeys.clear();
  }

  // Kick off the initial fetch + stream open.
  void reloadHistory().then(() => openStream());

  return { events, streaming, reloadHistory, cleanup };
}
