/**
 * One workflow run in a page: start it (or open an existing one), follow it
 * live, answer its human gate, cancel it. The ExecutionContext is created
 * here once per run (new conversationId), held in the context store, and
 * sent whole with every action; it is never rebuilt from pieces afterwards.
 */
import { computed, onUnmounted, ref, shallowRef } from 'vue';
import type {
  ExecutionContext,
  HumanReviewAnswer,
  HumanReviewDecision,
  JsonValue,
  WorkflowDocumentRef,
  WorkflowRunView,
} from '@orchestrator-ai/transport-types';
import { TERMINAL_WORKFLOW_RUN_STATUSES } from '@orchestrator-ai/transport-types';
import { useExecutionContextStore } from '@/modules/agents/stores/executionContextStore';
import { workflowRunsClient, type WorkflowStreamEvent } from './workflowRunsClient';

/** Events that change what the run view shows: refresh it when one arrives. */
const REFRESHING_EVENTS = new Set([
  'langgraph.started',
  'langgraph.processing',
  'langgraph.hitl_waiting',
  'langgraph.hitl_resumed',
  'langgraph.completed',
  'langgraph.failed',
  'langgraph.canceled',
  'langgraph.retrying',
  'langgraph.work_unit.completed',
]);

export interface WorkflowRunTarget {
  slug: string;
  orgSlug: string;
  userId: string;
  /** The org's model for the workflow (catalog `contextModel`). */
  contextModel: { provider: string; model: string };
}

