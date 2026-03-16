<template>
  <div class="messages-tab">
    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      Loading messages...
    </div>

    <template v-else>
      <!-- Channel Sidebar -->
      <aside class="channel-sidebar">
        <div class="channel-header">
          <h3 class="channel-title">Channels</h3>
          <button class="icon-btn" @click="showCreateDialog = true" title="Create channel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        <div class="channel-list">
          <button
            v-for="channel in channels"
            :key="channel.id"
            class="channel-item"
            :class="{ active: selectedChannel === channel.id }"
            @click="selectedChannel = channel.id"
          >
            <svg class="hash-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="4" y1="9" x2="20" y2="9" />
              <line x1="4" y1="15" x2="20" y2="15" />
              <line x1="10" y1="3" x2="8" y2="21" />
              <line x1="16" y1="3" x2="14" y2="21" />
            </svg>
            <span class="channel-name">{{ channel.name }}</span>
            <button
              v-if="channels.length > 1"
              class="delete-btn"
              @click.stop="deleteChannel(channel.id)"
              title="Delete channel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </button>
        </div>
      </aside>

      <!-- Message Area -->
      <div class="message-area">
        <!-- Channel header -->
        <div class="message-header">
          <div class="message-header-info" v-if="activeChannel">
            <svg class="hash-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="4" y1="9" x2="20" y2="9" />
              <line x1="4" y1="15" x2="20" y2="15" />
              <line x1="10" y1="3" x2="8" y2="21" />
              <line x1="16" y1="3" x2="14" y2="21" />
            </svg>
            <div>
              <h2 class="channel-display-name">{{ activeChannel.name }}</h2>
              <p v-if="activeChannel.description" class="channel-description">
                {{ activeChannel.description }}
              </p>
            </div>
          </div>
          <span v-else class="no-channel">Select a channel</span>
        </div>

        <!-- Messages list -->
        <div class="messages-scroll" ref="messagesScrollEl">
          <div v-if="messages.length === 0" class="empty-messages">
            <p>No messages yet.</p>
            <p class="empty-sub">Be the first to say something!</p>
          </div>

          <div v-else class="messages-list">
            <div
              v-for="message in messages"
              :key="message.id"
              class="message-row"
            >
              <div
                class="message-avatar"
                :style="{ backgroundColor: getColor(message.user_id, message.guest_name).bg }"
              >
                {{ getInitials(getSenderName(message)) }}
              </div>
              <div class="message-body">
                <div class="message-meta">
                  <span
                    class="message-sender"
                    :style="{
                      color: isCurrentUser(message)
                        ? undefined
                        : getColor(message.user_id, message.guest_name).bg
                    }"
                  >
                    {{ getSenderName(message) }}
                    <span v-if="isCurrentUser(message)" class="you-label"> (you)</span>
                  </span>
                  <span class="message-time">{{ formatTime(message.created_at) }}</span>
                </div>
                <p class="message-content">{{ message.content }}</p>
              </div>
            </div>
          </div>
          <div ref="messagesBottomEl" />
        </div>

        <!-- Message input -->
        <form class="message-input-area" @submit.prevent="handleSend">
          <div v-if="!currentUser && !guestName" class="guest-name-input">
            <input
              v-model="guestName"
              placeholder="Enter your name to chat..."
              class="input"
            />
          </div>
          <div class="input-row">
            <input
              v-model="newMessage"
              :placeholder="`Message #${activeChannel?.name ?? 'channel'}...`"
              :disabled="!currentUser && !guestName"
              class="input flex-1"
            />
            <button
              type="submit"
              class="send-btn"
              :disabled="!newMessage.trim() || (!currentUser && !guestName)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </template>

    <!-- Create Channel Dialog -->
    <div v-if="showCreateDialog" class="dialog-overlay" @click.self="showCreateDialog = false">
      <div class="dialog">
        <h3 class="dialog-title">Create Channel</h3>
        <form @submit.prevent="handleCreateChannel" class="dialog-form">
          <input
            v-model="newChannelName"
            placeholder="Channel name"
            class="input"
            required
          />
          <input
            v-model="newChannelDescription"
            placeholder="Description (optional)"
            class="input"
          />
          <div class="dialog-actions">
            <button type="button" class="btn-outline" @click="showCreateDialog = false">
              Cancel
            </button>
            <button type="submit" class="btn-primary" :disabled="!newChannelName.trim()">
              Create Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useChannelMessages } from '@/composables/useChannelMessages';
import type { ChannelMessage } from '@/composables/useChannelMessages';
import { useAuthStore } from '@/stores/auth.store';
import { getUserColor } from '@/lib/user-colors';

const props = defineProps<{
  teamId?: string | null;
}>();

const authStore = useAuthStore();
const currentUser = computed(() => authStore.user);

const teamIdRef = computed(() => props.teamId ?? null);

const {
  channels,
  messages,
  selectedChannel,
  loading,
  createChannel,
  deleteChannel,
  sendMessage,
} = useChannelMessages(teamIdRef);

const activeChannel = computed(() =>
  channels.value.find((c) => c.id === selectedChannel.value) ?? null
);

const newMessage = ref('');
const guestName = ref('');
const showCreateDialog = ref(false);
const newChannelName = ref('');
const newChannelDescription = ref('');
const messagesBottomEl = ref<HTMLElement | null>(null);

