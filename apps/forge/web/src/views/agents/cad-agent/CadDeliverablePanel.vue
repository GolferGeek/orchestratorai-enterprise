<template>
  <div class="cad-deliverable-panel">
    <!-- 3D Viewer -->
    <ion-card>
      <ion-card-header>
        <div class="viewer-header">
          <ion-card-title>3D Preview</ion-card-title>
          <div class="viewer-controls">
            <ion-button
              v-if="viewerUrl"
              fill="clear"
              size="small"
              @click="toggleAutoRotate"
              :color="autoRotate ? 'primary' : 'medium'"
              title="Toggle auto-rotate"
            >
              <ion-icon :icon="syncOutline" />
            </ion-button>
            <ion-button
              v-if="viewerUrl"
              fill="clear"
              size="small"
              @click="resetView"
              title="Reset view"
            >
              <ion-icon :icon="expandOutline" />
            </ion-button>
          </div>
        </div>
      </ion-card-header>
      <ion-card-content>
        <div class="viewer-container">
          <ThreeJsViewer
            ref="viewerRef"
            :model-url="viewerUrl"
            model-type="gltf"
            :auto-rotate="autoRotate"
            :background-color="viewerBackground"
            @loaded="onModelLoaded"
            @error="onModelError"
          />
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Download Buttons -->
    <ion-card v-if="outputs">
      <ion-card-header>
        <ion-card-title>Download Files</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <div class="download-buttons">
          <ion-button
            v-if="outputs.step"
            expand="block"
            fill="outline"
            @click="downloadFile(outputs.step, 'step')"
          >
            <ion-icon :icon="downloadOutline" slot="start" />
            Download STEP
          </ion-button>

          <ion-button
            v-if="outputs.stl"
            expand="block"
            fill="outline"
            @click="downloadFile(outputs.stl, 'stl')"
          >
            <ion-icon :icon="downloadOutline" slot="start" />
            Download STL
          </ion-button>

          <ion-button
            v-if="outputs.gltf"
            expand="block"
            fill="outline"
            @click="downloadFile(outputs.gltf, 'gltf')"
          >
            <ion-icon :icon="downloadOutline" slot="start" />
            Download GLTF
          </ion-button>

          <ion-button
            v-if="outputs.dxf"
            expand="block"
            fill="outline"
            @click="downloadFile(outputs.dxf, 'dxf')"
          >
            <ion-icon :icon="downloadOutline" slot="start" />
            Download DXF
          </ion-button>
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Mesh Statistics -->
    <ion-card v-if="meshStats">
      <ion-card-header>
        <ion-card-title>Mesh Statistics</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <div class="mesh-stats">
          <div class="stat-item">
            <span class="stat-label">Vertices:</span>
            <span class="stat-value">{{ meshStats.vertices?.toLocaleString() || 'N/A' }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Faces:</span>
            <span class="stat-value">{{ meshStats.faces?.toLocaleString() || 'N/A' }}</span>
          </div>
          <div class="stat-item" v-if="meshStats.boundingBox">
            <span class="stat-label">Bounding Box:</span>
            <span class="stat-value">
              {{ formatBoundingBox(meshStats.boundingBox) }}
            </span>
          </div>
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Generated Code -->
    <ion-card v-if="generatedCode">
      <ion-card-header>
        <ion-card-title>
          Generated Code
          <ion-button fill="clear" size="small" @click="copyCode">
            <ion-icon :icon="copyOutline" />
          </ion-button>
        </ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <div class="code-view">
          <pre><code>{{ generatedCode }}</code></pre>
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Actions -->
    <div class="actions-footer">
      <ion-button fill="outline" @click="$emit('restart')">
        <ion-icon :icon="refreshOutline" slot="start" />
        Generate Another Model
      </ion-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonButton,
  IonIcon,
} from '@ionic/vue';
import {
  downloadOutline,
  copyOutline,
  refreshOutline,
  syncOutline,
  expandOutline,
} from 'ionicons/icons';
import { useCadAgentStore } from '@/stores/cadAgentStore';
import type { MeshStats } from '@/stores/cadAgentStore';
import ThreeJsViewer from '@/components/viewers/ThreeJsViewer.vue';