export function useWorkflowRun() {
  const contextStore = useExecutionContextStore();
  const context = shallowRef<ExecutionContext | null>(null);
  // Read-only views of recursive JSON: shallow refs, replaced on each update.
  const run = shallowRef<WorkflowRunView | null>(null);
  const events = shallowRef<WorkflowStreamEvent[]>([]);
  const error = ref<string | null>(null);
  const busy = ref(false);
  let source: EventSource | null = null;
  let refreshing: Promise<void> | null = null;

  const isActive = computed(
    () => run.value !== null && !TERMINAL_WORKFLOW_RUN_STATUSES.includes(run.value.status),
  );
  const slug = computed(() => context.value?.agentSlug ?? null);

  async function guarded<T>(work: () => Promise<T>): Promise<T | undefined> {
    busy.value = true;
    error.value = null;
    try {
      return await work();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return undefined;
    } finally {
      busy.value = false;
    }
  }

  async function refresh(): Promise<void> {
    const ctx = context.value;
    if (!ctx) return;
    // Coalesce bursts of events into one read.
    refreshing ??= workflowRunsClient
      .getRun(ctx.agentSlug, ctx.conversationId, ctx.orgSlug)
      .then((view) => {
        run.value = view;
        if (!isActive.value) closeStream();
      })
      .finally(() => {
        refreshing = null;
      });
    await refreshing;
  }

  async function follow(ctx: ExecutionContext): Promise<void> {
    closeStream();
    const url = await workflowRunsClient.streamUrl(ctx);
    source = new EventSource(url);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data as string) as WorkflowStreamEvent;
      if (!event.hook_event_type) return;
      events.value = [...events.value, event];
      if (REFRESHING_EVENTS.has(event.hook_event_type)) void refresh().catch(setError);
    };
    source.onerror = () => {
      if (isActive.value) error.value = 'Lost the live connection; refresh to reconnect';
      closeStream();
    };
  }

  function setError(err: unknown): void {
    error.value = err instanceof Error ? err.message : String(err);
  }

  function closeStream(): void {
    source?.close();
    source = null;
  }

  /** Start a new run: new conversation, whole context, start action. */
  async function start(target: WorkflowRunTarget, input: JsonValue, documents: WorkflowDocumentRef[] = []) {
    return begin(target, { action: 'start', input, ...(documents.length > 0 ? { documents } : {}) });
  }

  /**
   * Branch a new run from a finished one, after one of its steps. It is a new
   * conversation with its own context; the instruction travels in the action.
   */
  async function restart(
    target: WorkflowRunTarget,
    source: { runId: string; workUnitRunId: string },
    instruction: string,
  ) {
    const trimmed = instruction.trim();
    return begin(target, { action: 'restart', source, ...(trimmed ? { overrides: { instruction: trimmed } } : {}) });
  }

  /**
   * The context of the next new run, created ahead of `start` so documents can
   * be uploaded into its conversation first. `start` then uses it.
   */
  let prepared: ExecutionContext | null = null;

  function newContext(target: WorkflowRunTarget): ExecutionContext {
    contextStore.initialize({
      orgSlug: target.orgSlug,
      userId: target.userId,
      conversationId: crypto.randomUUID(),
      agentSlug: target.slug,
      agentType: 'workflow',
      provider: target.contextModel.provider,
      model: target.contextModel.model,
    });
    return contextStore.current;
  }

  /** Upload a document for the next run's `start`; returns its ref for `documents`. */
  async function upload(target: WorkflowRunTarget, file: File): Promise<WorkflowDocumentRef | undefined> {
    return guarded(async () => {
      if (!prepared || prepared.orgSlug !== target.orgSlug || prepared.agentSlug !== target.slug) prepared = newContext(target);
      return workflowRunsClient.upload(prepared, file);
    });
  }

  /** A new run on a new conversation (or the one prepared by an upload), followed from its first event. */
  async function begin(target: WorkflowRunTarget, content: Parameters<typeof workflowRunsClient.invoke>[1]) {
    return guarded(async () => {
      const usable = prepared && prepared.orgSlug === target.orgSlug && prepared.agentSlug === target.slug;
      const ctx = content.action === 'start' && usable ? prepared! : newContext(target);
      prepared = null;
      context.value = ctx;
      events.value = [];
      run.value = null;
      await follow(ctx);
      const result = await workflowRunsClient.invoke(ctx, content);
      await refresh();
      return result.runId;
    });
  }

  /**
   * Open an existing run. The viewer acts on it with their own context for
   * the run's conversation: their user id, as a workflow caller. The run may
   * have been started by someone else in the org, or by the system.
   */
  async function open(slugName: string, runId: string, orgSlug: string, userId: string) {
    return guarded(async () => {
      closeStream();
      const view = await workflowRunsClient.getRun(slugName, runId, orgSlug);
      contextStore.initialize({ ...view.context, userId, agentType: 'workflow' });
      context.value = contextStore.current;
      run.value = view;
      events.value = await workflowRunsClient.getEvents(slugName, runId, orgSlug);
      if (isActive.value) await follow(context.value);
    });
  }

  async function act(content: Parameters<typeof workflowRunsClient.invoke>[1]) {
    const ctx = context.value;
    if (!ctx) throw new Error('No run is open');
    await workflowRunsClient.invoke(ctx, content);
    if (!source && isActive.value) await follow(ctx);
    await refresh();
  }

  const submitDecision = (reviewId: string, decision: HumanReviewDecision) =>
    guarded(() => act({ action: 'review.submit', reviewId, decision }));
  const submitAnswer = (reviewId: string, answer: HumanReviewAnswer) =>
    guarded(() => act({ action: 'answer.submit', reviewId, answer }));
  const cancel = () =>
    guarded(async () => {
      if (!context.value) throw new Error('No run is open');
      await act({ action: 'cancel', runId: context.value.conversationId });
    });

  function reset(): void {
    closeStream();
    context.value = null;
    run.value = null;
    events.value = [];
    error.value = null;
    contextStore.clear();
  }

  onUnmounted(closeStream);

  return {
    context,
    run,
    events,
    error,
    busy,
    isActive,
    slug,
    start,
    upload,
    restart,
    open,
    refresh,
    submitDecision,
    submitAnswer,
    cancel,
    reset,
  };
}
