/**
 * Entitlements Store
 * Reads capability entitlements from the unified platform API.
 * Determines which capabilities the user can access and drives navigation.
 *
 * Store layer: state only. The entitlementsService handles all async calls.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface ProductEntitlement {
  productSlug: string;
  productName: string;
  description: string;
  port: number;
  icon: string;
  hasAccess: boolean;
  webUrl?: string;
}

export const useEntitlementsStore = defineStore('entitlements', () => {
  const entitlements = ref<ProductEntitlement[]>([]);
  const isLoaded = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const accessibleProducts = computed(() =>
    entitlements.value.filter(p => p.hasAccess)
  );

  function setEntitlements(products: ProductEntitlement[]): void {
    entitlements.value = products;
    isLoaded.value = true;
    error.value = null;
  }

  function setLoading(loading: boolean): void {
    isLoading.value = loading;
  }

  function setError(message: string): void {
    error.value = message;
    isLoading.value = false;
  }

  function reset(): void {
    entitlements.value = [];
    isLoaded.value = false;
    isLoading.value = false;
    error.value = null;
  }

  return {
    entitlements,
    isLoaded,
    isLoading,
    error,
    accessibleProducts,
    setEntitlements,
    setLoading,
    setError,
    reset,
  };
});
