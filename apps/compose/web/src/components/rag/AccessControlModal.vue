<template>
  <ion-modal :is-open="isOpen" @didDismiss="handleDismiss">
    <ion-header>
      <ion-toolbar>
        <ion-title>Manage Access</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="handleDismiss">Cancel</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <!-- Quick Actions -->
      <div class="quick-actions">
        <ion-item lines="none">
          <ion-checkbox
            :checked="isPrivateToMe"
            @ionChange="togglePrivateToMe"
            slot="start"
          />
          <ion-label>
            <h3>Only me</h3>
            <p>Only you can access this collection</p>
          </ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-checkbox
            :checked="isOrgWide"
            @ionChange="toggleOrgWide"
            slot="start"
          />
          <ion-label>
            <h3>Everyone in organization</h3>
            <p>All org members with RAG permissions can access</p>
          </ion-label>
        </ion-item>
      </div>

      <ion-item-divider>
        <ion-label>Role Requirement</ion-label>
      </ion-item-divider>

      <!-- Role Selector -->
      <ion-item>
        <ion-label position="stacked">Required Role (optional)</ion-label>
        <ion-select
          v-model="selectedRole"
          interface="popover"
          placeholder="No role requirement"
        >
          <ion-select-option :value="null">No role requirement</ion-select-option>
          <ion-select-option
            v-for="role in availableRoles"
            :key="role.name"
            :value="role.name"
          >
            {{ role.displayName }}
          </ion-select-option>
        </ion-select>
      </ion-item>
      <p class="role-help">Users must have this role AND be in the allowed users list (if set)</p>

      <ion-item-divider>
        <ion-label>Specific Users</ion-label>
      </ion-item-divider>

      <!-- User Search -->
      <ion-searchbar
        v-model="searchQuery"
        placeholder="Search users..."
        :disabled="isOrgWide"
        :debounce="300"
      />

      <!-- Selected Users -->
      <div v-if="selectedUsers.length > 0 && !isOrgWide" class="selected-users">
        <ion-chip
          v-for="user in selectedUsers"
          :key="user.id"
          @click="removeUser(user.id)"
        >
          <ion-label>{{ user.displayName || user.email }}</ion-label>
          <ion-icon :icon="closeCircle" />
        </ion-chip>
      </div>

      <!-- User List -->
      <ion-list v-if="!isOrgWide" class="user-list">
        <ion-item
          v-for="user in filteredUsers"
          :key="user.id"
          @click="toggleUser(user)"
          button
        >
          <ion-checkbox
            slot="start"
            :checked="isUserSelected(user.id)"
          />
          <ion-label>
            <h3>{{ user.displayName || user.email }}</h3>
            <p>{{ user.email }}</p>
          </ion-label>
          <ion-badge v-if="user.id === currentUserId" color="secondary" slot="end">
            You
          </ion-badge>
        </ion-item>
        <ion-item v-if="filteredUsers.length === 0 && !isLoading">
          <ion-label color="medium">
            {{ searchQuery ? 'No users found' : 'No users available' }}
          </ion-label>
        </ion-item>
      </ion-list>

      <!-- Loading -->
      <div v-if="isLoading" class="loading-state">
        <ion-spinner name="crescent" />
        <p>Loading users...</p>
      </div>

      <!-- Save Button -->
      <div class="modal-actions">
        <ion-button expand="block" @click="handleSave" :disabled="isLoading">
          Save Access Settings
        </ion-button>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonItem,
  IonLabel,
  IonCheckbox,
  IonSelect,
  IonSelectOption,
  IonSearchbar,
  IonList,
  IonChip,
  IonIcon,
  IonBadge,
  IonSpinner,
  IonItemDivider,
} from '@ionic/vue';
import { closeCircle } from 'ionicons/icons';
import { userManagementService, type User } from '@/services/userManagementService';
import rbacService, { type RbacRole } from '@/services/rbacService';
import { useAuthStore } from '@/stores/rbacStore';

interface Props {
  isOpen: boolean;
  currentAllowedUsers: string[] | null;
  currentRequiredRole: string | null;
}

