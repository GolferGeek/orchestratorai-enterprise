/**
 * useAgentTestRunner Composable
 *
 * Orchestrates agent smoke testing from the browser.
 * - Loads provider planes from the API
 * - Loads agents from the hierarchy endpoint
 * - Runs real A2A HTTP calls (converse + build/SSE)
 * - Tracks results per agent
 *
 * IMPORTANT: Does NOT use useExecutionContextStore — each test creates its own
 * isolated ExecutionContext to avoid contaminating the global conversation state.
 */

import { ref, computed, type Ref } from "vue";
import { useAuthStore } from "@/stores/rbacStore";
import { useLLMPreferencesStore } from "@/stores/llmPreferencesStore";
import { getSecureApiBaseUrl } from "@/utils/securityConfig";
import type {
  ProviderPlanes,
  AgentTestDef,
  AgentTestResult,
  AgentTestConfig,
  TestPreset,
  TestStatus,
} from "@/types/testRunner.types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const LOCAL_STORAGE_PRESETS_KEY = "agent-test-presets";

/**
 * Built-in test prompts keyed by agent slug.
 * Priority order for an agent's test definition:
 *  1. agent.metadata?.test_config (custom config from DB)
 *  2. This map
 *  3. Auto-detected defaults
 */
const BUILTIN_TEST_PROMPTS: Record<
  string,
  {
    prompt: string;
    mode: "converse" | "build";
    async: boolean;
    timeout: number;
    provider?: string;
    model?: string;
    payload?: Record<string, unknown>;
  }
> = {
  "general-assistant": {
    prompt: "Hello, what can you help me with?",
    mode: "converse",
    async: false,
    timeout: 60000,
  },
  "legal-contracts-agent": {
    prompt: "What are the key elements of a standard NDA?",
    mode: "converse",
    async: false,
    timeout: 60000,
    model: "llama3.2:1b",
  },
  "legal-policies-agent": {
    prompt: "What is our confidentiality policy?",
    mode: "converse",
    async: false,
    timeout: 60000,
    model: "llama3.2:1b",
  },
  "legal-litigation-agent": {
    prompt: "What are common litigation risks for SaaS companies?",
    mode: "converse",
    async: false,
    timeout: 60000,
    model: "llama3.2:1b",
  },
  "legal-estate-agent": {
    prompt: "What are the basics of estate planning?",
    mode: "converse",
    async: false,
    timeout: 60000,
    model: "llama3.2:1b",
  },
  "legal-intake-agent": {
    prompt:
      "I need to start a new client intake. What information do you need?",
    mode: "converse",
    async: false,
    timeout: 60000,
    model: "llama3.2:1b",
  },
  "hr-assistant": {
    prompt: "What is our onboarding process for new employees?",
    mode: "converse",
    async: false,
    timeout: 60000,
    model: "llama3.2:1b",
  },
  "legal-department": {
    prompt: "Summarize the key risks in a standard SaaS agreement.",
    mode: "converse",
    async: false,
    timeout: 90000,
  },
  "cad-agent": {
    prompt: "Describe a simple bracket design for mounting a sensor.",
    mode: "converse",
    async: false,
    timeout: 90000,
    provider: "google",
    model: "gemini-2.0-flash-lite",
  },
  "marketing-swarm": {
    prompt: "Create a short social media post about AI productivity tools.",
    mode: "build",
    async: true,
    timeout: 120000,
    payload: {
      action: "create",
      contentType: "social_post",
      topic: "AI Productivity Tools",
      audience: "Tech professionals",
      tone: "professional",
    },
  },
  "image-generator": {
    prompt: "A futuristic office workspace with holographic displays.",
    mode: "build",
    async: true,
    timeout: 90000,
    payload: { action: "create", mediaType: "image" },
  },
  "infographic-agent": {
    prompt: "Create an infographic about the benefits of AI automation.",
    mode: "build",
    async: true,
    timeout: 90000,
    payload: { action: "create", mediaType: "image" },
  },
};

// ---------------------------------------------------------------------------
// Helper: build a blank AgentTestResult
// ---------------------------------------------------------------------------

function makeBlankResult(agentSlug: string): AgentTestResult {
  return {
    agentSlug,
    status: "idle",
    startTime: null,
    endTime: null,
    durationMs: null,
    httpStatus: null,
    modelUsed: null,
    providerUsed: null,
    responsePreview: null,
    conversationId: null,
    deliverableId: null,
    taskId: null,
    error: null,
    streamEvents: [],
  };
}

