/**
 * Orgs Store
 * State management for organizations — state ONLY, no async calls.
 * Service layer calls store mutations after API success.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Organization } from '@/services/auth-api.service';

export const useOrgsStore = defineStore('orgs', () => {
  // ===================== State =====================
  const orgs = ref<Organization[]>([]);
  const selectedOrgSlug = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ===================== Computed =====================
  const selectedOrg = computed(() =>
    orgs.value.find((o) => o.slug === selectedOrgSlug.value) ?? null,
  );

  const sortedOrgs = computed(() =>
    [...orgs.value].sort((a, b) => a.name.localeCompare(b.name)),
  );

  // ===================== Mutations =====================
  function setOrgs(list: Organization[]) {
    orgs.value = list;
  }

  function addOrg(org: Organization) {
    orgs.value.push(org);
  }

  function updateOrg(updated: Organization) {
    const idx = orgs.value.findIndex((o) => o.slug === updated.slug);
    if (idx !== -1) {
      orgs.value[idx] = updated;
    }
  }

  function removeOrg(slug: string) {
    orgs.value = orgs.value.filter((o) => o.slug !== slug);
    if (selectedOrgSlug.value === slug) {
      selectedOrgSlug.value = null;
    }
  }

  function selectOrg(slug: string | null) {
    selectedOrgSlug.value = slug;
  }

  function setLoading(val: boolean) {
    loading.value = val;
  }

  function setError(msg: string | null) {
    error.value = msg;
  }

  function reset() {
    orgs.value = [];
    selectedOrgSlug.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    // State
    orgs,
    selectedOrgSlug,
    loading,
    error,
    // Computed
    selectedOrg,
    sortedOrgs,
    // Mutations
    setOrgs,
    addOrg,
    updateOrg,
    removeOrg,
    selectOrg,
    setLoading,
    setError,
    reset,
  };
});
