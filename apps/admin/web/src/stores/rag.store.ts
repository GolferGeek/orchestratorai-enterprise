/**
 * RAG Store
 * State management for RAG collections and documents — state ONLY, no async calls.
 * Service layer calls store mutations after API success.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RagCollection, RagDocument } from '@/services/admin-api.service';

export const useRagStore = defineStore('rag', () => {
  // ===================== State =====================
  const collections = ref<RagCollection[]>([]);
  const selectedCollectionId = ref<string | null>(null);
  const documents = ref<RagDocument[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ===================== Mutations =====================
  function setCollections(data: RagCollection[]) {
    collections.value = data;
  }

  function addCollection(collection: RagCollection) {
    collections.value.push(collection);
  }

  function removeCollection(id: string) {
    collections.value = collections.value.filter((c) => c.id !== id);
    if (selectedCollectionId.value === id) {
      selectedCollectionId.value = null;
    }
  }

  function selectCollection(id: string | null) {
    selectedCollectionId.value = id;
  }

  function setDocuments(data: RagDocument[]) {
    documents.value = data;
  }

  function addDocument(doc: RagDocument) {
    documents.value.push(doc);
  }

  function removeDocument(id: string) {
    documents.value = documents.value.filter((d) => d.id !== id);
  }

  function updateDocumentStatus(id: string, status: RagDocument['status']) {
    const doc = documents.value.find((d) => d.id === id);
    if (doc) {
      doc.status = status;
    }
  }

  function setLoading(val: boolean) {
    loading.value = val;
  }

  function setError(msg: string | null) {
    error.value = msg;
  }

  function reset() {
    collections.value = [];
    selectedCollectionId.value = null;
    documents.value = [];
    loading.value = false;
    error.value = null;
  }

  return {
    collections,
    selectedCollectionId,
    documents,
    loading,
    error,
    setCollections,
    addCollection,
    removeCollection,
    selectCollection,
    setDocuments,
    addDocument,
    removeDocument,
    updateDocumentStatus,
    setLoading,
    setError,
    reset,
  };
});
