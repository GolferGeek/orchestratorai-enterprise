<template>
  <ion-page>
  <div class="detail-view">
    <!-- Detail Header -->
    <div class="detail-header">
      <h2>User Management</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="refreshUsers">
          <ion-icon :icon="refreshOutline" slot="icon-only"></ion-icon>
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <div v-if="!rbacStore.isInitialized || !rbacStore.currentOrganization" class="loading-state">
        <ion-spinner></ion-spinner>
        <p>Initializing...</p>
      </div>
      <div v-else class="master-detail-container">
        <!-- Master Panel: User List -->
        <div class="master-panel">
          <!-- Organization Selector -->
          <ion-card v-if="organizations.length > 1" class="org-selector-card">
            <ion-card-content>
              <div class="org-label-container">
                <ion-label color="medium">Organization</ion-label>
              </div>
              <ion-item lines="full" class="org-select-item">
                <ion-select
                  v-if="selectedOrg"
                  :value="selectedOrg"
                  @ionChange="onOrgChange($event)"
                  interface="popover"
                >
                  <ion-select-option
                    v-for="org in organizations"
                    :key="org.slug"
                    :value="org.slug"
                  >
                    {{ org.name }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
            </ion-card-content>
          </ion-card>

          <!-- Action Buttons -->
          <div class="action-buttons">
            <ion-button expand="block" @click="showCreateUserForm = true">
              <ion-icon :icon="addCircleOutline" slot="start"></ion-icon>
              Create User
            </ion-button>
            <ion-button expand="block" fill="outline" @click="showAddUserToOrgForm = true">
              <ion-icon :icon="personAddOutline" slot="start"></ion-icon>
              Add User to Organization
            </ion-button>
          </div>

          <!-- Loading State -->
          <div v-if="loading" class="loading-state">
            <ion-spinner></ion-spinner>
            <p>Loading users...</p>
          </div>

          <!-- Users List -->
          <ion-list v-else class="users-list">
            <template v-if="users.length > 0">
              <ion-item
                v-for="user in users"
                :key="user.id"
                button
                @click="selectUser(user)"
                :class="{ 'selected-user': selectedUser?.id === user.id }"
              >
                <ion-avatar slot="start">
                  <div class="avatar-placeholder">{{ getInitials(user.email) }}</div>
                </ion-avatar>
                <ion-label>
                  <h2>{{ user.displayName || user.email }}</h2>
                  <p>{{ user.email }}</p>
                  <p v-if="user.roles && user.roles.length > 0" class="roles-list">
                    <ion-badge
                      v-for="role in user.roles.slice(0, 2)"
                      :key="role.name"
                      :color="getRoleBadgeColor(role.name)"
                      class="role-badge"
                    >
                      {{ role.displayName }}
                    </ion-badge>
                    <ion-badge v-if="user.roles.length > 2" color="medium" class="role-badge">
                      +{{ user.roles.length - 2 }} more
                    </ion-badge>
                  </p>
                </ion-label>
              </ion-item>
            </template>

            <div v-else class="empty-state">
              <ion-icon :icon="peopleOutline" size="large" color="medium"></ion-icon>
              <p>No users found in this organization</p>
            </div>
          </ion-list>
        </div>

        <!-- Detail Panel: User Details -->
        <div class="detail-panel" v-if="selectedUser">
          <!-- User Header Card -->
          <ion-card class="user-header-card">
            <ion-card-header>
              <div class="user-header-info">
                <ion-card-title>{{ selectedUser.displayName || selectedUser.email }}</ion-card-title>
                <ion-card-subtitle>{{ selectedUser.email }}</ion-card-subtitle>
              </div>
            </ion-card-header>
            <ion-card-content>
              <div class="user-actions">
                <ion-button
                  color="warning"
                  fill="outline"
                  size="small"
                  @click="confirmRemoveFromOrg"
                >
                  <ion-icon :icon="removeCircleOutline" slot="start"></ion-icon>
                  Remove from Org
                </ion-button>
                <ion-button
                  color="danger"
                  fill="outline"
                  size="small"
                  @click="confirmDeleteUser"
                >
                  <ion-icon :icon="trashOutline" slot="start"></ion-icon>
                  Delete User
                </ion-button>
              </div>
            </ion-card-content>
          </ion-card>

          <!-- Current Roles Card -->
          <ion-card class="roles-card">
            <ion-card-header>
              <ion-card-title>Current Roles</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <div class="roles-grid">
                <ion-chip
                  v-for="role in (selectedUser.roles || [])"
                  :key="role.name"
                  :color="getRoleBadgeColor(role.name)"
                  @click="confirmRemoveRole(role)"
                >
                  <ion-label>{{ role.displayName }}</ion-label>
                  <ion-icon :icon="closeCircleOutline"></ion-icon>
                </ion-chip>
                <p v-if="!selectedUser.roles || selectedUser.roles.length === 0" class="empty-message">
                  No roles assigned
                </p>
              </div>
            </ion-card-content>
          </ion-card>

          <!-- Effective Permissions Card -->
          <ion-card class="permissions-card">
            <ion-card-header>
              <ion-card-title>Effective Permissions</ion-card-title>
              <ion-card-subtitle>Permissions granted through assigned roles</ion-card-subtitle>
            </ion-card-header>
            <ion-card-content class="permissions-content">
              <div v-if="userPermissions.length > 0" class="permissions-grid">
                <ion-chip
                  v-for="permission in userPermissions"
                  :key="permission.name"
                  color="secondary"
                  outline
                >
                  <ion-label>{{ permission.displayName }}</ion-label>
                </ion-chip>
              </div>
              <p v-else class="empty-message">
                No permissions assigned
              </p>
            </ion-card-content>
          </ion-card>

          <!-- Add Role Card -->
          <ion-card class="add-role-card">
            <ion-card-header>
              <ion-card-title>Add Role</ion-card-title>
            </ion-card-header>
            <ion-card-content class="add-role-content">
              <ion-list v-if="availableRolesToAdd.length > 0" class="add-role-list">
                <ion-item
                  v-for="role in availableRolesToAdd"
                  :key="role.name"
                  button
                  @click="addRole(role)"
                >
                  <ion-label>
                    <h3>{{ role.displayName }}</h3>
                    <p>{{ role.description }}</p>
                  </ion-label>
                  <ion-icon :icon="addCircleOutline" slot="end" color="secondary"></ion-icon>
                </ion-item>
              </ion-list>
              <p v-else class="empty-message">
                User has all available roles
              </p>
            </ion-card-content>
          </ion-card>

          <!-- Password Management Card -->
          <ion-card class="password-card">
            <ion-card-header>
              <ion-card-title>Password Management</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <div class="password-actions">
                <ion-button expand="block" @click="showPasswordChangeForm = true">
                  <ion-icon :icon="keyOutline" slot="start"></ion-icon>
                  Change Password
                </ion-button>
                <ion-button expand="block" fill="outline" @click="sendPasswordReset">
                  <ion-icon :icon="mailOutline" slot="start"></ion-icon>
                  Send Password Reset Email
                </ion-button>
              </div>
            </ion-card-content>
          </ion-card>
        </div>

        <!-- Empty State for Detail Panel -->
        <div class="detail-panel empty-details" v-else>
          <div class="empty-state">
            <ion-icon :icon="personCircleOutline" size="large" color="medium"></ion-icon>
            <h2>Select a user</h2>
            <p>Choose a user from the list to view and manage their details</p>
          </div>
        </div>
      </div>

      <!-- Create User Modal -->
      <ion-modal :is-open="showCreateUserForm" @didDismiss="resetCreateUserForm">
        <ion-header>
          <ion-toolbar>
            <ion-title>Create New User</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="showCreateUserForm = false">Cancel</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <ion-card>
            <ion-card-content>
              <ion-item>
                <ion-label position="stacked">Email *</ion-label>
                <ion-input v-model="newUser.email" type="email" required></ion-input>
              </ion-item>
              <ion-item>
                <ion-label position="stacked">Display Name</ion-label>
                <ion-input v-model="newUser.displayName"></ion-input>
              </ion-item>
              <ion-item>
                <ion-label position="stacked">Password *</ion-label>
                <ion-input v-model="newUser.password" type="password" required></ion-input>
              </ion-item>
              <ion-item>
                <ion-label position="stacked">Organizations *</ion-label>
                <ion-select 
                  v-if="organizations.length > 0" 
                  v-model="newUser.organizationAccess" 
                  multiple
                  interface="popover"
                  :placeholder="rbacStore.currentOrganization || 'Select organizations'"
                >
                  <ion-select-option 
                    v-for="org in organizations" 
                    :key="org.slug" 
                    :value="org.slug"
                  >
                    {{ org.name }}
                  </ion-select-option>
                </ion-select>
                <ion-spinner v-else name="dots"></ion-spinner>
                <p v-if="organizations.length > 0" class="form-hint">
                  Select one or more organizations to add this user to
                </p>
              </ion-item>
              <ion-item>
                <ion-label position="stacked">Initial Roles</ion-label>
                <ion-select v-if="rbacStore.allRoles.length > 0" v-model="newUser.roles" multiple>
                  <ion-select-option v-for="role in rbacStore.allRoles" :key="role.name" :value="role.name">
                    {{ role.displayName }}
                  </ion-select-option>
                </ion-select>
                <ion-spinner v-else name="dots"></ion-spinner>
              </ion-item>
              <ion-item>
                <ion-label>Email Confirmation Required</ion-label>
                <ion-toggle v-model="newUser.emailConfirm"></ion-toggle>
              </ion-item>
              <ion-button
                expand="block"
                @click="createUser"
                :disabled="!newUser.email || !newUser.password || !newUser.organizationAccess || newUser.organizationAccess.length === 0 || creatingUser"
                class="create-button"
              >
                <ion-spinner v-if="creatingUser" slot="start"></ion-spinner>
                <ion-icon v-else :icon="addCircleOutline" slot="start"></ion-icon>
                {{ creatingUser ? 'Creating...' : 'Create User' }}
              </ion-button>
            </ion-card-content>
          </ion-card>
        </ion-content>
      </ion-modal>

      <!-- Add User to Organization Modal -->
      <ion-modal :is-open="showAddUserToOrgForm" @didDismiss="resetAddUserToOrgForm">
        <ion-header>
          <ion-toolbar>
            <ion-title>Add User to {{ rbacStore.currentOrganization }}</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="showAddUserToOrgForm = false">Cancel</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <ion-card>
            <ion-card-content>
              <ion-item>
                <ion-label position="stacked">Select User *</ion-label>
                <ion-select 
                  v-model="selectedUserToAdd.id" 
                  interface="popover"
                  placeholder="Choose a user"
                >
                  <ion-select-option 
                    v-for="user in availableUsersToAdd" 
                    :key="user.id" 
                    :value="user.id"
                  >
                    {{ user.displayName || user.email }} ({{ user.email }})
                  </ion-select-option>
                </ion-select>
                <p v-if="availableUsersToAdd.length === 0" class="form-hint">
                  All users are already in this organization
                </p>
              </ion-item>
              <ion-item>
                <ion-label position="stacked">Role *</ion-label>
                <ion-select 
                  v-if="rbacStore.allRoles.length > 0" 
                  v-model="selectedUserToAdd.role" 
                  interface="popover"
                  placeholder="Select a role"
                >
                  <ion-select-option 
                    v-for="role in rbacStore.allRoles" 
                    :key="role.name" 
                    :value="role.name"
                  >
                    {{ role.displayName }}
                  </ion-select-option>
                </ion-select>
                <ion-spinner v-else name="dots"></ion-spinner>
              </ion-item>
              <ion-button
                expand="block"
                @click="addUserToOrganization"
                :disabled="!selectedUserToAdd.id || !selectedUserToAdd.role || addingUserToOrg || availableUsersToAdd.length === 0"
                class="create-button"
              >
                <ion-spinner v-if="addingUserToOrg" slot="start"></ion-spinner>
                <ion-icon v-else :icon="personAddOutline" slot="start"></ion-icon>
                {{ addingUserToOrg ? 'Adding...' : 'Add User' }}
              </ion-button>
            </ion-card-content>
          </ion-card>
        </ion-content>
      </ion-modal>

      <!-- Change Password Modal -->
      <ion-modal :is-open="showPasswordChangeForm" @didDismiss="resetPasswordChangeForm">
        <ion-header>
          <ion-toolbar>
            <ion-title>Change Password</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="showPasswordChangeForm = false">Cancel</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <ion-card>
            <ion-card-content>
              <ion-item>
                <ion-label position="stacked">New Password *</ion-label>
                <ion-input v-model="newPassword" type="password" required></ion-input>
              </ion-item>
              <ion-item>
                <ion-label position="stacked">Confirm Password *</ion-label>
                <ion-input v-model="confirmPassword" type="password" required></ion-input>
              </ion-item>
              <p v-if="newPassword && newPassword.length < 6" class="password-hint">
                Password must be at least 6 characters
              </p>
              <p v-if="newPassword && confirmPassword && newPassword !== confirmPassword" class="password-error">
                Passwords do not match
              </p>
              <ion-button
                expand="block"
                @click="changePassword"
                :disabled="!newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6 || changingPassword"
                class="change-password-button"
              >
                <ion-spinner v-if="changingPassword" slot="start"></ion-spinner>
                <ion-icon v-else :icon="keyOutline" slot="start"></ion-icon>
                {{ changingPassword ? 'Changing...' : 'Change Password' }}
              </ion-button>
            </ion-card-content>
          </ion-card>
        </ion-content>
      </ion-modal>
    </div>
  </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  IonCard,
  IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonList, IonItem, IonLabel, IonIcon, IonButton, IonButtons,
  IonSpinner, IonSelect, IonSelectOption, IonBadge,
  IonModal, IonChip, IonAvatar, IonInput, IonToggle,
  IonHeader, IonToolbar, IonTitle, IonContent,
  alertController, toastController,
  IonPage,
} from '@ionic/vue';
import {
  refreshOutline, peopleOutline,
  closeCircleOutline, addCircleOutline, trashOutline, keyOutline,
  mailOutline, personCircleOutline, personAddOutline, removeCircleOutline
} from 'ionicons/icons';
import { useRbacStore } from '@/stores/rbacStore';
import rbacService, { type UserRole, type RbacRole, type RbacPermission } from '@/services/rbacService';
import { userManagementService, type CreateUserRequest } from '@/services/userManagementService';