interface Emits {
  (e: 'dismiss'): void;
  (e: 'save', data: { allowedUsers: string[] | null; requiredRole: string | null; clearAllowedUsers: boolean }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const authStore = useAuthStore();
const currentUserId = computed(() => authStore.user?.id);

// State
const isLoading = ref(false);
const searchQuery = ref('');
const allUsers = ref<User[]>([]);
const availableRoles = ref<RbacRole[]>([]);
const selectedUsers = ref<User[]>([]);
const selectedRole = ref<string | null>(null);

// Computed
const isPrivateToMe = computed(() => {
  return selectedUsers.value.length === 1 &&
         selectedUsers.value[0]?.id === currentUserId.value;
});

const isOrgWide = computed(() => {
  return selectedUsers.value.length === 0 && !isPrivateToMe.value;
});

const filteredUsers = computed(() => {
  if (!searchQuery.value) {
    return allUsers.value;
  }
  const query = searchQuery.value.toLowerCase();
  return allUsers.value.filter(
    user =>
      user.email.toLowerCase().includes(query) ||
      (user.displayName && user.displayName.toLowerCase().includes(query))
  );
});

// Methods
const isUserSelected = (userId: string) => {
  return selectedUsers.value.some(u => u.id === userId);
};

const toggleUser = (user: User) => {
  if (isUserSelected(user.id)) {
    removeUser(user.id);
  } else {
    selectedUsers.value.push(user);
  }
};

const removeUser = (userId: string) => {
  selectedUsers.value = selectedUsers.value.filter(u => u.id !== userId);
};

const togglePrivateToMe = () => {
  if (isPrivateToMe.value) {
    // Currently private, make org-wide
    selectedUsers.value = [];
  } else {
    // Make private to me
    const currentUser = allUsers.value.find(u => u.id === currentUserId.value);
    if (currentUser) {
      selectedUsers.value = [currentUser];
    }
  }
};

const toggleOrgWide = () => {
  if (isOrgWide.value) {
    // Currently org-wide, make private to me
    const currentUser = allUsers.value.find(u => u.id === currentUserId.value);
    if (currentUser) {
      selectedUsers.value = [currentUser];
    }
  } else {
    // Make org-wide
    selectedUsers.value = [];
  }
};

const handleDismiss = () => {
  emit('dismiss');
};

const handleSave = () => {
  const allowedUsers = selectedUsers.value.length > 0
    ? selectedUsers.value.map(u => u.id)
    : null;

  emit('save', {
    allowedUsers,
    requiredRole: selectedRole.value,
    clearAllowedUsers: selectedUsers.value.length === 0,
  });
};

const loadData = async () => {
  isLoading.value = true;
  try {
    const [users, roles] = await Promise.all([
      userManagementService.getAllUsers(),
      rbacService.getAllRoles(),
    ]);
    allUsers.value = users;
    availableRoles.value = roles.filter(r => !r.isSystem || r.name !== 'super-admin');
  } catch (error) {
    console.error('Failed to load access control data:', error);
  } finally {
    isLoading.value = false;
  }
};

// Initialize from props
const initializeFromProps = () => {
  selectedRole.value = props.currentRequiredRole;

  if (props.currentAllowedUsers && props.currentAllowedUsers.length > 0) {
    selectedUsers.value = allUsers.value.filter(u =>
      props.currentAllowedUsers!.includes(u.id)
    );
  } else {
    selectedUsers.value = [];
  }
};

// Watch for modal open
watch(() => props.isOpen, async (newVal) => {
  if (newVal) {
    await loadData();
    initializeFromProps();
  }
});

onMounted(() => {
  if (props.isOpen) {
    loadData().then(initializeFromProps);
  }
});
</script>

<style scoped>
.quick-actions {
  margin-bottom: 1rem;
}

.quick-actions ion-item {
  --background: var(--ion-color-light);
  border-radius: 8px;
  margin-bottom: 0.5rem;
}

.role-help {
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  padding: 0 1rem;
  margin-top: 0.25rem;
}

.selected-users {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 0;
}

.selected-users ion-chip {
  cursor: pointer;
}

.user-list {
  max-height: 300px;
  overflow-y: auto;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
}

.modal-actions {
  margin-top: 2rem;
  padding-bottom: 1rem;
}

ion-item-divider {
  margin-top: 1rem;
}
</style>
