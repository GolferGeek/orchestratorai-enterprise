/**
 * RAG Store
 * State management for RAG collections, documents, and batch uploads — state ONLY, no async calls.
 * Service layer calls store mutations after API success.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { RagCollection, RagDocument } from '@/services/admin-api.service';

export interface BatchUploadItem {
  path: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

export const useRagStore = defineStore('rag', () => {
  // ===================== Collections =====================
  const collections = ref<RagCollection[]>([]);
  const currentCollection = ref<RagCollection | null>(null);
  const collectionsLoading = ref(false);
  const collectionsError = ref<string | null>(null);

  // ===================== Documents =====================
  const documents = ref<RagDocument[]>([]);
  const documentsLoading = ref(false);
  const documentsError = ref<string | null>(null);

  // ===================== Batch Upload =====================
  const batchUploadItems = ref<BatchUploadItem[]>([]);
  const batchUploadActive = ref(false);
  const batchUploadCancelled = ref(false);
  const batchUploadProgress = ref({ current: 0, total: 0, currentFile: '' });
  const batchUploadResults = ref({ success: 0, failed: 0 });

  // ===================== Computed =====================
  const hasCollections = computed(() => collections.value.length > 0);
  const totalDocuments = computed(() =>
    collections.value.reduce((sum, c) => sum + c.documentCount, 0),
  );
  const totalChunks = computed(() =>
    collections.value.reduce((sum, c) => sum + (c.chunkCount || 0), 0),
  );

  // ===================== Collection Mutations =====================
  const setCollections = (data: RagCollection[]) => {
    collections.value = data;
  };

  const setCurrentCollection = (col: RagCollection | null) => {
    currentCollection.value = col;
  };

  const addCollection = (col: RagCollection) => {
    collections.value.push(col);
  };

  const removeCollection = (id: string) => {
    collections.value = collections.value.filter((c) => c.id !== id);
  };

  const setLoading = (v: boolean) => {
    collectionsLoading.value = v;
  };

  const setError = (v: string | null) => {
    collectionsError.value = v;
  };

  // ===================== Document Mutations =====================
  const setDocuments = (data: RagDocument[]) => {
    documents.value = data;
  };

  const addDocument = (doc: RagDocument) => {
    documents.value.push(doc);
  };

  const removeDocument = (id: string) => {
    documents.value = documents.value.filter((d) => d.id !== id);
  };

  const setDocumentsLoading = (v: boolean) => {
    documentsLoading.value = v;
  };

  const setDocumentsError = (v: string | null) => {
    documentsError.value = v;
  };

  // ===================== Batch Upload Mutations =====================
  const initBatchUpload = (items: BatchUploadItem[]) => {
    batchUploadItems.value = items;
    batchUploadActive.value = true;
    batchUploadCancelled.value = false;
    batchUploadProgress.value = { current: 0, total: items.length, currentFile: '' };
    batchUploadResults.value = { success: 0, failed: 0 };
  };

  const updateBatchUploadItem = (
    path: string,
    status: BatchUploadItem['status'],
    error?: string,
  ) => {
    const item = batchUploadItems.value.find((i) => i.path === path);
    if (item) {
      item.status = status;
      if (error) item.error = error;
    }
  };

  const updateBatchUploadProgress = (current: number, currentFile: string) => {
    batchUploadProgress.value = { ...batchUploadProgress.value, current, currentFile };
  };

  const incrementBatchUploadResult = (success: boolean) => {
    if (success) batchUploadResults.value.success++;
    else batchUploadResults.value.failed++;
  };

  const cancelBatchUpload = () => {
    batchUploadCancelled.value = true;
  };

  const finishBatchUpload = () => {
    batchUploadActive.value = false;
  };

  const clearBatchUpload = () => {
    batchUploadItems.value = [];
    batchUploadActive.value = false;
    batchUploadCancelled.value = false;
    batchUploadProgress.value = { current: 0, total: 0, currentFile: '' };
    batchUploadResults.value = { success: 0, failed: 0 };
  };

  // ===================== Reset =====================
  const reset = () => {
    collections.value = [];
    currentCollection.value = null;
    collectionsLoading.value = false;
    collectionsError.value = null;
    documents.value = [];
    documentsLoading.value = false;
    documentsError.value = null;
    clearBatchUpload();
  };

  return {
    collections,
    currentCollection,
    collectionsLoading,
    collectionsError,
    documents,
    documentsLoading,
    documentsError,
    batchUploadItems,
    batchUploadActive,
    batchUploadCancelled,
    batchUploadProgress,
    batchUploadResults,
    hasCollections,
    totalDocuments,
    totalChunks,
    setCollections,
    setCurrentCollection,
    addCollection,
    removeCollection,
    setLoading,
    setError,
    setDocuments,
    addDocument,
    removeDocument,
    setDocumentsLoading,
    setDocumentsError,
    initBatchUpload,
    updateBatchUploadItem,
    updateBatchUploadProgress,
    incrementBatchUploadResult,
    cancelBatchUpload,
    finishBatchUpload,
    clearBatchUpload,
    reset,
  };
});
