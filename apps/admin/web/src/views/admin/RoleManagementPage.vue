<template>
  <div class="detail-view">
    <!-- Detail Header -->
    <div class="detail-header">
      <h2>Roles & Permissions</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="refreshData">
          <ion-icon :icon="refreshOutline" slot="icon-only"></ion-icon>
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <!-- Loading State -->
      <div v-if="loading" class="ion-text-center ion-padding">
        <ion-spinner></ion-spinner>
        <p>Loading roles and permissions...</p>
      </div>

      <template v-else>
        <!-- Roles Section -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>
              <ion-icon
                :icon="shieldCheckmarkOutline"
                class="section-icon"
              ></ion-icon>
              System Roles
            </ion-card-title>
            <ion-card-subtitle
              >{{ roles.length }} roles defined</ion-card-subtitle
            >
          </ion-card-header>
          <ion-card-content>
            <ion-list>
              <ion-item
                v-for="role in roles"
                :key="role.id"
                @click="selectRole(role)"
                :class="{ 'selected-role': selectedRole?.id === role.id }"
                button
              >
                <ion-icon
                  :icon="role.isSystem ? lockClosedOutline : createOutline"
                  slot="start"
                  :color="role.isSystem ? 'medium' : 'primary'"
                ></ion-icon>
                <ion-label>
                  <h2>{{ role.displayName }}</h2>
                  <p>{{ role.description || "No description" }}</p>
                </ion-label>
                <ion-badge slot="end" :color="getRoleBadgeColor(role.name)">
                  {{ role.name }}
                </ion-badge>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>

        <!-- Permissions by Category -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>
              <ion-icon :icon="keyOutline" class="section-icon"></ion-icon>
              Permissions
            </ion-card-title>
            <ion-card-subtitle>
              {{
                selectedRole
                  ? `Permissions for ${selectedRole.displayName}`
                  : "Select a role to view permissions"
              }}
            </ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <div v-if="!selectedRole" class="ion-text-center ion-padding">
              <ion-icon
                :icon="handLeftOutline"
                size="large"
                color="medium"
              ></ion-icon>
              <p>Select a role above to view its permissions</p>
            </div>

            <template v-else>
              <ion-accordion-group>
                <ion-accordion
                  v-for="(perms, category) in permissionsByCategory"
                  :key="category"
                  :value="category"
                >
                  <ion-item slot="header" color="light">
                    <ion-icon
                      :icon="getCategoryIcon(category)"
                      slot="start"
                    ></ion-icon>
                    <ion-label>
                      <h3>{{ formatCategory(category) }}</h3>
                      <p>{{ perms.length }} permissions</p>
                    </ion-label>
                  </ion-item>
                  <div class="ion-padding" slot="content">
                    <ion-list>
                      <ion-item v-for="perm in perms" :key="perm.id">
                        <ion-checkbox
                          slot="start"
                          :checked="roleHasPermission(perm.name)"
                          :disabled="
                            selectedRole?.isSystem && !rbacStore.isSuperAdmin
                          "
                          @ionChange="togglePermission(perm, $event)"
                        ></ion-checkbox>
                        <ion-label>
                          <h3>{{ perm.displayName }}</h3>
                          <p>{{ perm.name }}</p>
                          <p class="permission-desc">{{ perm.description }}</p>
                        </ion-label>
                      </ion-item>
                    </ion-list>
                  </div>
                </ion-accordion>
              </ion-accordion-group>
            </template>
          </ion-card-content>
        </ion-card>

        <!-- Audit Log -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>
              <ion-icon :icon="timeOutline" class="section-icon"></ion-icon>
              Recent Activity
            </ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-list v-if="auditLog.length > 0">
              <ion-item v-for="entry in auditLog" :key="entry.id">
                <ion-icon
                  :icon="getAuditIcon(entry.action)"
                  slot="start"
                  :color="getAuditColor(entry.action)"
                ></ion-icon>
                <ion-label>
                  <h3>{{ formatAuditAction(entry.action) }}</h3>
                  <p>{{ formatDate(entry.createdAt) }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
            <div v-else class="ion-text-center ion-padding">
              <p>No recent activity</p>
            </div>
          </ion-card-content>
        </ion-card>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonButton,
  IonSpinner,
  IonBadge,
  IonAccordionGroup,
  IonAccordion,
  IonCheckbox,
  toastController,
} from "@ionic/vue";
import {
  refreshOutline,
  shieldCheckmarkOutline,
  lockClosedOutline,
  createOutline,
  keyOutline,
  handLeftOutline,
  timeOutline,
  cloudOutline,
  settingsOutline,
  chatbubblesOutline,
  documentOutline,
  addCircleOutline,
  removeCircleOutline,
  swapHorizontalOutline,
} from "ionicons/icons";
import { useRbacStore } from "@/stores/rbacStore";
import rbacService, {
  type RbacRole,
  type RbacPermission,
  type AuditLogEntry,
} from "@/services/rbacService";

const rbacStore = useRbacStore();

