import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { WalletState, PaymentTransaction } from '../types';
import { useApi } from '../composables/useApi';

export const useWalletStore = defineStore('wallet', () => {
  const { protocolApi } = useApi();

  const wallet = ref<WalletState | null>(null);
  const transactions = ref<PaymentTransaction[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchWallet() {
    loading.value = true;
    error.value = null;
    try {
      const result = await protocolApi.get<WalletState>('/api/wallet');
      wallet.value = result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchTransactions() {
    loading.value = true;
    error.value = null;
    try {
      const result = await protocolApi.get<PaymentTransaction[]>('/api/wallet/transactions');
      transactions.value = result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return { wallet, transactions, loading, error, fetchWallet, fetchTransactions };
});
