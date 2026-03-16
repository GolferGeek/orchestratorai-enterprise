<template>
  <div v-if="shouldShowPanel" class="agent-resources-panel">
    <div class="panel-header">
      <ion-icon :icon="playCircleOutline" class="header-icon" />
      <h3>Agent Resources</h3>
    </div>
    
    <div class="video-buttons-container">
      <ion-button
        v-for="video in videosToShow"
        :key="video.id"
        @click="openVideoModal(video)"
        fill="outline"
        size="small"
        class="video-button"
      >
        <ion-icon slot="start" :icon="playCircleOutline" />
        {{ video.title }}
      </ion-button>
    </div>

    <!-- Video Modal -->
    <ion-modal 
      :is-open="isVideoModalOpen" 
      @did-dismiss="closeVideoModal"
      :backdrop-dismiss="true"
      class="agent-video-modal"
    >
      <div class="modal-content">
        <div class="modal-header">
          <h2>{{ selectedVideo?.title }}</h2>
          <ion-button 
            fill="clear" 
            @click="closeVideoModal"
            class="close-button"
          >
            <ion-icon :icon="closeOutline"></ion-icon>
          </ion-button>
        </div>
        
        <div class="modal-tabs">
          <ion-segment v-model="currentTab" @ionChange="handleTabChange">
            <ion-segment-button value="video">
              <ion-icon :icon="playCircleOutline"></ion-icon>
              <ion-label>Video</ion-label>
            </ion-segment-button>
            <ion-segment-button value="transcript" :disabled="!hasTranscript">
              <ion-icon :icon="documentTextOutline"></ion-icon>
              <ion-label>Transcript</ion-label>
              <ion-badge v-if="hasTranscript" color="secondary" size="small">Available</ion-badge>
            </ion-segment-button>
          </ion-segment>
        </div>

        <div class="modal-content-area">
          <!-- Video Tab -->
          <div v-show="currentTab === 'video'" class="video-container">
            <div v-if="videoEmbedUrl" class="video-wrapper">
              <iframe 
                :src="videoEmbedUrl" 
                frameborder="0" 
                allowfullscreen
                class="video-iframe"
              ></iframe>
            </div>
            <div v-else class="video-placeholder">
              <ion-icon :icon="playCircleOutline" class="placeholder-icon"></ion-icon>
              <p>Video coming soon...</p>
            </div>
          </div>

          <!-- Transcript Tab -->
          <div v-show="currentTab === 'transcript'" class="transcript-container">
            <div v-if="transcriptLoading" class="transcript-loading">
              <ion-spinner />
              <p>Loading transcript...</p>
            </div>
            <div v-else-if="transcriptError" class="transcript-error">
              <ion-icon :icon="alertCircleOutline" />
              <p>{{ transcriptError }}</p>
              <ion-button fill="outline" size="small" @click="loadTranscript">
                Try Again
              </ion-button>
            </div>
            <div v-else-if="transcriptContent" class="transcript-content">
              <div class="transcript-markdown" v-text="transcriptContent"></div>
            </div>
            <div v-else class="transcript-placeholder">
              <ion-icon :icon="documentTextOutline" />
              <p>Transcript not available</p>
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <p class="video-description">{{ selectedVideo?.description }}</p>
          <div class="modal-actions">
            <ion-button 
              fill="outline" 
              @click="closeVideoModal"
              class="action-button"
            >
              Close
            </ion-button>
            <ion-button 
              @click="navigateToVideos"
              class="action-button primary"
            >
              <ion-icon slot="start" :icon="playCircleOutline"></ion-icon>
              See All Videos
            </ion-button>
          </div>
        </div>
      </div>
    </ion-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IonButton, IonIcon, IonModal, IonSegment, IonSegmentButton, IonLabel, IonBadge, IonSpinner } from '@ionic/vue';
import { playCircleOutline, closeOutline, documentTextOutline, alertCircleOutline } from 'ionicons/icons';
import { useRouter } from 'vue-router';
// import { marked } from 'marked';
import { analyticsService } from '@/services/analyticsService';
import { agentDefaultOverviewTranscript } from '@/data/transcripts/agent-default-overview';

// Types
interface Video {
  id: string;
  title: string;
  description: string;
  url: string;
  duration: string;
  createdAt: string;
  featured?: boolean;
  order: number;
}

interface Props {
  agentVideoIds?: string[];
  fallbackVideoIds?: string[];
  videos?: Video[];
  agentSlug?: string;
  agentName?: string;
}

const props = withDefaults(defineProps<Props>(), {
  agentVideoIds: () => [],
  fallbackVideoIds: () => ['agent-default-overview'],
  videos: () => [],
  agentSlug: '',
  agentName: ''
});

const router = useRouter();

// State
const isVideoModalOpen = ref(false);
const selectedVideo = ref<Video | null>(null);
const currentTab = ref<'video' | 'transcript'>('video');
const transcriptContent = ref<string>('');
const transcriptLoading = ref(false);
const transcriptError = ref<string>('');

