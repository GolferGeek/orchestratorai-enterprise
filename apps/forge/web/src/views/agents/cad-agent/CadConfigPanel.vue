<template>
  <div class="cad-config-panel">
    <!-- Browse Previous Requests -->
    <ion-button
      fill="outline"
      color="medium"
      expand="block"
      class="browse-history-button"
      @click="emit('browse-history')"
    >
      <ion-icon :icon="timeOutline" slot="start" />
      Previous CAD Requests
    </ion-button>

    <ion-card>
      <ion-card-header>
        <ion-card-title>CAD Generation Request</ion-card-title>
        <ion-card-subtitle
          >Describe what you want to generate</ion-card-subtitle
        >
      </ion-card-header>
      <ion-card-content>
        <!-- Prompt Input -->
        <ion-item>
          <ion-label position="stacked"
            >What do you want to create? *</ion-label
          >
          <ion-textarea
            v-model="prompt"
            placeholder="Example: A mounting bracket for a 40mm fan with M3 mounting holes, 5mm thick..."
            :rows="4"
          ></ion-textarea>
        </ion-item>
      </ion-card-content>
    </ion-card>

    <!-- Project Selector -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>Project</ion-card-title>
        <ion-card-subtitle
          >Select an existing project or create a new one</ion-card-subtitle
        >
      </ion-card-header>
      <ion-card-content>
        <ion-item>
          <ion-label position="stacked">Project *</ion-label>
          <ion-select
            v-model="selectedProjectId"
            placeholder="Select or create project"
            interface="popover"
          >
            <ion-select-option value="__new__"
              >+ Create New Project</ion-select-option
            >
            <ion-select-option
              v-for="project in projects"
              :key="project.id"
              :value="project.id"
            >
              {{ project.name }}
            </ion-select-option>
          </ion-select>
        </ion-item>

        <!-- New Project Name Input (shown when creating new) -->
        <ion-item v-if="selectedProjectId === '__new__'">
          <ion-label position="stacked">New Project Name *</ion-label>
          <ion-input
            v-model="newProjectName"
            placeholder="e.g., Motor Mount Assembly"
          ></ion-input>
        </ion-item>

        <!-- Show project description if selected -->
        <p
          v-if="selectedProject && selectedProjectId !== '__new__'"
          class="project-description"
        >
          {{ selectedProject.description || "No description" }}
        </p>
      </ion-card-content>
    </ion-card>

    <!-- LLM Model Selection -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>AI Model</ion-card-title>
        <ion-card-subtitle
          >Select the AI model for code generation</ion-card-subtitle
        >
      </ion-card-header>
      <ion-card-content>
        <ion-item>
          <ion-label position="stacked">Model *</ion-label>
          <ion-select v-model="selectedModel" interface="popover">
            <ion-select-option
              v-for="model in availableModels"
              :key="`${model.providerName}:${model.id}`"
              :value="`${model.providerName}:${model.id}`"
            >
              {{ model.name }}{{ model.isLocal ? " (Local)" : "" }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <p v-if="modelsLoading" class="model-description">Loading models...</p>
        <p v-else class="model-description">
          <span v-if="selectedModelInfo?.isLocal">
            Local model running on your infrastructure. No external API needed.
          </span>
          <span v-else>
            Cloud-based model routed through the LLM provider plane.
          </span>
        </p>
      </ion-card-content>
    </ion-card>

    <!-- Constraints -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>Constraints</ion-card-title>
        <ion-card-subtitle
          >Specify manufacturing and design constraints</ion-card-subtitle
        >
      </ion-card-header>
      <ion-card-content>
        <!-- Units -->
        <ion-item>
          <ion-label position="stacked">Units</ion-label>
          <ion-select v-model="constraints.units" interface="popover">
            <ion-select-option value="mm">Millimeters (mm)</ion-select-option>
            <ion-select-option value="inches">Inches</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Material -->
        <ion-item>
          <ion-label position="stacked">Material</ion-label>
          <ion-select v-model="constraints.material" interface="popover">
            <ion-select-option value="Aluminum 6061"
              >Aluminum 6061</ion-select-option
            >
            <ion-select-option value="Steel">Steel</ion-select-option>
            <ion-select-option value="Titanium">Titanium</ion-select-option>
            <ion-select-option value="ABS Plastic"
              >ABS Plastic</ion-select-option
            >
            <ion-select-option value="PLA">PLA (3D Printing)</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Manufacturing Method -->
        <ion-item>
          <ion-label position="stacked">Manufacturing Method</ion-label>
          <ion-select
            v-model="constraints.manufacturing_method"
            interface="popover"
          >
            <ion-select-option value="CNC">CNC Machining</ion-select-option>
            <ion-select-option value="3D Printing"
              >3D Printing</ion-select-option
            >
            <ion-select-option value="Casting">Casting</ion-select-option>
            <ion-select-option value="Sheet Metal"
              >Sheet Metal</ion-select-option
            >
          </ion-select>
        </ion-item>

        <!-- Tolerance Class -->
        <ion-item>
          <ion-label position="stacked">Tolerance Class</ion-label>
          <ion-select v-model="constraints.tolerance_class" interface="popover">
            <ion-select-option value="loose">Loose (±0.5mm)</ion-select-option>
            <ion-select-option value="standard"
              >Standard (±0.1mm)</ion-select-option
            >
            <ion-select-option value="precision"
              >Precision (±0.01mm)</ion-select-option
            >
          </ion-select>
        </ion-item>

        <!-- Wall Thickness Min -->
        <ion-item>
          <ion-label position="stacked"
            >Minimum Wall Thickness ({{ constraints.units }})</ion-label
          >
          <ion-input
            v-model.number="constraints.wall_thickness_min"
            type="number"
            min="0.1"
            step="0.1"
            placeholder="2.0"
          ></ion-input>
        </ion-item>
      </ion-card-content>
    </ion-card>

    <!-- Output Formats -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>Output Formats</ion-card-title>
        <ion-card-subtitle
          >Select which file formats to generate</ion-card-subtitle
        >
      </ion-card-header>
      <ion-card-content>
        <div class="format-checkboxes">
          <ion-item>
            <ion-checkbox
              v-model="outputFormats.step"
              slot="start"
            ></ion-checkbox>
            <ion-label>
              <h3>STEP (.step)</h3>
              <p>Industry standard for CAD exchange</p>
            </ion-label>
          </ion-item>

          <ion-item>
            <ion-checkbox
              v-model="outputFormats.stl"
              slot="start"
            ></ion-checkbox>
            <ion-label>
              <h3>STL (.stl)</h3>
              <p>Standard for 3D printing</p>
            </ion-label>
          </ion-item>

          <ion-item>
            <ion-checkbox
              v-model="outputFormats.gltf"
              slot="start"
            ></ion-checkbox>
            <ion-label>
              <h3>GLTF (.gltf)</h3>
              <p>Web-friendly 3D format</p>
            </ion-label>
          </ion-item>

          <ion-item>
            <ion-checkbox
              v-model="outputFormats.dxf"
              slot="start"
            ></ion-checkbox>
            <ion-label>
              <h3>DXF (.dxf)</h3>
              <p>2D drawing exchange format</p>
            </ion-label>
          </ion-item>
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Generate Button -->
    <div class="generate-section">
      <ion-button
        expand="block"
        :disabled="!canGenerate"
        @click="handleGenerate"
      >
        Generate CAD Model
      </ion-button>

      <p v-if="!canGenerate" class="validation-error">
        {{ validationMessage }}
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from "vue";
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonButton,
  IonCheckbox,
  IonIcon,
} from "@ionic/vue";
import { timeOutline } from "ionicons/icons";
import { useCadAgentStore } from "@/stores/cadAgentStore";
import type { CadConstraints } from "@/stores/cadAgentStore";
import { llmService, type LLMModel } from "@/services/llmService";