interface UserWithRoles {
  id: string;
  email: string;
  displayName?: string;
  roles: UserRole[];
}

const rbacStore = useRbacStore();

const loading = ref(false);
const selectedUser = ref<UserWithRoles | null>(null);
const selectedUserPermissions = ref<RbacPermission[]>([]);

// Create User Form
const showCreateUserForm = ref(false);
const creatingUser = ref(false);
const newUser = ref<CreateUserRequest>({
  email: '',
  password: '',
  displayName: '',
  roles: ['member'],
  emailConfirm: true,
  organizationAccess: []
});

// Add User to Organization Form
const showAddUserToOrgForm = ref(false);
const addingUserToOrg = ref(false);
const allUsers = ref<Array<{ id: string; email: string; displayName?: string }>>([]);
const selectedUserToAdd = ref<{ id: string; role: string }>({ id: '', role: 'member' });

// Change Password Form
const showPasswordChangeForm = ref(false);
const changingPassword = ref(false);
const newPassword = ref('');
const confirmPassword = ref('');

const organizations = computed(() => rbacStore.userOrganizations.map(org => ({
  slug: org.organizationSlug,
  name: org.organizationName
})));

const selectedOrg = computed(() => rbacStore.currentOrganization || '');

// Users come from the store - reactive to org changes
const users = computed(() => {
  return rbacStore.currentOrgUsers.map(user => ({
    id: user.userId,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles
  }));
});

