<template>
  <div ref="containerRef" class="threejs-viewer">
    <div v-if="loading" class="viewer-loading">
      <ion-spinner name="circular" />
      <p>Loading 3D model...</p>
    </div>
    <div v-if="error" class="viewer-error">
      <ion-icon :icon="alertCircleOutline" />
      <p>{{ error }}</p>
      <ion-button size="small" fill="outline" @click="retry">
        Retry
      </ion-button>
    </div>
    <div v-if="!modelUrl && !loading && !error" class="viewer-placeholder">
      <ion-icon :icon="cubeOutline" />
      <p>No model to display</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { IonSpinner, IonIcon, IonButton } from '@ionic/vue';
import { cubeOutline, alertCircleOutline } from 'ionicons/icons';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const props = defineProps<{
  modelUrl?: string;
  modelType?: 'gltf' | 'stl' | 'auto';
  backgroundColor?: string;
  autoRotate?: boolean;
}>();

const emit = defineEmits<{
  (e: 'loaded'): void;
  (e: 'error', error: string): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

// Three.js objects
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let controls: OrbitControls | null = null;
let currentModel: THREE.Object3D | null = null;
let animationFrameId: number | null = null;

// Initialize Three.js scene
function initScene() {
  if (!containerRef.value) return;

  const container = containerRef.value;
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(props.backgroundColor || '#1a1a2e');

  // Camera
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(30, 30, 30);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = true;
  controls.minDistance = 5;
  controls.maxDistance = 200;
  controls.autoRotate = props.autoRotate ?? false;
  controls.autoRotateSpeed = 1.0;

  // Lighting
  setupLighting();

  // Grid helper
  const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
  scene.add(gridHelper);

  // Axes helper
  const axesHelper = new THREE.AxesHelper(10);
  scene.add(axesHelper);

  // Start animation loop
  animate();

  // Handle resize
  window.addEventListener('resize', handleResize);
}

function setupLighting() {
  if (!scene) return;

  // Ambient light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  // Main directional light
  const mainLight = new THREE.DirectionalLight(0xffffff, 1);
  mainLight.position.set(50, 50, 50);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  scene.add(mainLight);

  // Fill light
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
  fillLight.position.set(-50, 20, -50);
  scene.add(fillLight);

  // Back light
  const backLight = new THREE.DirectionalLight(0xffffff, 0.2);
  backLight.position.set(0, -50, -50);
  scene.add(backLight);
}

function animate() {
  animationFrameId = requestAnimationFrame(animate);

  if (controls) {
    controls.update();
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function handleResize() {
  if (!containerRef.value || !camera || !renderer) return;

  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

// Load model from URL
async function loadModel(url: string) {
  if (!scene || !camera || !controls) {
    console.warn('Scene not initialized');
    return;
  }

  loading.value = true;
  error.value = null;

  // Remove existing model
  if (currentModel) {
    scene.remove(currentModel);
    currentModel = null;
  }

  try {
    // Determine model type
    const type = props.modelType === 'auto' || !props.modelType
      ? detectModelType(url)
      : props.modelType;

    if (type === 'gltf') {
      await loadGLTF(url);
    } else if (type === 'stl') {
      await loadSTL(url);
    } else {
      throw new Error(`Unsupported model type: ${type}`);
    }

    emit('loaded');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to load model';
    error.value = errorMessage;
    emit('error', errorMessage);
    console.error('Failed to load 3D model:', err);
  } finally {
    loading.value = false;
  }
}

function detectModelType(url: string): 'gltf' | 'stl' {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.gltf') || lowerUrl.includes('.glb')) {
    return 'gltf';
  }
  if (lowerUrl.includes('.stl')) {
    return 'stl';
  }
  // Default to GLTF for unknown types
  return 'gltf';
}

async function loadGLTF(url: string): Promise<void> {
  const loader = new GLTFLoader();

  // First, fetch the content to check if it's valid and diagnose issues
  try {
    console.log(`[ThreeJsViewer] Fetching GLTF from: ${url}`);
    console.log(`[ThreeJsViewer] URL starts with http: ${url.startsWith('http')}`);
    console.log(`[ThreeJsViewer] Full URL object:`, new URL(url, window.location.origin));

    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    console.log(`[ThreeJsViewer] Content-Type: ${contentType}`);

    // Get the raw text to check what we received
    const text = await response.text();
    console.log(`[ThreeJsViewer] Response length: ${text.length} chars`);
    console.log(`[ThreeJsViewer] First 200 chars: ${text.substring(0, 200)}`);

    // Check if it looks like JSON
    if (!text.trim().startsWith('{')) {
      throw new Error(`Invalid GLTF content - expected JSON but got: ${text.substring(0, 100)}...`);
    }

    // Parse and validate JSON
    let gltfJson;
    try {
      gltfJson = JSON.parse(text);
    } catch (parseErr) {
      throw new Error(`Invalid JSON in GLTF file: ${parseErr instanceof Error ? parseErr.message : 'Parse error'}`);
    }

    // Verify it's a valid GLTF structure
    if (!gltfJson.asset || !gltfJson.asset.version) {
      throw new Error('Invalid GLTF: missing asset.version');
    }

    console.log(`[ThreeJsViewer] Valid GLTF v${gltfJson.asset.version}, parsing with GLTFLoader...`);

    // Now load using GLTFLoader with the parsed JSON
    return new Promise((resolve, reject) => {
      loader.parse(
        text,
        '', // Base path for relative URIs (not needed for data URIs)
        (gltf: { scene: THREE.Object3D }) => {
          console.log('[ThreeJsViewer] GLTF parsed successfully');
          currentModel = gltf.scene;
          setupModel(gltf.scene);
          resolve();
        },
        (err: ErrorEvent) => {
          reject(new Error(`GLTFLoader parse error: ${err.message || 'Unknown error'}`));
        }
      );
    });
  } catch (fetchErr) {
    throw new Error(`Failed to load GLTF: ${fetchErr instanceof Error ? fetchErr.message : 'Unknown error'}`);
  }
}

async function loadSTL(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const loader = new STLLoader();

    loader.load(
      url,
      (geometry: THREE.BufferGeometry) => {
        // Create material
        const material = new THREE.MeshStandardMaterial({
          color: 0x4a90d9,
          metalness: 0.3,
          roughness: 0.5,
        });

        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        currentModel = mesh;
        setupModel(currentModel);
        resolve();
      },
      (progress: ProgressEvent) => {
        console.log(`Loading STL: ${(progress.loaded / progress.total * 100).toFixed(1)}%`);
      },
      (err: unknown) => {
        reject(new Error(`Failed to load STL: ${err}`));
      }
    );
  });
}

function setupModel(model: THREE.Object3D) {
  if (!scene || !camera || !controls) return;

  // Center the model
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // Move model to center
  model.position.sub(center);

  // Scale model to fit view
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 20 / maxDim;
  model.scale.multiplyScalar(scale);

  // Add to scene
  scene.add(model);

  // Position camera to view model
  const scaledSize = size.clone().multiplyScalar(scale);
  const maxScaledDim = Math.max(scaledSize.x, scaledSize.y, scaledSize.z);
  const distance = maxScaledDim * 2;

  camera.position.set(distance, distance * 0.8, distance);
  camera.lookAt(0, 0, 0);

  // Update controls target
  controls.target.set(0, 0, 0);
  controls.update();
}

function retry() {
  if (props.modelUrl) {
    loadModel(props.modelUrl);
  }
}

// Reset view
function resetView() {
  if (!camera || !controls) return;

  camera.position.set(30, 30, 30);
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();
}

// Cleanup
function cleanup() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  window.removeEventListener('resize', handleResize);

  if (controls) {
    controls.dispose();
    controls = null;
  }

  if (renderer) {
    renderer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer = null;
  }

  if (scene) {
    scene.clear();
    scene = null;
  }

  camera = null;
  currentModel = null;
}

