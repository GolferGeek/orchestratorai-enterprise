import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ProtocolMessage, MessageFilter } from '../types';
import { useApi } from '../composables/useApi';

interface SourceDataReference {
  file: string;
  recordId: string;
  recordType: string;
}

interface TransactionRecord {
  id: string;
  messageId: string;
  timestamp: string;
  type: string;
  sourceAgent: string;
  targetAgent: string;
  method: string;
  amount: number | null;
  currency: string | null;
  paymentProvider: string | null;
  paymentStatus: string | null;
  transactionHash: string | null;
  status: string;
  sourceData: SourceDataReference | null;
  summary: string;
}

interface SourceDataResult {
  transaction: TransactionRecord;
  sourceRecord: Record<string, unknown> | null;
}

export const useMessagesStore = defineStore('messages', () => {
  const { protocolApi, resolveAgentApi } = useApi();

  const messages = ref<ProtocolMessage[]>([]);
  const selectedMessage = ref<ProtocolMessage | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const sourceData = ref<SourceDataResult | null>(null);
  const sourceDataLoading = ref(false);
  const sourceDataError = ref<string | null>(null);

  async function fetchMessages(filter?: MessageFilter) {
    loading.value = true;
    error.value = null;
    try {
      const params = filter
        ? '?' + new URLSearchParams(
            Object.entries(filter)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)])
          ).toString()
        : '';
      const result = await protocolApi.get<{ messages: ProtocolMessage[]; total: number } | ProtocolMessage[]>(`/api/messages${params}`);
      messages.value = Array.isArray(result) ? result : result.messages;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function selectMessage(id: string) {
    loading.value = true;
    error.value = null;
    sourceData.value = null;
    sourceDataError.value = null;
    try {
      const result = await protocolApi.get<ProtocolMessage>(`/api/messages/${id}`);
      selectedMessage.value = result;
      fetchSourceData(result);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchSourceData(message: ProtocolMessage) {
    sourceDataLoading.value = true;
    sourceDataError.value = null;
    sourceData.value = null;

    try {
      const agents = [message.source, message.target].filter(Boolean);
      let foundTransaction: TransactionRecord | null = null;

      for (const agent of agents) {
        const api = resolveAgentApi(agent);
        if (api === protocolApi) continue;

        try {
          const result = await api.get<{ records: TransactionRecord[] }>(`/api/data/transactions/${agent}`);
          const match = result.records.find(t => t.messageId === message.id);
          if (match) {
            foundTransaction = match;
            break;
          }
        } catch {
          // This agent may not have transactions yet
        }
      }

      if (!foundTransaction) {
        sourceDataLoading.value = false;
        return;
      }

      let sourceRecord: Record<string, unknown> | null = null;
      if (foundTransaction.sourceData) {
        const { file, recordId } = foundTransaction.sourceData;
        const agentForFile = file.split('/')[0];
        const api = resolveAgentApi(agentForFile);
        try {
          sourceRecord = await api.get<Record<string, unknown>>(`/api/data/${file}/${recordId}`);
        } catch {
          // Source record may not exist
        }
      }

      sourceData.value = { transaction: foundTransaction, sourceRecord };
    } catch (e) {
      sourceDataError.value = e instanceof Error ? e.message : String(e);
    } finally {
      sourceDataLoading.value = false;
    }
  }

  function clearSelection() {
    selectedMessage.value = null;
    sourceData.value = null;
    sourceDataError.value = null;
  }

  return {
    messages, selectedMessage, loading, error,
    sourceData, sourceDataLoading, sourceDataError,
    fetchMessages, selectMessage, clearSelection,
  };
});