// ---------------------------------------------------------------------------
// Helper: update a result inside the Map reactively
// ---------------------------------------------------------------------------

function patchResult(
  results: Ref<Map<string, AgentTestResult>>,
  slug: string,
  patch: Partial<AgentTestResult>,
): void {
  const existing = results.value.get(slug) ?? makeBlankResult(slug);
  const updated: AgentTestResult = { ...existing, ...patch };
  // Replace the whole Map so Vue detects the change
  const next = new Map(results.value);
  next.set(slug, updated);
  results.value = next;
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useAgentTestRunner() {
  const auth = useAuthStore();
  const llmPrefs = useLLMPreferencesStore();
  const API_BASE_URL = getSecureApiBaseUrl();

  // -------------------------------------------------------------------------
  // Reactive state
  // -------------------------------------------------------------------------

  const planes = ref<ProviderPlanes | null>(null);
  const agents = ref<AgentTestDef[]>([]);
  const results = ref<Map<string, AgentTestResult>>(new Map());
  const selectedSlugs = ref<Set<string>>(new Set());
  const isRunning = ref(false);
  const presets = ref<TestPreset[]>([]);
  const modelOverride = ref<{ provider: string; model: string } | null>(null);

  // -------------------------------------------------------------------------
  // Auth helpers (internal)
  // -------------------------------------------------------------------------

  function buildAuthHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // loadPlanes
  // -------------------------------------------------------------------------

  async function loadPlanes(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/system/planes`, {
      method: "GET",
      headers: buildAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to load provider planes: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    // The endpoint may return the planes directly or wrapped in a data key
    planes.value = (data.data ?? data) as ProviderPlanes;
  }

  // -------------------------------------------------------------------------
  // loadAgents
  // -------------------------------------------------------------------------

  async function loadAgents(): Promise<void> {
    // Use admin endpoint — returns raw DB records with full metadata (including test_config)
    const response = await fetch(`${API_BASE_URL}/api/admin/agents`, {
      method: "GET",
      headers: buildAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to load agents: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as {
      success: boolean;
      data: Array<Record<string, unknown>>;
    };
    const rawAgents = body.data ?? [];

    // Filter out agents that shouldn't appear in the test runner:
    // 1. metadata.status = 'disabled' or 'archived' (promotion service lifecycle)
    // 2. metadata.test_config.disabled = true (hidden from test runner only)
    const enabledAgents = rawAgents.filter((agent) => {
      const metadata = (agent.metadata ?? {}) as Record<string, unknown>;
      const status = metadata.status as string | undefined;
      if (status && status !== "active" && status !== "draft") return false;
      const testConfig = metadata.test_config as
        | Record<string, unknown>
        | undefined;
      if (testConfig?.disabled) return false;
      return true;
    });

    agents.value = enabledAgents.map((agent) => buildAgentTestDef(agent));
  }

  // -------------------------------------------------------------------------
  // buildAgentTestDef — priority: custom DB config > builtin map > auto
  // -------------------------------------------------------------------------

  function buildAgentTestDef(agent: Record<string, unknown>): AgentTestDef {
    const slug = String(agent.slug ?? agent.id ?? agent.name ?? "");
    // Admin endpoint uses agent_type; hierarchy uses type
    const type = String(agent.agent_type ?? agent.type ?? "converse");
    // Admin endpoint uses display_name; hierarchy uses displayName
    const displayName = String(
      agent.display_name ?? agent.displayName ?? agent.name ?? slug,
    );
    const metadata = (agent.metadata ?? {}) as Record<string, unknown>;
    // Admin endpoint uses organization_slug; hierarchy uses organization
    const rawOrg = String(
      agent.organization_slug ??
        agent.organization ??
        agent.orgSlug ??
        agent.org ??
        auth.currentOrganization ??
        "",
    );
    // May return comma-separated orgs like "engineering,global" — take the first
    const orgSlug = rawOrg.split(",")[0].trim();

    // 1. Custom config from DB
    const customConfig = metadata.test_config as AgentTestConfig | undefined;
    if (customConfig && Object.keys(customConfig).length > 0) {
      const mode = customConfig.mode ?? "converse";
      return {
        slug,
        type,
        org: orgSlug,
        mode,
        async: mode === "build",
        prompt:
          customConfig.prompt ??
          "Hello, what can you help me with? Please describe your capabilities.",
        displayName,
        payload: customConfig.payload,
        timeout: customConfig.timeout ?? (mode === "build" ? 120000 : 60000),
        provider: customConfig.provider,
        model: customConfig.model,
        hasCustomConfig: true,
        configSource: "custom",
      };
    }

    // 2. Builtin map
    const builtin = BUILTIN_TEST_PROMPTS[slug];
    if (builtin) {
      return {
        slug,
        type,
        org: orgSlug,
        mode: builtin.mode,
        async: builtin.async,
        prompt: builtin.prompt,
        displayName,
        payload: builtin.payload,
        timeout: builtin.timeout,
        provider: builtin.provider,
        model: builtin.model,
        hasCustomConfig: false,
        configSource: "builtin",
      };
    }

    // 3. Auto-detect
    const isMediaType = type === "media";
    const isMarketingSwarm = slug === "marketing-swarm";
    const mode: "converse" | "build" =
      isMediaType || isMarketingSwarm ? "build" : "converse";
    const isAsync = isMediaType || isMarketingSwarm;

    return {
      slug,
      type,
      org: orgSlug,
      mode,
      async: isAsync,
      prompt:
        "Hello, what can you help me with? Please describe your capabilities.",
      displayName,
      payload: undefined,
      timeout: mode === "build" ? 120000 : 60000,
      provider: undefined,
      model: undefined,
      hasCustomConfig: false,
      configSource: "auto",
    };
  }

  // -------------------------------------------------------------------------
  // runAgent — core test execution for a single agent
  // -------------------------------------------------------------------------

  async function runAgent(agent: AgentTestDef): Promise<void> {
    // Initialise result
    patchResult(results, agent.slug, {
      ...makeBlankResult(agent.slug),
      status: "creating-conversation" as TestStatus,
      startTime: Date.now(),
    });

    let conversationId: string | null = null;
    const taskId = crypto.randomUUID();

    try {
      // ------------------------------------------------------------------
      // Step 1: Create a conversation
      // ------------------------------------------------------------------
      const convResponse = await fetch(
        `${API_BASE_URL}/agent-to-agent/conversations`,
        {
          method: "POST",
          headers: buildAuthHeaders(),
          body: JSON.stringify({
            agentName: agent.slug,
            organization: agent.org,
          }),
        },
      );

      if (!convResponse.ok) {
        const errText = await convResponse.text().catch(() => "");
        throw new Error(
          `Conversation creation failed: ${convResponse.status} ${errText || convResponse.statusText}`,
        );
      }

      const convData = (await convResponse.json()) as Record<string, unknown>;
      conversationId = String(convData.id ?? convData.conversationId ?? "");

      if (!conversationId) {
        throw new Error("Conversation creation returned no id");
      }

      patchResult(results, agent.slug, { conversationId, taskId });

      // ------------------------------------------------------------------
      // Step 2: Build isolated ExecutionContext (never from global store)
      // ------------------------------------------------------------------
      const context = {
        orgSlug: agent.org,
        userId: auth.user?.id ?? "",
        conversationId,
        taskId,
        planId: NIL_UUID,
        deliverableId: NIL_UUID,
        agentSlug: agent.slug,
        agentType: agent.type,
        provider:
          modelOverride.value?.provider ??
          agent.provider ??
          llmPrefs.selectedProvider ??
          "ollama",
        model:
          modelOverride.value?.model ??
          agent.model ??
          llmPrefs.selectedModel ??
          "ministral-3:3b",
      };

      // ------------------------------------------------------------------
      // Step 3: Build JSON-RPC 2.0 request body
      // ------------------------------------------------------------------
      const body = {
        jsonrpc: "2.0",
        id: taskId,
        method: agent.mode === "build" ? "build.execute" : "converse",
        params: {
          context,
          mode: agent.mode,
          userMessage: agent.prompt,
          messages: [],
          payload: agent.payload ?? { action: "send" },
        },
      };

      const taskEndpoint = `${API_BASE_URL}/agent-to-agent/${encodeURIComponent(agent.org)}/${encodeURIComponent(agent.slug)}/tasks`;

      // ------------------------------------------------------------------
      // CONVERSE agents — synchronous POST
      // ------------------------------------------------------------------
      if (agent.mode === "converse") {
        patchResult(results, agent.slug, { status: "running" });

        const taskResponse = await fetch(taskEndpoint, {
          method: "POST",
          headers: buildAuthHeaders(),
          body: JSON.stringify(body),
        });

        const httpStatus = taskResponse.status;
        patchResult(results, agent.slug, { httpStatus });

        const rawPayload = (await taskResponse.json()) as Record<
          string,
          unknown
        >;

        if (!taskResponse.ok) {
          const errMsg = String(
            (rawPayload as Record<string, unknown>)?.message ??
              (rawPayload as Record<string, unknown>)?.error ??
              taskResponse.statusText,
          );
          throw new Error(`Agent task failed (${httpStatus}): ${errMsg}`);
        }

        // Check for JSON-RPC error envelope
        if (rawPayload.jsonrpc && rawPayload.error) {
          const rpcErr = rawPayload.error as Record<string, unknown>;
          throw new Error(
            `JSON-RPC error: ${String(rpcErr.message ?? JSON.stringify(rpcErr))}`,
          );
        }

        // Unwrap JSON-RPC 2.0 result
        const result = (rawPayload.result ?? rawPayload) as Record<
          string,
          unknown
        >;
        const payloadContent = result.payload as
          | Record<string, unknown>
          | undefined;
        const content = payloadContent?.content;
        const responseMeta = (payloadContent?.metadata ??
          result.metadata ??
          {}) as Record<string, unknown>;
        const modelUsed = String(responseMeta.model ?? context.model);
        const providerUsed = String(responseMeta.provider ?? context.provider);

        // Check for agent-level error in metadata
        const reason = responseMeta.reason as string | undefined;

        let responsePreview: string | null = null;
        if (typeof content === "string") {
          responsePreview = content.slice(0, 200);
        } else if (content !== null && content !== undefined) {
          const contentStr = JSON.stringify(content);
          if (contentStr !== "{}" && contentStr !== '""') {
            responsePreview = contentStr.slice(0, 200);
          }
        }

        // If no content extracted, store the raw response for debugging
        if (!responsePreview && Object.keys(result).length > 0) {
          responsePreview = JSON.stringify(result).slice(0, 300);
        }

        const success = Boolean(
          result.success ?? (responsePreview ? true : false),
        );
        const endTime = Date.now();

        patchResult(results, agent.slug, {
          status: success && !reason ? "pass" : "fail",
          endTime,
          durationMs:
            endTime - (results.value.get(agent.slug)?.startTime ?? endTime),
          modelUsed,
          providerUsed,
          responsePreview,
          ...(reason ? { error: `Agent error: ${reason}` } : {}),
        });

        return;
      }

      // ------------------------------------------------------------------
      // BUILD / ASYNC agents — SSE + async POST
      // ------------------------------------------------------------------
      patchResult(results, agent.slug, { status: "connecting-stream" });

      const streamEndpoint = `${API_BASE_URL}/agent-to-agent/${encodeURIComponent(agent.org)}/${encodeURIComponent(agent.slug)}/tasks/${taskId}/stream`;
      const asyncEndpoint = `${API_BASE_URL}/agent-to-agent/${encodeURIComponent(agent.org)}/${encodeURIComponent(agent.slug)}/tasks/async`;

      // Attach token via query param (EventSource does not support auth headers)
      const streamUrl = new URL(streamEndpoint);
      if (auth.token) {
        streamUrl.searchParams.set("token", auth.token);
      }

      await new Promise<void>((resolve, reject) => {
        const eventSource = new EventSource(streamUrl.toString());
        let settled = false;
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

        function finish(
          finalStatus: TestStatus,
          errorMsg: string | null = null,
        ): void {
          if (settled) return;
          settled = true;

          if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle);
          }

          eventSource.close();

          const endTime = Date.now();
          patchResult(results, agent.slug, {
            status: finalStatus,
            endTime,
            durationMs:
              endTime - (results.value.get(agent.slug)?.startTime ?? endTime),
            ...(errorMsg ? { error: errorMsg } : {}),
          });

          if (finalStatus === "error") {
            reject(new Error(errorMsg ?? "SSE timed out"));
          } else {
            resolve();
          }
        }

        // Set timeout
        timeoutHandle = setTimeout(() => {
          finish("error", "SSE timed out");
        }, agent.timeout);

        eventSource.onopen = () => {
          patchResult(results, agent.slug, { status: "running" });
        };

        eventSource.onmessage = (event) => {
          let parsed: Record<string, unknown> | null = null;
          try {
            parsed = JSON.parse(event.data) as Record<string, unknown>;
          } catch {
            // Non-JSON SSE data — skip
            return;
          }

          const eventType = String(parsed.event_type ?? parsed.type ?? "");

          if (eventType) {
            // Append to streamEvents
            const existing =
              results.value.get(agent.slug) ?? makeBlankResult(agent.slug);
            const updatedEvents = [...existing.streamEvents, eventType];
            patchResult(results, agent.slug, {
              status: "streaming",
              streamEvents: updatedEvents,
            });
          }

          // Extract deliverable/task IDs if present
          const meta = (parsed.metadata ?? parsed.data ?? {}) as Record<
            string,
            unknown
          >;
          if (meta.deliverableId) {
            patchResult(results, agent.slug, {
              deliverableId: String(meta.deliverableId),
            });
          }

          if (
            eventType === "agent.completed" ||
            eventType === "task.completed" ||
            eventType === "agent_stream_complete"
          ) {
            finish("pass");
          } else if (
            eventType === "agent.failed" ||
            eventType === "task.failed" ||
            eventType === "agent_stream_error"
          ) {
            const errMsg = String(
              meta.error ?? meta.message ?? "Agent reported failure",
            );
            finish("fail", errMsg);
          }
        };

        eventSource.onerror = (err) => {
          // Only fail if we haven't already settled via a message
          if (!settled) {
            console.error(
              "[useAgentTestRunner] SSE error for",
              agent.slug,
              err,
            );
            // EventSource will auto-reconnect on errors; only give up on CLOSED state
            if (eventSource.readyState === EventSource.CLOSED) {
              finish("error", "SSE connection closed unexpectedly");
            }
          }
        };

        // Fire the async task POST after opening the stream
        fetch(asyncEndpoint, {
          method: "POST",
          headers: buildAuthHeaders(),
          body: JSON.stringify(body),
        })
          .then(async (taskResp) => {
            const httpStatus = taskResp.status;
            patchResult(results, agent.slug, { httpStatus });

            if (!taskResp.ok) {
              const errText = await taskResp.text().catch(() => "");
              finish(
                "error",
                `Async task POST failed (${httpStatus}): ${errText || taskResp.statusText}`,
              );
            }
          })
          .catch((err: unknown) => {
            finish(
              "error",
              err instanceof Error ? err.message : "Async task POST threw",
            );
          });
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const endTime = Date.now();
      patchResult(results, agent.slug, {
        status: "error",
        endTime,
        durationMs:
          endTime - (results.value.get(agent.slug)?.startTime ?? endTime),
        conversationId,
        taskId,
        error: errorMsg,
      });
    }
  }

  // -------------------------------------------------------------------------
  // runSelected — sequential execution of selected agents
  // -------------------------------------------------------------------------

  async function runSelected(): Promise<void> {
    isRunning.value = true;
    try {
      for (const slug of selectedSlugs.value) {
        const agentDef = agents.value.find((a) => a.slug === slug);
        if (!agentDef) continue;

        // Check if disabled via custom config
        const metadata = {} as Record<string, unknown>; // We don't have raw agent metadata here
        const customConfig = metadata.test_config as
          | AgentTestConfig
          | undefined;
        if (customConfig?.disabled) continue;

        await runAgent(agentDef);
      }
    } finally {
      isRunning.value = false;
    }
  }

  // -------------------------------------------------------------------------
  // runAll — select all non-disabled agents then run
  // -------------------------------------------------------------------------

  async function runAll(): Promise<void> {
    const nonDisabledSlugs = agents.value
      .filter(() => {
        // There is no disabled flag on AgentTestDef itself; disabled comes from
        // AgentTestConfig stored in DB. We surface it only if the agent has
        // hasCustomConfig = true and the configSource carries that flag. For
        // now we treat all agents as non-disabled at the AgentTestDef level.
        return true;
      })
      .map((a) => a.slug);

    selectedSlugs.value = new Set(nonDisabledSlugs);
    await runSelected();
  }

  // -------------------------------------------------------------------------
  // Selection helpers
  // -------------------------------------------------------------------------

  function selectAll(): void {
    selectedSlugs.value = new Set(agents.value.map((a) => a.slug));
  }

  function deselectAll(): void {
    selectedSlugs.value = new Set();
  }

  function selectByType(type: string): void {
    selectedSlugs.value = new Set(
      agents.value.filter((a) => a.type === type).map((a) => a.slug),
    );
  }

  function selectByOrg(org: string): void {
    selectedSlugs.value = new Set(
      agents.value.filter((a) => a.org === org).map((a) => a.slug),
    );
  }

  function toggleAgent(slug: string): void {
    const next = new Set(selectedSlugs.value);
    if (next.has(slug)) {
      next.delete(slug);
    } else {
      next.add(slug);
    }
    selectedSlugs.value = next;
  }

  // -------------------------------------------------------------------------
  // Preset management
  // -------------------------------------------------------------------------

  function loadPresets(): void {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_PRESETS_KEY);
      if (raw) {
        presets.value = JSON.parse(raw) as TestPreset[];
      }
    } catch (err) {
      console.error("[useAgentTestRunner] Failed to load presets:", err);
      presets.value = [];
    }
  }

  function savePresets(): void {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_PRESETS_KEY,
        JSON.stringify(presets.value),
      );
    } catch (err) {
      console.error("[useAgentTestRunner] Failed to save presets:", err);
    }
  }

  function savePreset(name: string): void {
    const existing = presets.value.findIndex((p) => p.name === name);
    const preset: TestPreset = { name, slugs: Array.from(selectedSlugs.value) };
    if (existing >= 0) {
      presets.value = [
        ...presets.value.slice(0, existing),
        preset,
        ...presets.value.slice(existing + 1),
      ];
    } else {
      presets.value = [...presets.value, preset];
    }
    savePresets();
  }

  function applyPreset(preset: TestPreset): void {
    selectedSlugs.value = new Set(preset.slugs);
  }

  function deletePreset(name: string): void {
    presets.value = presets.value.filter((p) => p.name !== name);
    savePresets();
  }

  // -------------------------------------------------------------------------
  // saveTestConfig — PATCH agent metadata with custom test config
  // -------------------------------------------------------------------------

  async function saveTestConfig(
    agentSlug: string,
    config: AgentTestConfig,
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/api/admin/agents/${encodeURIComponent(agentSlug)}/test-config`,
      {
        method: "PATCH",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ test_config: config }),
      },
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `Failed to save test config for ${agentSlug}: ${response.status} ${errText || response.statusText}`,
      );
    }

    // Reload agents so the UI reflects the updated config
    await loadAgents();
  }

  // -------------------------------------------------------------------------
  // clearResults & getResult
  // -------------------------------------------------------------------------

  function clearResults(): void {
    results.value = new Map();
  }

  function getResult(slug: string): AgentTestResult | undefined {
    return results.value.get(slug);
  }

  // -------------------------------------------------------------------------
  // Computed values
  // -------------------------------------------------------------------------

  const runProgress = computed(() => {
    const total = selectedSlugs.value.size;
    if (total === 0) return { completed: 0, total: 0, percent: 0 };

    let completed = 0;
    for (const slug of selectedSlugs.value) {
      const r = results.value.get(slug);
      if (
        r &&
        (r.status === "pass" || r.status === "fail" || r.status === "error")
      ) {
        completed++;
      }
    }

    return {
      completed,
      total,
      percent: Math.round((completed / total) * 100),
    };
  });

  const summary = computed(() => {
    let total = 0;
    let pass = 0;
    let fail = 0;
    let error = 0;
    let pending = 0;

    for (const [, r] of results.value) {
      total++;
      if (r.status === "pass") pass++;
      else if (r.status === "fail") fail++;
      else if (r.status === "error") error++;
      else pending++;
    }

    return { total, pass, fail, error, pending };
  });

  // -------------------------------------------------------------------------
  // Return public API
  // -------------------------------------------------------------------------

  return {
    // State
    planes,
    agents,
    results,
    selectedSlugs,
    isRunning,
    presets,
    modelOverride,

    // Computed
    runProgress,
    summary,

    // Data loading
    loadPlanes,
    loadAgents,

    // Test execution
    runAgent,
    runSelected,
    runAll,

    // Selection
    selectAll,
    deselectAll,
    selectByType,
    selectByOrg,
    toggleAgent,

    // Presets
    loadPresets,
    savePreset,
    applyPreset,
    deletePreset,

    // Config
    saveTestConfig,

    // Utilities
    clearResults,
    getResult,
  };
}