const loading = ref(false);
const roles = ref<RbacRole[]>([]);
const selectedRole = ref<RbacRole | null>(null);
const rolePermissions = ref<string[]>([]);
const auditLog = ref<AuditLogEntry[]>([]);

const permissionsByCategory = computed(() => rbacStore.permissionsByCategory);

onMounted(async () => {
  await refreshData();
});

async function refreshData() {
  loading.value = true;
  try {
    if (!rbacStore.isInitialized) {
      await rbacStore.initialize();
    }
    await rbacStore.loadRolesAndPermissions();
    roles.value = rbacStore.allRoles;

    // Load audit log
    await fetchAuditLog();
  } catch (error) {
    console.error("Failed to load data:", error);
  } finally {
    loading.value = false;
  }
}

async function fetchAuditLog() {
  try {
    // Pass undefined when org is '*' (all orgs) so the API returns unfiltered entries
    const orgSlug =
      rbacStore.currentOrganization && rbacStore.currentOrganization !== "*"
        ? rbacStore.currentOrganization
        : undefined;
    auditLog.value = await rbacService.getAuditLog(orgSlug, 10);
  } catch (error) {
    console.error("Failed to load audit log:", error);
    auditLog.value = [];
  }
}

async function selectRole(role: RbacRole) {
  selectedRole.value = role;
  // Load permissions for this role
  try {
    rolePermissions.value = await rbacService.getRolePermissions(role.id);
  } catch (error) {
    console.error("Failed to load role permissions:", error);
    rolePermissions.value = [];
  }
}

function roleHasPermission(permName: string): boolean {
  return rolePermissions.value.includes(permName);
}

async function togglePermission(perm: RbacPermission, event: CustomEvent) {
  if (!selectedRole.value) return;

  // Only prevent modification of system roles if user is not super-admin
  if (selectedRole.value.isSystem && !rbacStore.isSuperAdmin) {
    const toast = await toastController.create({
      message: "Only super-admins can modify system roles",
      duration: 2000,
      color: "warning",
    });
    await toast.present();
    return;
  }

  const isChecked = event.detail.checked;
  const wasChecked = roleHasPermission(perm.name);

  try {
    if (isChecked && !wasChecked) {
      // Add permission to role
      await rbacService.addPermissionToRole(selectedRole.value.id, perm.id);
      rolePermissions.value.push(perm.name);

      const toast = await toastController.create({
        message: `Added ${perm.displayName} to ${selectedRole.value.displayName}`,
        duration: 2000,
        color: "success",
      });
      await toast.present();
    } else if (!isChecked && wasChecked) {
      // Remove permission from role
      await rbacService.removePermissionFromRole(
        selectedRole.value.id,
        perm.id,
      );
      rolePermissions.value = rolePermissions.value.filter(
        (p) => p !== perm.name,
      );

      const toast = await toastController.create({
        message: `Removed ${perm.displayName} from ${selectedRole.value.displayName}`,
        duration: 2000,
        color: "success",
      });
      await toast.present();
    } else {
      return; // No change
    }

    // Reload user permissions and refresh audit log after any successful change
    if (rbacStore.isInitialized && rbacStore.currentOrganization) {
      await rbacStore.loadUserPermissions(rbacStore.currentOrganization);
    }
    await fetchAuditLog();
  } catch (error) {
    console.error("Failed to toggle permission:", error);

    // Reload permissions to reset checkbox state
    if (selectedRole.value) {
      rolePermissions.value = await rbacService.getRolePermissions(
        selectedRole.value.id,
      );
    }

    const toast = await toastController.create({
      message: `Failed to update permission: ${error instanceof Error ? error.message : "Unknown error"}`,
      duration: 3000,
      color: "danger",
    });
    await toast.present();
  }
}

function getRoleBadgeColor(roleName: string): string {
  const colors: Record<string, string> = {
    "super-admin": "danger",
    admin: "warning",
    manager: "tertiary",
    member: "primary",
    viewer: "medium",
  };
  return colors[roleName] || "medium";
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    rag: cloudOutline,
    agents: chatbubblesOutline,
    admin: settingsOutline,
    llm: documentOutline,
    deliverables: documentOutline,
    system: shieldCheckmarkOutline,
  };
  return icons[category] || keyOutline;
}

function formatCategory(category: string): string {
  return (
    category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, " ")
  );
}

function getAuditIcon(action: string): string {
  if (action.includes("grant")) return addCircleOutline;
  if (action.includes("revoke")) return removeCircleOutline;
  return swapHorizontalOutline;
}

function getAuditColor(action: string): string {
  if (action.includes("grant")) return "success";
  if (action.includes("revoke")) return "danger";
  return "primary";
}

function formatAuditAction(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
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
  padding: 1rem;
}

.section-icon {
  margin-right: 8px;
  vertical-align: middle;
}

.selected-role {
  --background: var(--ion-color-primary-tint);
}

.permission-desc {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}

ion-accordion-group {
  margin-top: 8px;
}
</style>