// Computed
const videosToShow = computed(() => {
  if (props.agentVideoIds.length > 0) {
    // Show agent-specific videos
    return props.videos.filter(video => 
      props.agentVideoIds.includes(video.id)
    ).sort((a, b) => a.order - b.order);
  } else {
    // Show fallback videos
    return props.videos.filter(video => 
      props.fallbackVideoIds.includes(video.id)
    ).sort((a, b) => a.order - b.order);
  }
});

const shouldShowPanel = computed(() => {
  return videosToShow.value.length > 0;
});

const videoEmbedUrl = computed(() => {
  if (!selectedVideo.value) return null;
  
  // Handle TBD_RECORDING_NEEDED placeholder
  if (selectedVideo.value.url === 'TBD_RECORDING_NEEDED') {
    return null;
  }
  
  return selectedVideo.value.url;
});

const hasTranscript = computed(() => {
  return selectedVideo.value?.id && selectedVideo.value.id !== '';
});

// Removed unused computed property

// Methods
function openVideoModal(video: Video) {
  selectedVideo.value = video;
  isVideoModalOpen.value = true;
  
  // Track video button click analytics
  trackVideoButtonClick(video);
}

function closeVideoModal() {
  isVideoModalOpen.value = false;
  selectedVideo.value = null;
  currentTab.value = 'video';
  transcriptContent.value = '';
  transcriptError.value = '';
}

function navigateToVideos() {
  closeVideoModal();
  router.push('/videos');
}

function handleTabChange(event: CustomEvent) {
  currentTab.value = event.detail.value;
  
  if (currentTab.value === 'transcript' && !transcriptContent.value && !transcriptError.value) {
    loadTranscript();
    
    // Track transcript view analytics
    if (selectedVideo.value) {
      trackTranscriptView(selectedVideo.value);
    }
  }
}

async function loadTranscript() {
  if (!selectedVideo.value?.id) return;

  transcriptLoading.value = true;
  transcriptError.value = '';

  try {
    // Use static transcripts for now
    if (selectedVideo.value.id === 'agent-default-overview') {
      transcriptContent.value = agentDefaultOverviewTranscript;
    } else {
      // Try to fetch from API for other videos
      const response = await fetch(`/api/videos/transcripts/${selectedVideo.value.id}`);

      if (!response.ok) {
        if (response.status === 404) {
          transcriptError.value = 'Transcript not available for this video';
        } else {
          transcriptError.value = 'Failed to load transcript';
        }
        return;
      }

      const transcriptData = await response.json();
      transcriptContent.value = transcriptData.content || 'Transcript content not available';
    }
  } catch (error) {
    console.error('Error loading transcript:', error);
    transcriptError.value = 'Error loading transcript';
  } finally {
    transcriptLoading.value = false;
  }
}

// Analytics tracking functions
async function trackVideoButtonClick(video: Video) {
  try {
    await analyticsService.trackEvent({
      eventType: 'video_button_click',
      category: 'agent_resources',
      action: 'click',
      label: video.title,
      properties: {
        videoId: video.id,
        agentSlug: props.agentSlug,
        agentName: props.agentName,
        isFallback: !props.agentVideoIds.includes(video.id),
        videoOrder: video.order,
        featured: video.featured || false,
        source: 'agent_conversation'
      },
      context: {}
    });
  } catch {
    // Ignore tracking errors
  }
}

async function trackVideoModalOpen(video: Video) {
  try {
    await analyticsService.trackEvent({
      eventType: 'video_modal_open',
      category: 'agent_resources',
      action: 'modal_open',
      label: video.title,
      properties: {
        videoId: video.id,
        agentSlug: props.agentSlug,
        agentName: props.agentName,
        isFallback: !props.agentVideoIds.includes(video.id),
        videoOrder: video.order,
        featured: video.featured || false,
        source: 'agent_conversation',
        modalType: 'video_resources'
      },
      context: {}
    });
  } catch {
    // Ignore tracking errors
  }
}

async function trackTranscriptView(video: Video) {
  try {
    await analyticsService.trackEvent({
      eventType: 'video_transcript_view',
      category: 'agent_resources',
      action: 'transcript_view',
      label: video.title,
      properties: {
        videoId: video.id,
        agentSlug: props.agentSlug,
        agentName: props.agentName,
        transcriptId: video.id, // assuming transcript ID matches video ID
        source: 'agent_conversation'
      },
      context: {}
    });
  } catch {
    // Ignore tracking errors
  }
}

async function trackFallbackVideoUsage() {
  try {
    await analyticsService.trackEvent({
      eventType: 'fallback_video_usage',
      category: 'agent_resources',
      action: 'fallback_used',
      label: `Agent: ${props.agentName || props.agentSlug}`,
      properties: {
        agentSlug: props.agentSlug,
        agentName: props.agentName,
        agentVideoIds: props.agentVideoIds,
        fallbackVideoIds: props.fallbackVideoIds,
        source: 'agent_conversation',
        reason: 'no_agent_specific_videos'
      },
      context: {}
    });
  } catch {
    // Ignore tracking errors
  }
}

