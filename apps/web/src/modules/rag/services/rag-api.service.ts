import axios, { AxiosError, AxiosInstance } from 'axios';

export type RagComplexityType =
  | 'comprehensive';

export interface RagCollection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  orgSlug: string;
  embeddingModel: string;
  embeddingDimensions: number;
  chunkSize: number;
  chunkOverlap: number;
  complexityType: RagComplexityType;
  status: string;
  requiredRole: string | null;
  allowedUsers: string[] | null;
  documentCount: number;
  chunkCount: number;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface CreateRagCollectionRequest {
  name: string;
  description?: string;
  orgSlug: string;
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  complexityType?: RagComplexityType;
  requiredRole?: string | null;
  allowedUsers?: string[] | null;
  privateToCreator?: boolean;
}

export interface RagDocument {
  id: string;
  collectionId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage: string | null;
  chunkCount: number;
  tokenCount: number;
  createdAt: string;
}

export interface RagChunk {
  id: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  pageNumber: number | null;
  metadata: Record<string, unknown>;
}

export interface UploadResponse {
  id: string;
  filename: string;
  status: string;
  message: string;
}

class RagApiService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${import.meta.env.VITE_API_BASE_URL || '/api'}/rag`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      config.headers['x-organization-slug'] = '*';
      return config;
    });

    this.client.interceptors.response.use(
      (res) => res,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          window.dispatchEvent(new Event('auth:session-expired'));
        }
        return Promise.reject(error);
      },
    );
  }

  async getCollections(orgSlug?: string): Promise<RagCollection[]> {
    const params = orgSlug ? { orgSlug } : {};
    const res = await this.client.get<{ collections: RagCollection[] }>('/collections', { params });
    return res.data.collections;
  }

  async getCollection(collectionId: string): Promise<RagCollection> {
    const res = await this.client.get<RagCollection>(`/collections/${collectionId}`);
    return res.data;
  }

  async createCollection(request: CreateRagCollectionRequest): Promise<RagCollection> {
    const res = await this.client.post<RagCollection>('/collections', request);
    return res.data;
  }

  async updateCollection(collectionId: string, data: Partial<RagCollection>): Promise<RagCollection> {
    const res = await this.client.patch<RagCollection>(`/collections/${collectionId}`, data);
    return res.data;
  }

  async deleteCollection(id: string): Promise<void> {
    await this.client.delete(`/collections/${id}`);
  }

  async getCollectionDocuments(collectionId: string): Promise<RagDocument[]> {
    const res = await this.client.get<{ collectionId: string; documents: RagDocument[] }>(`/collections/${collectionId}/documents`);
    return res.data.documents;
  }

  async uploadDocument(collectionId: string, file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await this.client.post<UploadResponse>(
      `/collections/${collectionId}/documents`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data;
  }

  async deleteDocument(collectionId: string, documentId: string): Promise<void> {
    await this.client.delete(`/collections/${collectionId}/documents/${documentId}`);
  }

  async getDocumentChunks(collectionId: string, documentId: string): Promise<RagChunk[]> {
    const res = await this.client.get<{ chunks: RagChunk[] }>(`/collections/${collectionId}/documents/${documentId}/chunks`);
    return res.data.chunks;
  }
}

export const ragApiService = new RagApiService();
