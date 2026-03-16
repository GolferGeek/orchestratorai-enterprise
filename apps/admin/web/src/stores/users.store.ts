/**
 * Users Store
 * State management for admin user management — state ONLY, no async calls.
 * Service layer calls store mutations after API success.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AdminUser } from '@/services/auth-api.service';

export const useUsersStore = defineStore('users', () => {
  // ===================== State =====================
  const users = ref<AdminUser[]>([]);
  const selectedUserId = ref<string | null>(null);
  const currentOrgSlug = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ===================== Computed =====================
  const selectedUser = computed(() =>
    users.value.find((u) => u.id === selectedUserId.value) ?? null,
  );

  const activeUsers = computed(() =>
    users.value.filter((u) => u.status !== 'deactivated'),
  );

  const sortedUsers = computed(() =>
    [...users.value].sort((a, b) => {
      const nameA = a.displayName || a.email;
      const nameB = b.displayName || b.email;
      return nameA.localeCompare(nameB);
    }),
  );

  // ===================== Mutations =====================
  function setUsers(list: AdminUser[]) {
    users.value = list;
  }

  function addUser(user: AdminUser) {
    users.value.push(user);
  }

  function updateUser(updated: AdminUser) {
    const idx = users.value.findIndex((u) => u.id === updated.id);
    if (idx !== -1) {
      users.value[idx] = updated;
    }
  }

  function removeUser(userId: string) {
    users.value = users.value.filter((u) => u.id !== userId);
    if (selectedUserId.value === userId) {
      selectedUserId.value = null;
    }
  }

  function deactivateUser(userId: string) {
    const user = users.value.find((u) => u.id === userId);
    if (user) {
      user.status = 'deactivated';
    }
    if (selectedUserId.value === userId) {
      selectedUserId.value = null;
    }
  }

  function selectUser(userId: string | null) {
    selectedUserId.value = userId;
  }

  function setCurrentOrg(orgSlug: string | null) {
    currentOrgSlug.value = orgSlug;
  }

  function setLoading(val: boolean) {
    loading.value = val;
  }

  function setError(msg: string | null) {
    error.value = msg;
  }

  function reset() {
    users.value = [];
    selectedUserId.value = null;
    currentOrgSlug.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    // State
    users,
    selectedUserId,
    currentOrgSlug,
    loading,
    error,
    // Computed
    selectedUser,
    activeUsers,
    sortedUsers,
    // Mutations
    setUsers,
    addUser,
    updateUser,
    removeUser,
    deactivateUser,
    selectUser,
    setCurrentOrg,
    setLoading,
    setError,
    reset,
  };
});
