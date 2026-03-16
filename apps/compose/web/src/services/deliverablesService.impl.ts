import axios, { AxiosInstance } from "axios";
import type {
  Deliverable,
  DeliverableFilters,
  DeliverableSearchResponse,
  DeliverableVersion,
  CreateDeliverableDto,
  CreateVersionDto,
} from "./deliverablesService.types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_NESTJS_BASE_URL;

export class DeliverablesServiceImpl {
  private axiosInstance: AxiosInstance;
  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: { "Content-Type": "application/json" },
      timeout: parseInt(import.meta.env.VITE_API_TIMEOUT_MS || "120000", 10),
    });
    this.axiosInstance.interceptors.request.use((config) => {
      const token =
        sessionStorage.getItem("authToken") ||
        localStorage.getItem("authToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  async getDeliverables(
    filters?: DeliverableFilters,
  ): Promise<DeliverableSearchResponse> {
    const params = new URLSearchParams();
    if (filters) {
      if (filters.type) params.append("type", filters.type);
      if (filters.format) params.append("format", filters.format);
      if (filters.search) params.append("search", filters.search);
      if (filters.limit) params.append("limit", filters.limit.toString());
      if (filters.offset) params.append("offset", filters.offset.toString());
      if (filters.latestOnly !== undefined)
        params.append("latestOnly", filters.latestOnly.toString());
      if (filters.standalone !== undefined)
        params.append("standalone", filters.standalone.toString());
      if (filters.agentName) params.append("agentName", filters.agentName);
      if (filters.createdAfter)
        params.append("createdAfter", filters.createdAfter);
    }
    const response = await this.axiosInstance.get(
      `/deliverables?${params.toString()}`,
    );
    return response.data;
  }

  async getDeliverable(id: string): Promise<Deliverable> {
    const response = await this.axiosInstance.get(`/deliverables/${id}`);
    return response.data;
  }

  async createDeliverable(data: CreateDeliverableDto): Promise<Deliverable> {
    const response = await this.axiosInstance.post("/deliverables", data);
    return response.data;
  }

  async createVersion(
    deliverableId: string,
    data: CreateVersionDto,
  ): Promise<DeliverableVersion> {
    const response = await this.axiosInstance.post(
      `/deliverable-versions/${deliverableId}`,
      data,
    );
    return response.data;
  }

  async updateDeliverable(
    id: string,
    updates: Partial<
      Pick<
        CreateDeliverableDto,
        "title" | "description" | "type" | "projectStepId"
      >
    >,
  ): Promise<Deliverable> {
    const response = await this.axiosInstance.patch(
      `/deliverables/${id}`,
      updates,
    );
    return response.data;
  }

  async deleteDeliverable(id: string): Promise<void> {
    await this.axiosInstance.delete(`/deliverables/${id}`);
  }

  async getVersionHistory(
    deliverableId: string,
  ): Promise<DeliverableVersion[]> {
    const response = await this.axiosInstance.get(
      `/deliverable-versions/${deliverableId}/history`,
    );
    return response.data;
  }

  async getCurrentVersion(
    deliverableId: string,
  ): Promise<DeliverableVersion | null> {
    const response = await this.axiosInstance.get(
      `/deliverable-versions/${deliverableId}/current`,
    );
    return response.data;
  }

  async getVersion(versionId: string): Promise<DeliverableVersion> {
    const response = await this.axiosInstance.get(
      `/deliverable-versions/version/${versionId}`,
    );
    return response.data;
  }

  async setCurrentVersion(versionId: string): Promise<DeliverableVersion> {
    const response = await this.axiosInstance.patch(
      `/deliverable-versions/version/${versionId}/set-current`,
    );
    return response.data;
  }

  async deleteVersion(versionId: string): Promise<void> {
    await this.axiosInstance.delete(
      `/deliverable-versions/version/${versionId}`,
    );
  }

  async rerunWithDifferentLLM(
    versionId: string,
    llmConfig: {
      provider: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<DeliverableVersion> {
    const response = await this.axiosInstance.post(
      `/deliverable-versions/version/${versionId}/rerun`,
      llmConfig,
    );
    return response.data;
  }

  async copyVersion(versionId: string): Promise<DeliverableVersion> {
    const response = await this.axiosInstance.post(
      `/deliverable-versions/version/${versionId}/copy`,
    );
    return response.data;
  }

  async enhanceVersion(
    versionId: string,
    params: {
      instruction: string;
      providerName?: string;
      modelName?: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<DeliverableVersion> {
    const response = await this.axiosInstance.post(
      `/deliverable-versions/version/${versionId}/enhance`,
      params,
    );
    return response.data;
  }

  async mergeVersions(
    deliverableId: string,
    versionIds: string[],
    mergePrompt: string,
    providerName?: string,
    modelName?: string,
  ): Promise<{ newVersion: DeliverableVersion; conflictSummary?: string }> {
    const response = await this.axiosInstance.post(
      `/deliverable-versions/${deliverableId}/merge`,
      { versionIds, mergePrompt, providerName, modelName },
    );
    return response.data;
  }

  async searchDeliverables(
    query: string,
    filters?: Omit<DeliverableFilters, "search">,
  ): Promise<DeliverableSearchResponse> {
    return this.getDeliverables({ ...filters, search: query });
  }

  async getConversationDeliverables(
    conversationId: string,
  ): Promise<Deliverable[]> {
    const response = await this.axiosInstance.get<
      Deliverable[] | DeliverableSearchResponse
    >(`/deliverables/conversation/${conversationId}`);
    const data = response.data;
    return Array.isArray(data)
      ? data
      : (data as DeliverableSearchResponse)?.items || [];
  }

  async getAgentDeliverables(
    _agentName: string,
  ): Promise<import("./deliverablesService.types").DeliverableSearchResult[]> {
    const result = await this.getDeliverables({});
    return result.items;
  }

  async findExistingDeliverable(
    conversationId: string,
    taskId?: string,
  ): Promise<Deliverable | null> {
    try {
      const deliverables =
        await this.getConversationDeliverables(conversationId);
      if (taskId) {
        for (const deliverable of deliverables) {
          if (deliverable.currentVersion?.taskId === taskId) {
            return deliverable;
          }
        }
        return null;
      }
      return deliverables.length > 0 ? deliverables[0] : null;
    } catch {
      return null;
    }
  }

  async createEditingConversation(
    deliverableId: string,
    options: {
      agentName?: string;
      initialMessage?: string;
      action?: "edit" | "enhance" | "revise" | "discuss" | "new-version";
    } = {},
  ): Promise<{ conversationId: string; message: string }> {
    try {
      const response = await this.axiosInstance.post(
        `/deliverables/${deliverableId}/conversations`,
        options,
      );
      return response.data;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as {
          response?: { data?: unknown; status?: number };
        };
        console.error("[DeliverablesService] Conversation creation error:", {
          status: axiosError.response?.status,
          data: axiosError.response?.data,
          requestPayload: options,
          deliverableId,
        });
        throw new Error(
          `Failed to create conversation: ${JSON.stringify(axiosError.response?.data || "Unknown error")}`,
        );
      }
      throw error;
    }
  }

  async getVersions(deliverableId: string): Promise<DeliverableVersion[]> {
    return this.getVersionHistory(deliverableId);
  }
}

let _instance: DeliverablesServiceImpl | null = null;

/**
 * Get the deliverables service instance. Function export avoids TDZ errors from
 * circular imports and Cloudflare Rocket Loader script reordering.
 */
export function getDeliverablesService(): DeliverablesServiceImpl {
  if (!_instance) {
    _instance = new DeliverablesServiceImpl();
  }
  return _instance;
}