const emit = defineEmits<{
  (e: "browse-history"): void;
  (
    e: "generate",
    data: {
      prompt: string;
      projectId?: string;
      newProjectName?: string;
      constraints: CadConstraints;
      outputFormats: string[];
      llmProvider: string;
      llmModel: string;
    },
  ): void;
}>();

const store = useCadAgentStore();

// Models fetched from the LLM provider plane
const availableModels = ref<LLMModel[]>([]);
const modelsLoading = ref(true);

// Form state — pre-filled for quick testing
const prompt = ref<string>(
  "A mounting bracket for a 40mm fan with M3 mounting holes, 5mm thick",
);
const selectedProjectId = ref<string | null>("__new__");
const newProjectName = ref<string>("Mounting Bracket");
const selectedModel = ref<string>("");

// Fetch models from the LLM plane on mount
onMounted(async () => {
  try {
    // Request all text-generation models from the LLM plane
    availableModels.value = await llmService.getModels();
    // Default to first available model
    if (availableModels.value.length > 0) {
      const first = availableModels.value[0];
      selectedModel.value = `${first.providerName}:${first.id}`;
    }
  } catch (e) {
    console.error("Failed to load models from LLM plane", e);
  } finally {
    modelsLoading.value = false;
  }
});

// Look up the currently selected model's info
const selectedModelInfo = computed(() => {
  if (!selectedModel.value) return null;
  const colonIdx = selectedModel.value.indexOf(":");
  const provider = selectedModel.value.substring(0, colonIdx);
  const id = selectedModel.value.substring(colonIdx + 1);
  return (
    availableModels.value.find(
      (m) => m.providerName === provider && m.id === id,
    ) ?? null
  );
});

