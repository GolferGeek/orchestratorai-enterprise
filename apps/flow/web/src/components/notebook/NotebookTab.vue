<template>
  <div class="h-full flex flex-col">
    <CollectionBrowser
      v-if="currentView === 'collections'"
      @select="handleSelectCollection"
    />
    <DocumentManager
      v-else-if="currentView === 'documents' && selectedCollection"
      :collection="selectedCollection"
      @back="handleBack"
      @open-chat="handleOpenChat"
    />
    <QAChat
      v-else-if="currentView === 'chat' && selectedCollection"
      :collection="selectedCollection"
      @back="handleBack"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import CollectionBrowser from './CollectionBrowser.vue';
import DocumentManager from './DocumentManager.vue';
import QAChat from './QAChat.vue';

type NotebookView = 'collections' | 'documents' | 'chat';

interface SelectedCollection {
  id: string;
  name: string;
}

const currentView = ref<NotebookView>('collections');
const selectedCollection = ref<SelectedCollection | null>(null);

function handleSelectCollection(collection: SelectedCollection) {
  selectedCollection.value = collection;
  currentView.value = 'documents';
}

function handleOpenChat() {
  currentView.value = 'chat';
}

function handleBack() {
  if (currentView.value === 'chat') {
    currentView.value = 'documents';
  } else if (currentView.value === 'documents') {
    selectedCollection.value = null;
    currentView.value = 'collections';
  }
}
</script>