const availableRolesToAdd = computed(() => {
  if (!selectedUser.value) return [];
  const userRoleNames = selectedUser.value.roles.map(r => r.name);
  return rbacStore.allRoles.filter(r => !userRoleNames.includes(r.name) && !r.isSystem);
});

// Filter users to show only those NOT already in the current organization
const availableUsersToAdd = computed(() => {
  if (!rbacStore.currentOrganization) return [];
  const currentOrgUserIds = new Set(rbacStore.currentOrgUsers.map(u => u.userId));
  return allUsers.value.filter(user => !currentOrgUserIds.has(user.id));
});

const userPermissions = computed(() => selectedUserPermissions.value);

onMounted(async () => {
  if (!rbacStore.isInitialized) {
    await rbacStore.initialize();
  }

  // Set initial organization if not already set
  if (!rbacStore.currentOrganization && organizations.value.length > 0) {
    await rbacStore.setOrganization(organizations.value[0].slug);
  }
  
  // Load all users for the "Add User to Organization" feature
  await loadAllUsers();
  
  // Initialize organizationAccess with current organization when form opens
  watch(showCreateUserForm, (isOpen) => {
    if (isOpen && rbacStore.currentOrganization) {
      if (!newUser.value.organizationAccess || newUser.value.organizationAccess.length === 0) {
        newUser.value.organizationAccess = [rbacStore.currentOrganization];
      }
    }
  });
  
  // Reload users when organization changes
  watch(() => rbacStore.currentOrganization, async () => {
    await loadAllUsers();
  });
});