// Constraints from store (reactive)
const constraints = computed({
  get: () => store.constraints,
  set: (value) => store.setConstraints(value),
});

// Output formats — all enabled by default
const outputFormats = ref({
  step: true,
  stl: true,
  gltf: true,
  dxf: true,
});

// Projects list
const projects = computed(() => store.projects);

// Selected project
const selectedProject = computed(() => {
  if (!selectedProjectId.value || selectedProjectId.value === "__new__")
    return null;
  return store.getProjectById(selectedProjectId.value);
});

// Check if project is valid (either selected existing or has new name)
const hasValidProject = computed(() => {
  if (!selectedProjectId.value) return false;
  if (selectedProjectId.value === "__new__") {
    return newProjectName.value.trim().length > 0;
  }
  return true;
});

// Validation
const canGenerate = computed(() => {
  return (
    prompt.value.trim().length > 0 &&
    hasValidProject.value &&
    Object.values(outputFormats.value).some((v) => v === true)
  );
});

const validationMessage = computed(() => {
  if (!prompt.value.trim()) return "Please enter a description";
  if (!selectedProjectId.value) return "Please select or create a project";
  if (selectedProjectId.value === "__new__" && !newProjectName.value.trim()) {
    return "Please enter a name for the new project";
  }
  if (!Object.values(outputFormats.value).some((v) => v === true)) {
    return "Please select at least one output format";
  }
  return "";
});

// Handle generate
function handleGenerate() {
  if (!canGenerate.value) return;

  const selectedFormats = Object.entries(outputFormats.value)
    .filter(([_, enabled]) => enabled)
    .map(([format, _]) => format.toUpperCase());

  // Determine project info
  const isNewProject = selectedProjectId.value === "__new__";

  // Parse provider:model — split on first colon only (model may contain colons)
  const colonIdx = selectedModel.value.indexOf(":");
  const provider = selectedModel.value.substring(0, colonIdx);
  const model = selectedModel.value.substring(colonIdx + 1);

  emit("generate", {
    prompt: prompt.value.trim(),
    projectId: isNewProject ? undefined : selectedProjectId.value || undefined,
    newProjectName: isNewProject ? newProjectName.value.trim() : undefined,
    constraints: constraints.value,
    outputFormats: selectedFormats,
    llmProvider: provider,
    llmModel: model,
  });
}
</script>

<style scoped>
.cad-config-panel {
  padding: 16px;
  max-width: 800px;
  margin: 0 auto;
}

.browse-history-button {
  margin-bottom: 16px;
}

.project-description {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
  margin-top: 8px;
  padding: 0 16px;
}

.model-description {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
  margin-top: 8px;
  padding: 0 16px;
}

.format-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.format-checkboxes ion-item {
  --padding-start: 0;
}

.format-checkboxes h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.format-checkboxes p {
  margin: 4px 0 0 0;
  font-size: 0.875rem;
  color: var(--ion-color-medium);
}

.validation-error {
  color: var(--ion-color-danger);
  font-size: 0.875rem;
  margin-top: 12px;
  text-align: center;
}

ion-card {
  margin-bottom: 16px;
}
</style>