defineEmits<{
  (e: 'restart'): void;
}>();

const store = useCadAgentStore();

// Viewer ref
const viewerRef = ref<InstanceType<typeof ThreeJsViewer> | null>(null);

// Viewer state
const autoRotate = ref(true);
const viewerBackground = ref('#1a1a2e');
const modelLoaded = ref(false);

// Computed properties from store
const outputs = computed(() => store.outputs);
const meshStats = computed(() => store.meshStats);
const generatedCode = computed(() => store.generatedCode);

// Get the GLTF URL for the viewer (prefer GLTF, fallback to STL)
const viewerUrl = computed(() => {
  console.log('[CadDeliverablePanel] outputs:', outputs.value);
  console.log('[CadDeliverablePanel] gltf URL:', outputs.value?.gltf);
  console.log('[CadDeliverablePanel] stl URL:', outputs.value?.stl);

  if (outputs.value?.gltf) {
    return outputs.value.gltf;
  }
  if (outputs.value?.stl) {
    return outputs.value.stl;
  }
  return undefined;
});

// Toggle auto-rotate
function toggleAutoRotate() {
  autoRotate.value = !autoRotate.value;
}

// Reset the viewer camera position
function resetView() {
  viewerRef.value?.resetView();
}

// Handle model loaded
function onModelLoaded() {
  modelLoaded.value = true;
  console.log('3D model loaded successfully');
}

// Handle model error
function onModelError(error: string) {
  console.error('3D model load error:', error);
}

// Download file handler
function downloadFile(url: string, format: string) {
  // Create a temporary anchor element to trigger download
  const link = document.createElement('a');
  link.href = url;
  link.download = `cad-model.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Copy code to clipboard
async function copyCode() {
  if (!generatedCode.value) return;

  try {
    await navigator.clipboard.writeText(generatedCode.value);
    // TODO: Show toast notification
    console.log('Code copied to clipboard');
  } catch (err) {
    console.error('Failed to copy code:', err);
  }
}

// Format bounding box for display
function formatBoundingBox(bbox: MeshStats['boundingBox']): string {
  if (!bbox) return 'N/A';

  const { min, max } = bbox;

  // Handle both array format [x, y, z] and object format {x, y, z}
  const getCoord = (vec: number[] | { x: number; y: number; z: number }, idx: number): number => {
    if (Array.isArray(vec)) {
      return vec[idx];
    }
    return idx === 0 ? vec.x : idx === 1 ? vec.y : vec.z;
  };

  const width = getCoord(max, 0) - getCoord(min, 0);
  const height = getCoord(max, 1) - getCoord(min, 1);
  const depth = getCoord(max, 2) - getCoord(min, 2);

  return `${width.toFixed(2)} × ${height.toFixed(2)} × ${depth.toFixed(2)}`;
}
</script>

<style scoped>
.cad-deliverable-panel {
  padding: 16px;
}

/* Viewer Header */
.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.viewer-controls {
  display: flex;
  gap: 4px;
}

.viewer-controls ion-button {
  --padding-start: 8px;
  --padding-end: 8px;
}

/* 3D Viewer */
.viewer-container {
  width: 100%;
  height: 400px;
  border-radius: 8px;
  overflow: hidden;
}

/* Download Buttons */
.download-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Mesh Statistics */
.mesh-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--ion-color-light);
}

.stat-item:last-child {
  border-bottom: none;
}

.stat-label {
  font-weight: 600;
  color: var(--ion-color-medium-shade);
}

.stat-value {
  font-family: monospace;
  color: var(--ion-color-primary);
  font-size: 1.1rem;
}

/* Code View */
.code-view {
  background: var(--ion-color-light);
  border-radius: 8px;
  padding: 16px;
  max-height: 400px;
  overflow-y: auto;
}

.code-view pre {
  margin: 0;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.code-view code {
  color: var(--ion-color-dark);
}

/* Actions Footer */
.actions-footer {
  margin-top: 24px;
  text-align: center;
}

ion-card {
  margin-bottom: 16px;
}



html[data-theme="dark"] .code-view {
  background: #2d3748;
}

html[data-theme="dark"] .code-view code {
  color: #f7fafc;
}
</style>