// Watch for video changes to reset transcript state
watch(selectedVideo, (newVideo) => {
  transcriptContent.value = '';
  transcriptError.value = '';
  currentTab.value = 'video';
  
  // Track modal open analytics when video changes
  if (newVideo) {
    trackVideoModalOpen(newVideo);
  }
});

// Track fallback usage when component mounts
watch(videosToShow, (videos) => {
  if (videos.length > 0 && props.agentVideoIds.length === 0) {
    // Using fallback videos - track this usage
    trackFallbackVideoUsage();
  }
}, { immediate: true });
</script>

<style scoped>
.agent-resources-panel {
  background: var(--ion-color-light);
  border: 1px solid var(--ion-color-step-150);
  border-radius: 12px;
  padding: 16px;
  margin: 16px 0;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.header-icon {
  color: var(--ion-color-primary);
  font-size: 1.2rem;
}

.panel-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-color-step-850);
}

.video-buttons-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.video-button {
  --border-radius: 8px;
  --padding-start: 12px;
  --padding-end: 12px;
  height: 36px;
  margin: 0;
  text-align: left;
  justify-content: flex-start;
}

.video-button ion-icon {
  margin-right: 8px;
}

/* Modal Styles */
.agent-video-modal {
  --width: 90%;
  --max-width: 800px;
  --height: 80%;
  --border-radius: 16px;
}

.modal-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 16px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  background: var(--ion-color-primary);
  color: white;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.close-button {
  --color: white;
  --background: rgba(255, 255, 255, 0.1);
  --border-radius: 50%;
  width: 40px;
  height: 40px;
}

.modal-tabs {
  border-bottom: 1px solid #e5e7eb;
  background: white;
}

.modal-content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 400px;
}

.video-container,
.transcript-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: #f8fafc;
}

.transcript-container {
  align-items: flex-start;
  justify-content: flex-start;
}

.video-wrapper {
  width: 100%;
  height: 100%;
  max-height: 400px;
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.video-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.video-placeholder {
  text-align: center;
  color: #6b7280;
}

.placeholder-icon {
  font-size: 4rem;
  color: var(--ion-color-primary);
  margin-bottom: 1rem;
}

/* Transcript Styles */
.transcript-content {
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.transcript-markdown {
  max-width: none;
  color: var(--ion-color-dark);
  line-height: 1.6;
}

.transcript-markdown h1,
.transcript-markdown h2,
.transcript-markdown h3,
.transcript-markdown h4,
.transcript-markdown h5,
.transcript-markdown h6 {
  color: var(--ion-color-primary);
  margin: 1.5em 0 0.5em 0;
}

.transcript-markdown h1:first-child,
.transcript-markdown h2:first-child,
.transcript-markdown h3:first-child {
  margin-top: 0;
}

.transcript-markdown p {
  margin: 1em 0;
}

.transcript-markdown ul,
.transcript-markdown ol {
  margin: 1em 0;
  padding-left: 2em;
}

.transcript-markdown blockquote {
  border-left: 4px solid var(--ion-color-primary);
  padding-left: 1em;
  margin: 1em 0;
  color: var(--ion-color-medium);
  font-style: italic;
}

.transcript-markdown code {
  background: var(--ion-color-light);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
}

.transcript-markdown pre {
  background: var(--ion-color-light);
  padding: 1em;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1em 0;
}

.transcript-loading,
.transcript-error,
.transcript-placeholder {
  text-align: center;
  color: var(--ion-color-medium);
  padding: 2rem;
}

.transcript-loading ion-spinner {
  margin-bottom: 1rem;
}

.transcript-error {
  color: var(--ion-color-danger);
}

.transcript-error ion-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.transcript-placeholder ion-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  color: var(--ion-color-medium-shade);
}

.modal-footer {
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
  background: white;
}

.video-description {
  margin: 0 0 1rem 0;
  color: #6b7280;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.action-button {
  --border-radius: 8px;
  font-weight: 500;
}

.action-button.primary {
  --background: var(--ion-color-primary);
  --color: white;
}

@media (max-width: 768px) {
  .agent-video-modal {
    --width: 95%;
    --height: 85%;
  }
  
  .modal-header {
    padding: 1rem;
  }
  
  .modal-header h2 {
    font-size: 1.25rem;
  }
  
  .modal-footer {
    padding: 1rem;
  }
  
  .modal-actions {
    flex-direction: column;
  }
  
  .action-button {
    width: 100%;
  }
  
  .video-buttons-container {
    gap: 6px;
  }
  
  .video-button {
    height: 32px;
    font-size: 0.9rem;
  }

  .modal-tabs {
    padding: 0 0.5rem;
  }
  
  .transcript-content {
    padding: 1rem;
  }
  
  .transcript-markdown {
    font-size: 0.9rem;
  }
  
  .modal-content-area {
    min-height: 300px;
  }
}
</style>