async function loadAllUsers() {
  try {
    const users = await userManagementService.getAllUsers();
    allUsers.value = users.map(u => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName
    }));
  } catch (error) {
    console.error('Failed to load all users:', error);
  }
}

async function refreshUsers() {
  if (rbacStore.currentOrganization) {
    loading.value = true;
    try {
      await rbacStore.loadOrganizationUsers(rbacStore.currentOrganization);
      await loadAllUsers();
    } catch (error) {
      console.error('Failed to load users:', error);
      const toast = await toastController.create({
        message: 'Failed to load users. Please try again.',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
    } finally {
      loading.value = false;
    }
  }
}

async function onOrgChange(event: CustomEvent) {
  const newOrg = event.detail.value;
  if (newOrg === rbacStore.currentOrganization) return;

  loading.value = true;
  selectedUser.value = null; // Clear selection when changing org
  try {
    await rbacStore.setOrganization(newOrg);
  } catch (error) {
    console.error('Failed to change organization:', error);
    const toast = await toastController.create({
      message: 'Failed to load organization data',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  } finally {
    loading.value = false;
  }
}

async function selectUser(user: UserWithRoles) {
  selectedUser.value = user;
  selectedUserPermissions.value = [];

  // Fetch user's permissions
  await refreshUserPermissions();
}

async function refreshUserPermissions() {
  if (!selectedUser.value) return;

  try {
    const userPerms = await rbacService.getUserPermissions(selectedUser.value.id, selectedOrg.value);
    const permNames = userPerms.map(p => p.permission);

    if (permNames.includes('*:*')) {
      selectedUserPermissions.value = rbacStore.allPermissions;
    } else {
      selectedUserPermissions.value = rbacStore.allPermissions.filter(p =>
        permNames.includes(p.name)
      );
    }
  } catch (error) {
    console.error('Failed to load user permissions:', error);
    selectedUserPermissions.value = [];
  }
}

async function addRole(role: RbacRole) {
  if (!selectedUser.value || !rbacStore.currentOrganization) return;
  try {
    await rbacService.assignRole(
      selectedUser.value.id,
      rbacStore.currentOrganization,
      role.name
    );

    await rbacStore.loadOrganizationUsers(rbacStore.currentOrganization);

    const updatedUser = rbacStore.currentOrgUsers.find(u => u.userId === selectedUser.value!.id);
    if (updatedUser) {
      selectedUser.value = {
        id: updatedUser.userId,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        roles: updatedUser.roles
      };
    }

    await refreshUserPermissions();

    const toast = await toastController.create({
      message: `Role "${role.displayName}" added`,
      duration: 2000,
      color: 'success'
    });
    await toast.present();
  } catch (error) {
    console.error('Failed to add role:', error);
    const toast = await toastController.create({
      message: 'Failed to add role',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
}

async function confirmRemoveRole(role: UserRole) {
  const alert = await alertController.create({
    header: 'Remove Role',
    message: `Remove "${role.displayName}" role from this user?`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Remove',
        role: 'destructive',
        handler: () => removeRole(role)
      }
    ]
  });
  await alert.present();
}

async function removeRole(role: UserRole) {
  if (!selectedUser.value || !rbacStore.currentOrganization) return;
  try {
    await rbacService.revokeRole(
      selectedUser.value.id,
      rbacStore.currentOrganization,
      role.name
    );

    await rbacStore.loadOrganizationUsers(rbacStore.currentOrganization);

    const updatedUser = rbacStore.currentOrgUsers.find(u => u.userId === selectedUser.value!.id);
    if (updatedUser) {
      selectedUser.value = {
        id: updatedUser.userId,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        roles: updatedUser.roles
      };
    } else {
      // User no longer in this organization, clear selection
      selectedUser.value = null;
    }

    await refreshUserPermissions();

    const toast = await toastController.create({
      message: `Role "${role.displayName}" removed`,
      duration: 2000,
      color: 'success'
    });
    await toast.present();
  } catch (error) {
    console.error('Failed to remove role:', error);
    const toast = await toastController.create({
      message: 'Failed to remove role',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
}

async function confirmRemoveFromOrg() {
  if (!selectedUser.value || !rbacStore.currentOrganization) return;
  
  const alert = await alertController.create({
    header: 'Remove from Organization',
    message: `Remove ${selectedUser.value.displayName || selectedUser.value.email} from "${rbacStore.currentOrganization}"? This will remove all their roles in this organization.`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Remove',
        role: 'destructive',
        handler: () => removeUserFromOrganization()
      }
    ]
  });
  await alert.present();
}

async function removeUserFromOrganization() {
  if (!selectedUser.value || !rbacStore.currentOrganization) return;
  
  try {
    // Remove all roles for this user in the current organization
    const rolesToRemove = selectedUser.value.roles || [];
    
    for (const role of rolesToRemove) {
      await rbacService.revokeRole(
        selectedUser.value.id,
        rbacStore.currentOrganization,
        role.name
      );
    }

    await rbacStore.loadOrganizationUsers(rbacStore.currentOrganization);
    await loadAllUsers();

    // Clear selection since user is no longer in this org
    selectedUser.value = null;

    const toast = await toastController.create({
      message: 'User removed from organization',
      duration: 2000,
      color: 'success'
    });
    await toast.present();
  } catch (error) {
    console.error('Failed to remove user from organization:', error);
    const toast = await toastController.create({
      message: 'Failed to remove user from organization',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
}

function resetAddUserToOrgForm() {
  showAddUserToOrgForm.value = false;
  selectedUserToAdd.value = { id: '', role: 'member' };
}

async function addUserToOrganization() {
  if (!selectedUserToAdd.value.id || !selectedUserToAdd.value.role || !rbacStore.currentOrganization) return;
  
  addingUserToOrg.value = true;
  try {
    await rbacService.assignRole(
      selectedUserToAdd.value.id,
      rbacStore.currentOrganization,
      selectedUserToAdd.value.role
    );

    await rbacStore.loadOrganizationUsers(rbacStore.currentOrganization);
    await loadAllUsers();

    const toast = await toastController.create({
      message: 'User added to organization successfully',
      duration: 2000,
      color: 'success'
    });
    await toast.present();

    showAddUserToOrgForm.value = false;
    resetAddUserToOrgForm();
  } catch (error) {
    console.error('Failed to add user to organization:', error);
    const toast = await toastController.create({
      message: 'Failed to add user to organization',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  } finally {
    addingUserToOrg.value = false;
  }
}

async function confirmDeleteUser() {
  if (!selectedUser.value) return;

  const alert = await alertController.create({
    header: 'Delete User',
    message: `Are you sure you want to delete ${selectedUser.value.displayName || selectedUser.value.email}? This action cannot be undone.`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => deleteUser()
      }
    ]
  });
  await alert.present();
}

async function deleteUser() {
  if (!selectedUser.value || !rbacStore.currentOrganization) return;

  try {
    await userManagementService.deleteUser(selectedUser.value.id);

    const toast = await toastController.create({
      message: 'User deleted successfully',
      duration: 2000,
      color: 'success'
    });
    await toast.present();

    selectedUser.value = null;
    await rbacStore.loadOrganizationUsers(rbacStore.currentOrganization);
  } catch (error) {
    console.error('Failed to delete user:', error);
    const toast = await toastController.create({
      message: 'Failed to delete user',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
}

function resetCreateUserForm() {
  showCreateUserForm.value = false;
  newUser.value = {
    email: '',
    password: '',
    displayName: '',
    roles: ['member'],
    emailConfirm: true,
    organizationAccess: rbacStore.currentOrganization ? [rbacStore.currentOrganization] : []
  };
}

async function createUser() {
  if (!newUser.value.email || !newUser.value.password) return;
  if (!newUser.value.organizationAccess || newUser.value.organizationAccess.length === 0) {
    const toast = await toastController.create({
      message: 'Please select at least one organization',
      duration: 2000,
      color: 'warning'
    });
    await toast.present();
    return;
  }

  creatingUser.value = true;
  try {
    await userManagementService.createUser(newUser.value);

    const toast = await toastController.create({
      message: 'User created successfully',
      duration: 2000,
      color: 'success'
    });
    await toast.present();

    showCreateUserForm.value = false;

    // Refresh users for all organizations the user was added to
    const addedOrgs = newUser.value.organizationAccess || [];
    if (addedOrgs.length > 0) {
      for (const orgSlug of addedOrgs) {
        await rbacStore.loadOrganizationUsers(orgSlug);
      }
    }
  } catch (error) {
    console.error('Failed to create user:', error);
    const toast = await toastController.create({
      message: 'Failed to create user',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  } finally {
    creatingUser.value = false;
  }
}

function resetPasswordChangeForm() {
  showPasswordChangeForm.value = false;
  newPassword.value = '';
  confirmPassword.value = '';
}

async function changePassword() {
  if (!selectedUser.value || !newPassword.value || newPassword.value !== confirmPassword.value) return;

  changingPassword.value = true;
  try {
    await userManagementService.changeUserPassword(selectedUser.value.id, newPassword.value);

    const toast = await toastController.create({
      message: 'Password changed successfully',
      duration: 2000,
      color: 'success'
    });
    await toast.present();

    showPasswordChangeForm.value = false;
  } catch (error) {
    console.error('Failed to change password:', error);
    const toast = await toastController.create({
      message: 'Failed to change password',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  } finally {
    changingPassword.value = false;
  }
}

async function sendPasswordReset() {
  if (!selectedUser.value) return;

  try {
    await userManagementService.initiatePasswordReset(selectedUser.value.email);

    const toast = await toastController.create({
      message: 'Password reset email sent',
      duration: 2000,
      color: 'success'
    });
    await toast.present();
  } catch (error) {
    console.error('Failed to send password reset:', error);
    const toast = await toastController.create({
      message: 'Failed to send password reset email',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
}

function getInitials(email: string): string {
  return email.substring(0, 2).toUpperCase();
}

function getRoleBadgeColor(roleName: string): string {
  const colors: Record<string, string> = {
    'super-admin': 'danger',
    'admin': 'warning',
    'manager': 'tertiary',
    'member': 'primary',
    'viewer': 'medium'
  };
  return colors[roleName] || 'medium';
}
</script>

<style scoped>
/* Detail View Container */
.detail-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ion-color-light-shade);
  background: var(--ion-color-light);
}

.detail-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
}

.header-actions {
  display: flex;
  gap: 0.25rem;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
}

/* Master-Detail Container */
.master-detail-container {
  display: grid;
  grid-template-columns: 350px 1fr;
  height: 100%;
  gap: 1rem;
  padding: 1rem;
}

/* Master Panel - User List */
.master-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  background: var(--ion-background-color);
  border-radius: 8px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  padding: 1rem;
}

.org-selector-card {
  margin: 0;
}

.org-label-container {
  margin-bottom: 4px;
  padding-left: 4px;
}

.org-label-container ion-label {
  font-size: 0.9em;
}

.org-select-item {
  --padding-start: 0;
}

.org-select-item ion-select {
  width: 100%;
  max-width: 100%;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.users-list {
  flex: 1;
  overflow-y: auto;
}

.users-list {
  background: transparent;
}

.users-list ion-item {
  cursor: pointer;
  margin-bottom: 0.5rem;
  border-radius: 8px;
  --background: var(--ion-background-color);
  --border-color: var(--ion-border-color, var(--ion-color-light-shade));
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}

.users-list ion-item:hover {
  --background: var(--ion-color-light-tint);
  transform: translateX(2px);
}

.users-list ion-item.selected-user {
  --background: var(--ion-color-primary);
  --color: white;
  border-color: var(--ion-color-primary-shade);
  box-shadow: 0 2px 8px rgba(var(--ion-color-primary-rgb), 0.3);
}

.users-list ion-item.selected-user ion-label h2,
.users-list ion-item.selected-user ion-label p {
  color: white;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ion-color-primary);
  color: white;
  font-weight: bold;
  border-radius: 50%;
}

.roles-list {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.role-badge {
  margin: 0;
  font-size: 0.75rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--ion-color-medium);
}

.empty-state ion-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

/* Detail Panel - User Details */
.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  padding: 1rem;
  background: var(--ion-background-color);
  border-radius: 8px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.detail-panel.empty-details {
  justify-content: center;
  align-items: center;
}

/* User Header Card */
.user-header-card {
  margin: 0;
  flex-shrink: 0;
}

.user-header-card ion-card-header {
  padding-bottom: 0;
}

.user-header-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.user-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-top: 0.5rem;
}

/* Current Roles Card */
.roles-card {
  margin: 0;
  flex-shrink: 0;
}

.roles-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

/* Effective Permissions Card */
.permissions-card {
  margin: 0;
  flex-shrink: 0;
  max-height: 200px;
  display: flex;
  flex-direction: column;
}

.permissions-card ion-card-header {
  flex-shrink: 0;
}

.permissions-content {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.permissions-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}

/* Add Role Card */
.add-role-card {
  margin: 0;
  flex-shrink: 0;
  max-height: 200px;
  display: flex;
  flex-direction: column;
}

.add-role-card ion-card-header {
  flex-shrink: 0;
}

.add-role-content {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding: 0;
}

.add-role-list {
  background: transparent;
  padding: 0;
}

.add-role-list ion-item {
  --padding-start: 16px;
  --padding-end: 16px;
}

/* Password Management Card */
.password-card {
  margin: 0;
  flex-shrink: 0;
}

.password-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

ion-chip {
  margin: 0;
  cursor: pointer;
}

.empty-message {
  text-align: center;
  color: var(--ion-color-medium);
  margin: 1rem 0;
  padding: 0 16px;
}

.create-button,
.change-password-button {
  margin-top: 1rem;
}

.password-hint,
.form-hint {
  color: var(--ion-color-medium);
  font-size: 0.875rem;
  margin: 0.5rem 0;
  padding-left: 16px;
}

.password-error {
  color: var(--ion-color-danger);
  font-size: 0.875rem;
  margin: 0.5rem 0;
}

/* Responsive design */
@media (max-width: 992px) {
  .master-detail-container {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .master-panel {
    max-height: 50vh;
  }
}
</style>