// Auto-scroll on new messages
watch(messages, async () => {
  await nextTick();
  messagesBottomEl.value?.scrollIntoView({ behavior: 'smooth' });
});

function getSenderName(message: ChannelMessage): string {
  if (message.profile?.display_name) return message.profile.display_name;
  if (message.guest_name) return message.guest_name;
  return 'Unknown';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getColor(userId: string | null, guestNameVal: string | null) {
  return getUserColor(userId, guestNameVal);
}

function isCurrentUser(message: ChannelMessage): boolean {
  const uid = currentUser.value?.id;
  return (
    (!!uid && message.user_id === uid) ||
    (!uid && !!guestName.value && message.guest_name === guestName.value)
  );
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

async function handleSend() {
  if (!newMessage.value.trim()) return;
  await sendMessage(newMessage.value, guestName.value || undefined);
  newMessage.value = '';
}

async function handleCreateChannel() {
  if (!newChannelName.value.trim()) return;
  const channel = await createChannel(newChannelName.value, newChannelDescription.value);
  if (channel) {
    selectedChannel.value = channel.id;
    newChannelName.value = '';
    newChannelDescription.value = '';
    showCreateDialog.value = false;
  }
}
</script>

<style scoped>
.messages-tab {
  display: flex;
  height: calc(100vh - 12.5rem);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.5rem;
  overflow: hidden;
  background: var(--color-surface, #fff);
  position: relative;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: var(--color-muted, #6b7280);
  font-size: 0.875rem;
}

/* Channel sidebar */
.channel-sidebar {
  width: 15rem;
  border-right: 1px solid var(--color-border, #e5e7eb);
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--color-secondary, #f3f4f6) 30%, transparent);
}

.channel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.channel-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0;
}

.icon-btn {
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  background: transparent;
  border-radius: 0.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted, #6b7280);
}

.icon-btn:hover {
  background: var(--color-secondary, #f3f4f6);
  color: var(--color-text, #111827);
}

.icon-btn svg {
  width: 1rem;
  height: 1rem;
}

.channel-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.channel-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.8125rem;
  text-align: left;
  width: 100%;
  color: var(--color-muted, #6b7280);
  transition: background 0.15s, color 0.15s;
}

.channel-item:hover {
  background: var(--color-secondary, #f3f4f6);
  color: var(--color-text, #111827);
}

.channel-item.active {
  background: color-mix(in srgb, var(--color-primary, #6366f1) 10%, transparent);
  color: var(--color-primary, #6366f1);
}

.hash-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

.channel-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.delete-btn {
  display: none;
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
  padding: 0.125rem;
}

.delete-btn svg {
  width: 0.75rem;
  height: 0.75rem;
}

.channel-item:hover .delete-btn {
  display: flex;
  align-items: center;
}

.delete-btn:hover {
  color: #ef4444;
}

/* Message area */
.message-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.message-header {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.message-header-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.channel-display-name {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.channel-description {
  font-size: 0.8125rem;
  color: var(--color-muted, #6b7280);
  margin: 0.25rem 0 0;
}

.no-channel {
  font-size: 0.875rem;
  color: var(--color-muted, #6b7280);
}

.messages-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.empty-messages {
  text-align: center;
  padding: 2rem;
  color: var(--color-muted, #6b7280);
  font-size: 0.875rem;
}

.empty-sub {
  font-size: 0.8125rem;
  margin-top: 0.25rem;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message-row {
  display: flex;
  gap: 0.75rem;
}

.message-avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
  flex-shrink: 0;
}

.message-body {
  flex: 1;
  min-width: 0;
}

.message-meta {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.message-sender {
  font-size: 0.875rem;
  font-weight: 500;
}

.you-label {
  color: var(--color-muted, #9ca3af);
  font-size: 0.75rem;
  font-weight: 400;
}

.message-time {
  font-size: 0.75rem;
  color: var(--color-muted, #9ca3af);
}

.message-content {
  font-size: 0.875rem;
  margin: 0.125rem 0 0;
  word-break: break-word;
}

/* Message input */
.message-input-area {
  padding: 1rem;
  border-top: 1px solid var(--color-border, #e5e7eb);
}

.guest-name-input {
  margin-bottom: 0.75rem;
}

.input-row {
  display: flex;
  gap: 0.5rem;
}

.input {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.375rem;
  font-size: 0.875rem;
  outline: none;
  width: 100%;
  background: var(--color-surface, #fff);
  color: var(--color-text, #111827);
}

.input:focus {
  border-color: var(--color-primary, #6366f1);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary, #6366f1) 20%, transparent);
}

.flex-1 {
  flex: 1;
}

.send-btn {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.375rem;
  border: none;
  background: var(--color-primary, #6366f1);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.15s;
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.send-btn svg {
  width: 1rem;
  height: 1rem;
}

/* Dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.dialog {
  background: var(--color-surface, #fff);
  border-radius: 0.5rem;
  padding: 1.5rem;
  width: 24rem;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.dialog-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 1rem;
}

.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.btn-outline {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.375rem;
  background: transparent;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-primary {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  background: var(--color-primary, #6366f1);
  color: #fff;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