// Watch for model URL changes
watch(() => props.modelUrl, async (newUrl) => {
  if (newUrl) {
    await nextTick();
    if (!scene) {
      initScene();
    }
    loadModel(newUrl);
  }
}, { immediate: false });

// Watch for background color changes
watch(() => props.backgroundColor, (newColor) => {
  if (scene && newColor) {
    scene.background = new THREE.Color(newColor);
  }
});

// Watch for auto-rotate changes
watch(() => props.autoRotate, (newValue) => {
  if (controls) {
    controls.autoRotate = newValue ?? false;
  }
});

onMounted(async () => {
  await nextTick();
  initScene();
  if (props.modelUrl) {
    loadModel(props.modelUrl);
  }
});

onUnmounted(() => {
  cleanup();
});

// Expose methods for parent components
defineExpose({
  resetView,
  loadModel,
});
</script>

<style scoped>
.threejs-viewer {
  width: 100%;
  height: 100%;
  min-height: 300px;
  position: relative;
  background: #1a1a2e;
  border-radius: 8px;
  overflow: hidden;
}

.viewer-loading,
.viewer-error,
.viewer-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #a0aec0;
  background: rgba(26, 26, 46, 0.9);
  z-index: 10;
}

.viewer-loading ion-spinner {
  --color: #4a90d9;
  width: 48px;
  height: 48px;
  margin-bottom: 16px;
}

.viewer-error ion-icon,
.viewer-placeholder ion-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.viewer-error ion-icon {
  color: #e53e3e;
}

.viewer-placeholder ion-icon {
  color: #4a90d9;
}

.viewer-loading p,
.viewer-error p,
.viewer-placeholder p {
  margin: 8px 0;
  font-size: 1rem;
}

.viewer-error ion-button {
  margin-top: 16px;
}
</style>
