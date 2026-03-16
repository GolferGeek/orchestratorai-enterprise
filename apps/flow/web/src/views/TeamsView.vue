<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTeamsStore } from '@/stores/teams.store';
import { useAuthStore } from '@/stores/auth.store';
import TeamCard from '@/components/teams/TeamCard.vue';

const teamsStore = useTeamsStore();
const authStore = useAuthStore();

const showCreateForm = ref(false);
const newTeamName = ref('');
const newTeamDesc = ref('');
const creating = ref(false);
const error = ref('');

onMounted(async () => {
  const org = authStore.organizations[0];
  if (org && teamsStore.teams.length === 0) {
    await teamsStore.loadTeams(org.slug);
  }
});

async function handleCreate() {
  const org = authStore.organizations[0];
  if (!org || !newTeamName.value.trim()) return;
  creating.value = true;
  error.value = '';
  try {
    await teamsStore.createTeam(org.slug, newTeamName.value.trim(), newTeamDesc.value || undefined);
    newTeamName.value = '';
    newTeamDesc.value = '';
    showCreateForm.value = false;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to create team';
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div>
    <div class="page-header">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">Teams</h1>
          <p class="text-sm text-muted mt-1">{{ teamsStore.teams.length }} team{{ teamsStore.teams.length !== 1 ? 's' : '' }}</p>
        </div>
        <button class="btn btn-primary" @click="showCreateForm = !showCreateForm">
          + New Team
        </button>
      </div>
    </div>

    <div class="page-body">
      <!-- Create form -->
      <div v-if="showCreateForm" class="card mb-4">
        <h3 class="font-semibold mb-3">Create Team</h3>
        <div class="flex flex-col gap-3">
          <div>
            <label class="form-label">Team Name *</label>
            <input v-model="newTeamName" class="form-input" style="width:100%;" placeholder="e.g., Engineering" />
          </div>
          <div>
            <label class="form-label">Description</label>
            <textarea v-model="newTeamDesc" class="form-textarea" style="width:100%;" rows="2" placeholder="Optional" />
          </div>
          <div v-if="error" class="text-sm" style="color:var(--color-destructive);">{{ error }}</div>
          <div class="flex gap-2 justify-end">
            <button class="btn btn-ghost" @click="showCreateForm = false">Cancel</button>
            <button class="btn btn-primary" :disabled="creating || !newTeamName.trim()" @click="handleCreate">
              {{ creating ? 'Creating...' : 'Create Team' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="teamsStore.loading" class="empty-state">
        <div class="spinner" />
        <span>Loading teams...</span>
      </div>

      <!-- Empty -->
      <div v-else-if="teamsStore.teams.length === 0" class="empty-state">
        <span style="font-size:28px;">◈</span>
        <div class="font-medium">No teams yet</div>
        <button class="btn btn-primary btn-sm" @click="showCreateForm = true">Create your first team</button>
      </div>

      <!-- Teams grid -->
      <div v-else class="grid-3">
        <TeamCard v-for="team in teamsStore.teams" :key="team.id" :team="team" />
      </div>
    </div>
  </div>
</template>
