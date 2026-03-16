<template>
  <div class="swarm-config-form">
    <div class="history-action">
      <ion-button
        fill="outline"
        color="medium"
        size="default"
        @click="emit('browse-history')"
      >
        <ion-icon :icon="timeOutline" slot="start" />
        Previous Swarms
      </ion-button>
    </div>

    <ion-card>
      <ion-card-header>
        <ion-card-title>Content Configuration</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <!-- Content Type Selection -->
        <ion-item>
          <ion-label position="stacked">Content Type</ion-label>
          <ion-select
            v-model="selectedContentType"
            placeholder="Select content type"
            interface="popover"
          >
            <ion-select-option
              v-for="type in contentTypes"
              :key="type.slug"
              :value="type.slug"
            >
              {{ type.name }}
            </ion-select-option>
          </ion-select>
        </ion-item>

        <p
          v-if="selectedContentTypeDescription"
          class="content-type-description"
        >
          {{ selectedContentTypeDescription }}
        </p>
      </ion-card-content>
    </ion-card>

    <!-- Prompt Data Form -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>Content Brief</ion-card-title>
        <ion-card-subtitle
          >Answer these questions to guide content creation</ion-card-subtitle
        >
      </ion-card-header>
      <ion-card-content>
        <ion-item>
          <ion-label position="stacked">Topic *</ion-label>
          <ion-textarea
            v-model="promptData.topic"
            placeholder="What is the main topic or subject?"
            :rows="2"
          ></ion-textarea>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Target Audience *</ion-label>
          <ion-textarea
            v-model="promptData.audience"
            placeholder="Who is the target audience?"
            :rows="2"
          ></ion-textarea>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Goal *</ion-label>
          <ion-textarea
            v-model="promptData.goal"
            placeholder="What do you want the content to achieve?"
            :rows="2"
          ></ion-textarea>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Key Points *</ion-label>
          <ion-textarea
            v-model="keyPointsText"
            placeholder="Enter key points (one per line)"
            :rows="4"
          ></ion-textarea>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Tone *</ion-label>
          <ion-select
            v-model="promptData.tone"
            placeholder="Select tone"
            interface="popover"
          >
            <ion-select-option value="professional"
              >Professional</ion-select-option
            >
            <ion-select-option value="conversational"
              >Conversational</ion-select-option
            >
            <ion-select-option value="casual">Casual</ion-select-option>
            <ion-select-option value="formal">Formal</ion-select-option>
            <ion-select-option value="persuasive">Persuasive</ion-select-option>
            <ion-select-option value="educational"
              >Educational</ion-select-option
            >
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Constraints (optional)</ion-label>
          <ion-textarea
            v-model="promptData.constraints"
            placeholder="Any specific constraints or requirements?"
            :rows="2"
          ></ion-textarea>
        </ion-item>

        <ion-item>
          <ion-label position="stacked">Examples (optional)</ion-label>
          <ion-textarea
            v-model="promptData.examples"
            placeholder="Any style examples or references?"
            :rows="2"
          ></ion-textarea>
        </ion-item>

        <ion-item>
          <ion-label position="stacked"
            >Additional Context (optional)</ion-label
          >
          <ion-textarea
            v-model="promptData.additionalContext"
            placeholder="Any other relevant information?"
            :rows="2"
          ></ion-textarea>
        </ion-item>
      </ion-card-content>
    </ion-card>

    <!-- Agent Configuration -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>Agent Configuration</ion-card-title>
        <ion-card-subtitle
          >Configure agents with their LLM models</ion-card-subtitle
        >
      </ion-card-header>
      <ion-card-content>
        <!-- Writers Section -->
        <div class="agent-section">
          <h3>Writers</h3>
          <div class="agent-table">
            <!-- Add New Writer Row -->
            <div class="agent-row add-row">
              <ion-select
                v-model="newWriterAgent"
                placeholder="Select writer..."
                interface="popover"
                class="agent-select"
              >
                <ion-select-option
                  v-for="agent in availableWriterAgents"
                  :key="agent.slug"
                  :value="agent.slug"
                >
                  {{ agent.name }}
                </ion-select-option>
              </ion-select>
              <ion-select
                v-model="newWriterProvider"
                placeholder="Provider"
                interface="popover"
                class="provider-select"
                :disabled="!newWriterAgent"
              >
                <ion-select-option
                  v-for="provider in llmProviders"
                  :key="provider.name"
                  :value="provider.name"
                >
                  {{ provider.displayName }}
                </ion-select-option>
              </ion-select>
              <ion-select
                v-model="newWriterModel"
                placeholder="Model"
                interface="popover"
                class="model-select"
                :disabled="!newWriterProvider"
              >
                <ion-select-option
                  v-for="model in getModelsForProvider(newWriterProvider)"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.name }}
                </ion-select-option>
              </ion-select>
              <ion-button
                fill="clear"
                size="small"
                :disabled="!canAddWriter"
                @click="addWriter"
              >
                <ion-icon :icon="addCircleOutline" />
              </ion-button>
            </div>
            <!-- Selected Writers -->
            <div
              v-for="(config, index) in selectedWriters"
              :key="index"
              class="agent-row selected-row"
            >
              <span class="agent-name">{{
                getAgentName("writer", config.agentSlug)
              }}</span>
              <ion-select
                :value="config.llmProvider"
                interface="popover"
                class="provider-select"
                @ionChange="updateAgentProvider('writer', index, $event)"
              >
                <ion-select-option
                  v-for="provider in llmProviders"
                  :key="provider.name"
                  :value="provider.name"
                >
                  {{ provider.displayName }}
                </ion-select-option>
              </ion-select>
              <ion-select
                :value="config.llmModel"
                interface="popover"
                class="model-select"
                @ionChange="updateAgentModel('writer', index, $event)"
              >
                <ion-select-option
                  v-for="model in getModelsForProvider(config.llmProvider)"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.name }}
                </ion-select-option>
              </ion-select>
              <ion-button
                fill="clear"
                size="small"
                color="danger"
                @click="removeAgent('writer', index)"
              >
                <ion-icon :icon="removeCircleOutline" />
              </ion-button>
            </div>
          </div>
        </div>

        <!-- Editors Section -->
        <div class="agent-section">
          <h3>Editors</h3>
          <div class="agent-table">
            <!-- Add New Editor Row -->
            <div class="agent-row add-row">
              <ion-select
                v-model="newEditorAgent"
                placeholder="Select editor..."
                interface="popover"
                class="agent-select"
              >
                <ion-select-option
                  v-for="agent in availableEditorAgents"
                  :key="agent.slug"
                  :value="agent.slug"
                >
                  {{ agent.name }}
                </ion-select-option>
              </ion-select>
              <ion-select
                v-model="newEditorProvider"
                placeholder="Provider"
                interface="popover"
                class="provider-select"
                :disabled="!newEditorAgent"
              >
                <ion-select-option
                  v-for="provider in llmProviders"
                  :key="provider.name"
                  :value="provider.name"
                >
                  {{ provider.displayName }}
                </ion-select-option>
              </ion-select>
              <ion-select
                v-model="newEditorModel"
                placeholder="Model"
                interface="popover"
                class="model-select"
                :disabled="!newEditorProvider"
              >
                <ion-select-option
                  v-for="model in getModelsForProvider(newEditorProvider)"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.name }}
                </ion-select-option>
              </ion-select>
              <ion-button
                fill="clear"
                size="small"
                :disabled="!canAddEditor"
                @click="addEditor"
              >
                <ion-icon :icon="addCircleOutline" />
              </ion-button>
            </div>
            <!-- Selected Editors -->
            <div
              v-for="(config, index) in selectedEditors"
              :key="index"
              class="agent-row selected-row"
            >
              <span class="agent-name">{{
                getAgentName("editor", config.agentSlug)
              }}</span>
              <ion-select
                :value="config.llmProvider"
                interface="popover"
                class="provider-select"
                @ionChange="updateAgentProvider('editor', index, $event)"
              >
                <ion-select-option
                  v-for="provider in llmProviders"
                  :key="provider.name"
                  :value="provider.name"
                >
                  {{ provider.displayName }}
                </ion-select-option>
              </ion-select>
              <ion-select
                :value="config.llmModel"
                interface="popover"
                class="model-select"
                @ionChange="updateAgentModel('editor', index, $event)"
              >
                <ion-select-option
                  v-for="model in getModelsForProvider(config.llmProvider)"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.name }}
                </ion-select-option>
              </ion-select>
              <ion-button
                fill="clear"
                size="small"
                color="danger"
                @click="removeAgent('editor', index)"
              >
                <ion-icon :icon="removeCircleOutline" />
              </ion-button>
            </div>
          </div>
        </div>

        <!-- Evaluators Section -->
        <div class="agent-section">
          <h3>Evaluators</h3>
          <div class="agent-table">
            <!-- Add New Evaluator Row -->
            <div class="agent-row add-row">
              <ion-select
                v-model="newEvaluatorAgent"
                placeholder="Select evaluator..."
                interface="popover"
                class="agent-select"
              >
                <ion-select-option
                  v-for="agent in availableEvaluatorAgents"
                  :key="agent.slug"
                  :value="agent.slug"
                >
                  {{ agent.name }}
                </ion-select-option>
              </ion-select>
              <ion-select
                v-model="newEvaluatorProvider"
                placeholder="Provider"
                interface="popover"
                class="provider-select"
                :disabled="!newEvaluatorAgent"
              >
                <ion-select-option
                  v-for="provider in llmProviders"
                  :key="provider.name"
                  :value="provider.name"
                >
                  {{ provider.displayName }}
                </ion-select-option>
              </ion-select>
              <ion-select
                v-model="newEvaluatorModel"
                placeholder="Model"
                interface="popover"
                class="model-select"
                :disabled="!newEvaluatorProvider"
              >
                <ion-select-option
                  v-for="model in getModelsForProvider(newEvaluatorProvider)"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.name }}
                </ion-select-option>
              </ion-select>
              <ion-button
                fill="clear"
                size="small"
                :disabled="!canAddEvaluator"
                @click="addEvaluator"
              >
                <ion-icon :icon="addCircleOutline" />
              </ion-button>
            </div>
            <!-- Selected Evaluators -->
            <div
              v-for="(config, index) in selectedEvaluators"
              :key="index"
              class="agent-row selected-row"
            >
              <span class="agent-name">{{
                getAgentName("evaluator", config.agentSlug)
              }}</span>
              <ion-select
                :value="config.llmProvider"
                interface="popover"
                class="provider-select"
                @ionChange="updateAgentProvider('evaluator', index, $event)"
              >
                <ion-select-option
                  v-for="provider in llmProviders"
                  :key="provider.name"
                  :value="provider.name"
                >
                  {{ provider.displayName }}
                </ion-select-option>
              </ion-select>
              <ion-select
                :value="config.llmModel"
                interface="popover"
                class="model-select"
                @ionChange="updateAgentModel('evaluator', index, $event)"
              >
                <ion-select-option
                  v-for="model in getModelsForProvider(config.llmProvider)"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.name }}
                </ion-select-option>
              </ion-select>
              <ion-button
                fill="clear"
                size="small"
                color="danger"
                @click="removeAgent('evaluator', index)"
              >
                <ion-icon :icon="removeCircleOutline" />
              </ion-button>
            </div>
          </div>
        </div>

        <!-- Execution Configuration -->
        <div class="execution-config-section">
          <h3>Execution Settings</h3>

          <!-- Max Edit Cycles -->
          <ion-item>
            <ion-label>Max Edit Cycles</ion-label>
            <ion-range
              v-model="maxEditCycles"
              :min="1"
              :max="5"
              :step="1"
              :pin="true"
              :snaps="true"
              :ticks="true"
            >
              <ion-label slot="start">1</ion-label>
              <ion-label slot="end">5</ion-label>
            </ion-range>
          </ion-item>

          <!-- Top N for Final Ranking -->
          <ion-item>
            <ion-label>Top N for Final Ranking</ion-label>
            <ion-range
              v-model="topNForFinalRanking"
              :min="1"
              :max="10"
              :step="1"
              :pin="true"
              :snaps="true"
              :ticks="true"
            >
              <ion-label slot="start">1</ion-label>
              <ion-label slot="end">10</ion-label>
            </ion-range>
          </ion-item>

          <!-- Top N for Deliverable -->
          <ion-item>
            <ion-label>Top N in Deliverable</ion-label>
            <ion-range
              v-model="topNForDeliverable"
              :min="1"
              :max="10"
              :step="1"
              :pin="true"
              :snaps="true"
              :ticks="true"
            >
              <ion-label slot="start">1</ion-label>
              <ion-label slot="end">10</ion-label>
            </ion-range>
          </ion-item>

          <!-- Max Local Concurrent -->
          <ion-item>
            <ion-label>Max Local Concurrent</ion-label>
            <ion-range
              v-model="maxLocalConcurrent"
              :min="1"
              :max="3"
              :step="1"
              :pin="true"
              :snaps="true"
              :ticks="true"
            >
              <ion-label slot="start">1</ion-label>
              <ion-label slot="end">3</ion-label>
            </ion-range>
          </ion-item>

          <!-- Max Cloud Concurrent -->
          <ion-item>
            <ion-label>Max Cloud Concurrent</ion-label>
            <ion-range
              v-model="maxCloudConcurrent"
              :min="1"
              :max="10"
              :step="1"
              :pin="true"
              :snaps="true"
              :ticks="true"
            >
              <ion-label slot="start">1</ion-label>
              <ion-label slot="end">10</ion-label>
            </ion-range>
          </ion-item>
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Summary and Execute -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>Execution Summary</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <p><strong>Writers:</strong> {{ selectedWriterCount }} agent(s)</p>
        <p><strong>Editors:</strong> {{ selectedEditorCount }} agent(s)</p>
        <p>
          <strong>Evaluators:</strong> {{ selectedEvaluatorCount }} agent(s)
        </p>
        <p><strong>Max Edit Cycles:</strong> {{ maxEditCycles }}</p>
        <p>
          <strong>Top N for Final Ranking:</strong> {{ topNForFinalRanking }}
        </p>
        <p><strong>Top N in Deliverable:</strong> {{ topNForDeliverable }}</p>
        <p>
          <strong>Concurrency:</strong> {{ maxLocalConcurrent }} local /
          {{ maxCloudConcurrent }} cloud
        </p>
        <p class="total-combinations">
          <strong>Total Combinations:</strong> {{ totalCombinations }}
        </p>

        <ion-button
          expand="block"
          :disabled="!canExecute"
          @click="handleExecute"
        >
          Start Marketing Swarm
        </ion-button>

        <p v-if="!canExecute" class="validation-error">
          {{ validationMessage }}
        </p>
      </ion-card-content>
    </ion-card>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted } from "vue";
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonRange,
  IonButton,
  IonIcon,
} from "@ionic/vue";
import {
  addCircleOutline,
  removeCircleOutline,
  timeOutline,
} from "ionicons/icons";
import { useMarketingSwarmStore } from "@/stores/marketingSwarmStore";
import {
  llmService,
  type LLMProvider,
  type LLMModel,
} from "@/services/llmService";
import { marketingSwarmService } from "@/services/marketingSwarmService";
import type {
  PromptData,
  SwarmConfig,
  AgentConfig,
} from "@/types/marketing-swarm";

const emit = defineEmits<{
  (
    e: "execute",
    data: {
      contentTypeSlug: string;
      contentTypeContext: string;
      promptData: PromptData;
      config: SwarmConfig;
    },
  ): void;
  (e: "browse-history"): void;
}>();

const store = useMarketingSwarmStore();

// Content type selection - default to blog-post for faster testing
const selectedContentType = ref<string>("blog-post");

const contentTypes = computed(() => store.contentTypes);

const selectedContentTypeDescription = computed(() => {
  const type = contentTypes.value.find(
    (t) => t.slug === selectedContentType.value,
  );
  return type?.description || "";
});

const selectedContentTypeContext = computed(() => {
  const type = contentTypes.value.find(
    (t) => t.slug === selectedContentType.value,
  );
  return type?.systemPromptTemplate || "";
});

// Prompt data - pre-filled with test defaults for faster testing
const promptData = ref<PromptData>({
  topic:
    "AI-Powered Marketing Automation: How Small Businesses Can Compete with Enterprise",
  audience:
    "Small business owners and marketing managers looking to leverage AI tools",
  goal: "Educate readers on practical AI marketing tools and inspire them to start automating",
  keyPoints: [
    "AI marketing tools are now affordable for small businesses",
    "Start with email automation and social media scheduling",
    "Use AI for content generation and personalization",
    "Measure ROI and iterate on your strategy",
  ],
  tone: "professional",
  constraints: "",
  examples: "",
  additionalContext: "",
});

const keyPointsText = ref(
  "AI marketing tools are now affordable for small businesses\nStart with email automation and social media scheduling\nUse AI for content generation and personalization\nMeasure ROI and iterate on your strategy",
);

watch(keyPointsText, (text) => {
  promptData.value.keyPoints = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
});

// LLM selection state
const llmProviders = ref<LLMProvider[]>([]);
const llmModels = ref<LLMModel[]>([]);
const llmProvidersLoading = ref(false);
const llmModelsLoading = ref(false);

// State for "Add New" rows
const newWriterAgent = ref<string>("");
const newWriterProvider = ref<string>("");
const newWriterModel = ref<string>("");
const newEditorAgent = ref<string>("");
const newEditorProvider = ref<string>("");
const newEditorModel = ref<string>("");
const newEvaluatorAgent = ref<string>("");
const newEvaluatorProvider = ref<string>("");
const newEvaluatorModel = ref<string>("");

// Get models for a specific provider
function getModelsForProvider(provider: string): LLMModel[] {
  if (!provider) return [];
  return llmModels.value.filter((m) => m.providerName === provider);
}

// Get model info by provider and model name
function getModelInfo(provider: string, model: string): LLMModel | undefined {
  return llmModels.value.find(
    (m) => m.providerName === provider && m.id === model,
  );
}

// Load providers on mount
async function loadProviders() {
  llmProvidersLoading.value = true;
  try {
    llmProviders.value = await llmService.getProviders();
  } catch (error) {
    console.error("Failed to load LLM providers:", error);
  } finally {
    llmProvidersLoading.value = false;
  }
}

// Load all models on mount
async function loadModels() {
  llmModelsLoading.value = true;
  try {
    llmModels.value = await llmService.getModels();
  } catch (error) {
    console.error("Failed to load LLM models:", error);
  } finally {
    llmModelsLoading.value = false;
  }
}

// Watch agent selection - auto-fill provider/model from agent's LLM config
// These watches run BEFORE provider watches to set the correct values
watch(
  newWriterAgent,
  async (agentSlug) => {
    if (!agentSlug) {
      newWriterProvider.value = "";
      newWriterModel.value = "";
      return;
    }
    try {
      const configs = await marketingSwarmService.getAgentLLMConfigs(agentSlug);
      if (configs.length > 0) {
        // Use the default config if available, otherwise use the first one
        const defaultConfig = configs.find((c) => c.isDefault) || configs[0];
        if (defaultConfig) {
          newWriterProvider.value = defaultConfig.llmProvider;
          newWriterModel.value = defaultConfig.llmModel;
        }
      }
    } catch (error) {
      console.error("Failed to load LLM config for writer agent:", error);
    }
  },
  { immediate: false },
);

watch(
  newEditorAgent,
  async (agentSlug) => {
    if (!agentSlug) {
      newEditorProvider.value = "";
      newEditorModel.value = "";
      return;
    }
    try {
      const configs = await marketingSwarmService.getAgentLLMConfigs(agentSlug);
      if (configs.length > 0) {
        const defaultConfig = configs.find((c) => c.isDefault) || configs[0];
        if (defaultConfig) {
          newEditorProvider.value = defaultConfig.llmProvider;
          newEditorModel.value = defaultConfig.llmModel;
        }
      }
    } catch (error) {
      console.error("Failed to load LLM config for editor agent:", error);
    }
  },
  { immediate: false },
);

watch(
  newEvaluatorAgent,
  async (agentSlug) => {
    if (!agentSlug) {
      newEvaluatorProvider.value = "";
      newEvaluatorModel.value = "";
      return;
    }
    try {
      const configs = await marketingSwarmService.getAgentLLMConfigs(agentSlug);
      if (configs.length > 0) {
        const defaultConfig = configs.find((c) => c.isDefault) || configs[0];
        if (defaultConfig) {
          newEvaluatorProvider.value = defaultConfig.llmProvider;
          newEvaluatorModel.value = defaultConfig.llmModel;
        }
      }
    } catch (error) {
      console.error("Failed to load LLM config for evaluator agent:", error);
    }
  },
  { immediate: false },
);

// Watch provider changes for "Add New" rows - reset model when provider changes
// Only reset if agent wasn't just selected (to avoid overriding agent's config)
watch(newWriterProvider, (newProvider, oldProvider) => {
  // Only auto-select first model if provider changed manually (not from agent selection)
  if (newProvider && newProvider !== oldProvider && !newWriterAgent.value) {
    const validModels = getModelsForProvider(newProvider);
    if (validModels.length > 0) {
      newWriterModel.value = validModels[0].model;
    } else {
      newWriterModel.value = "";
    }
  }
});

watch(newEditorProvider, (newProvider, oldProvider) => {
  if (newProvider && newProvider !== oldProvider && !newEditorAgent.value) {
    const validModels = getModelsForProvider(newProvider);
    if (validModels.length > 0) {
      newEditorModel.value = validModels[0].model;
    } else {
      newEditorModel.value = "";
    }
  }
});

watch(newEvaluatorProvider, (newProvider, oldProvider) => {
  if (newProvider && newProvider !== oldProvider && !newEvaluatorAgent.value) {
    const validModels = getModelsForProvider(newProvider);
    if (validModels.length > 0) {
      newEvaluatorModel.value = validModels[0].model;
    } else {
      newEvaluatorModel.value = "";
    }
  }
});

// Agent selection
const writerAgents = computed(() => store.writerAgents);
const editorAgents = computed(() => store.editorAgents);
const evaluatorAgents = computed(() => store.evaluatorAgents);

const selectedWriters = ref<AgentConfig[]>([]);
const selectedEditors = ref<AgentConfig[]>([]);
const selectedEvaluators = ref<AgentConfig[]>([]);

// Available agents (all agents - same agent can be added multiple times with different LLMs)
const availableWriterAgents = computed(() => writerAgents.value);
const availableEditorAgents = computed(() => editorAgents.value);
const availableEvaluatorAgents = computed(() => evaluatorAgents.value);

// Can add checks
const canAddWriter = computed(() => {
  return !!(
    newWriterAgent.value &&
    newWriterProvider.value &&
    newWriterModel.value
  );
});

const canAddEditor = computed(() => {
  return !!(
    newEditorAgent.value &&
    newEditorProvider.value &&
    newEditorModel.value
  );
});

const canAddEvaluator = computed(() => {
  return !!(
    newEvaluatorAgent.value &&
    newEvaluatorProvider.value &&
    newEvaluatorModel.value
  );
});

// Add agent functions
function addWriter() {
  if (!canAddWriter.value) return;
  const modelInfo = getModelInfo(newWriterProvider.value, newWriterModel.value);
  selectedWriters.value.push({
    agentSlug: newWriterAgent.value,
    llmConfigId: `${newWriterProvider.value}:${newWriterModel.value}`,
    llmProvider: newWriterProvider.value,
    llmModel: newWriterModel.value,
    displayName: modelInfo?.name || newWriterModel.value,
  });
  // Reset the add row
  newWriterAgent.value = "";
  newWriterProvider.value = "";
  newWriterModel.value = "";
}

function addEditor() {
  if (!canAddEditor.value) return;
  const modelInfo = getModelInfo(newEditorProvider.value, newEditorModel.value);
  selectedEditors.value.push({
    agentSlug: newEditorAgent.value,
    llmConfigId: `${newEditorProvider.value}:${newEditorModel.value}`,
    llmProvider: newEditorProvider.value,
    llmModel: newEditorModel.value,
    displayName: modelInfo?.name || newEditorModel.value,
  });
  // Reset the add row
  newEditorAgent.value = "";
  newEditorProvider.value = "";
  newEditorModel.value = "";
}

function addEvaluator() {
  if (!canAddEvaluator.value) return;
  const modelInfo = getModelInfo(
    newEvaluatorProvider.value,
    newEvaluatorModel.value,
  );
  selectedEvaluators.value.push({
    agentSlug: newEvaluatorAgent.value,
    llmConfigId: `${newEvaluatorProvider.value}:${newEvaluatorModel.value}`,
    llmProvider: newEvaluatorProvider.value,
    llmModel: newEvaluatorModel.value,
    displayName: modelInfo?.name || newEvaluatorModel.value,
  });
  // Reset the add row
  newEvaluatorAgent.value = "";
  newEvaluatorProvider.value = "";
  newEvaluatorModel.value = "";
}

// Remove agent
function removeAgent(role: "writer" | "editor" | "evaluator", index: number) {
  if (role === "writer") {
    selectedWriters.value.splice(index, 1);
  } else if (role === "editor") {
    selectedEditors.value.splice(index, 1);
  } else {
    selectedEvaluators.value.splice(index, 1);
  }
}

// Update agent provider (reset model to first available)
function updateAgentProvider(
  role: "writer" | "editor" | "evaluator",
  index: number,
  event: CustomEvent,
) {
  const newProvider = event.detail.value;
  const list =
    role === "writer"
      ? selectedWriters
      : role === "editor"
        ? selectedEditors
        : selectedEvaluators;
  const config = list.value[index];
  if (config) {
    config.llmProvider = newProvider;
    const validModels = getModelsForProvider(newProvider);
    if (validModels.length > 0) {
      config.llmModel = validModels[0].model;
      config.displayName = validModels[0].name;
      config.llmConfigId = `${newProvider}:${validModels[0].model}`;
    }
  }
}

// Update agent model
function updateAgentModel(
  role: "writer" | "editor" | "evaluator",
  index: number,
  event: CustomEvent,
) {
  const newModel = event.detail.value;
  const list =
    role === "writer"
      ? selectedWriters
      : role === "editor"
        ? selectedEditors
        : selectedEvaluators;
  const config = list.value[index];
  if (config) {
    config.llmModel = newModel;
    const modelInfo = getModelInfo(config.llmProvider, newModel);
    config.displayName = modelInfo?.name || newModel;
    config.llmConfigId = `${config.llmProvider}:${newModel}`;
  }
}

// Get agent name for display
function getAgentName(
  role: "writer" | "editor" | "evaluator",
  slug: string,
): string {
  const agents =
    role === "writer"
      ? writerAgents
      : role === "editor"
        ? editorAgents
        : evaluatorAgents;
  const agent = agents.value.find((a) => a.slug === slug);
  return agent?.name || slug;
}

// Execution config
const maxEditCycles = ref(3);
const topNForFinalRanking = ref(3);
const topNForDeliverable = ref(3);
const maxLocalConcurrent = ref(1);
const maxCloudConcurrent = ref(5);

// Summary calculations
const selectedWriterCount = computed(() => selectedWriters.value.length);
const selectedEditorCount = computed(() => selectedEditors.value.length);
const selectedEvaluatorCount = computed(() => selectedEvaluators.value.length);

const totalCombinations = computed(() => {
  const writers = selectedWriterCount.value || 1;
  const editors = selectedEditorCount.value || 1;
  return writers * editors;
});

// Validation
const canExecute = computed(() => {
  return (
    selectedContentType.value &&
    promptData.value.topic &&
    promptData.value.audience &&
    promptData.value.goal &&
    promptData.value.keyPoints.length > 0 &&
    promptData.value.tone &&
    selectedWriters.value.length > 0
  );
});

const validationMessage = computed(() => {
  if (!selectedContentType.value) return "Please select a content type";
  if (!promptData.value.topic) return "Please enter a topic";
  if (!promptData.value.audience) return "Please enter target audience";
  if (!promptData.value.goal) return "Please enter a goal";
  if (promptData.value.keyPoints.length === 0)
    return "Please enter at least one key point";
  if (!promptData.value.tone) return "Please select a tone";
  if (selectedWriters.value.length === 0)
    return "Please add at least one writer agent";
  return "";
});

// Load LLM data and auto-select all multi-provider agents on mount
onMounted(async () => {
  // Load LLM providers and models
  await Promise.all([loadProviders(), loadModels()]);

  // Wait for store to load agents, then auto-add all multi-provider agents
  let unwatchFn: (() => void) | null = null;

  const autoSelectAgents = async () => {
    // Auto-select one of each writer type (conversational, creative, technical, persuasive)
    const writerTypes = [
      "writer-conversational",
      "writer-creative",
      "writer-technical",
      "writer-persuasive",
    ];

    // Auto-select one of each editor type (clarity, brand, engagement, seo)
    const editorTypes = [
      "editor-clarity",
      "editor-brand",
      "editor-engagement",
      "editor-seo",
    ];

    // Auto-select one of each evaluator type (quality, conversion, creativity)
    const evaluatorTypes = [
      "evaluator-quality",
      "evaluator-conversion",
      "evaluator-creativity",
    ];

    // Add one writer of each type with their default LLM configs
    for (const writerType of writerTypes) {
      const writer = writerAgents.value.find((a) => a.slug === writerType);
      if (writer) {
        try {
          const configs = await marketingSwarmService.getAgentLLMConfigs(
            writer.slug,
          );
          if (configs.length > 0) {
            const defaultConfig =
              configs.find((c) => c.isDefault) || configs[0];
            if (defaultConfig) {
              const modelInfo = getModelInfo(
                defaultConfig.llmProvider,
                defaultConfig.llmModel,
              );
              selectedWriters.value.push({
                agentSlug: writer.slug,
                llmConfigId: `${defaultConfig.llmProvider}:${defaultConfig.llmModel}`,
                llmProvider: defaultConfig.llmProvider,
                llmModel: defaultConfig.llmModel,
                displayName:
                  modelInfo?.name ||
                  defaultConfig.displayName ||
                  defaultConfig.llmModel,
              });
            }
          }
        } catch (error) {
          console.error(
            `Failed to load LLM config for writer ${writer.slug}:`,
            error,
          );
        }
      }
    }

    // Add one editor of each type with their default LLM configs
    for (const editorType of editorTypes) {
      const editor = editorAgents.value.find((a) => a.slug === editorType);
      if (editor) {
        try {
          const configs = await marketingSwarmService.getAgentLLMConfigs(
            editor.slug,
          );
          if (configs.length > 0) {
            const defaultConfig =
              configs.find((c) => c.isDefault) || configs[0];
            if (defaultConfig) {
              const modelInfo = getModelInfo(
                defaultConfig.llmProvider,
                defaultConfig.llmModel,
              );
              selectedEditors.value.push({
                agentSlug: editor.slug,
                llmConfigId: `${defaultConfig.llmProvider}:${defaultConfig.llmModel}`,
                llmProvider: defaultConfig.llmProvider,
                llmModel: defaultConfig.llmModel,
                displayName:
                  modelInfo?.name ||
                  defaultConfig.displayName ||
                  defaultConfig.llmModel,
              });
            }
          }
        } catch (error) {
          console.error(
            `Failed to load LLM config for editor ${editor.slug}:`,
            error,
          );
        }
      }
    }

    // Add one evaluator of each type with their default LLM configs
    for (const evaluatorType of evaluatorTypes) {
      const evaluator = evaluatorAgents.value.find(
        (a) => a.slug === evaluatorType,
      );
      if (evaluator) {
        try {
          const configs = await marketingSwarmService.getAgentLLMConfigs(
            evaluator.slug,
          );
          if (configs.length > 0) {
            const defaultConfig =
              configs.find((c) => c.isDefault) || configs[0];
            if (defaultConfig) {
              const modelInfo = getModelInfo(
                defaultConfig.llmProvider,
                defaultConfig.llmModel,
              );
              selectedEvaluators.value.push({
                agentSlug: evaluator.slug,
                llmConfigId: `${defaultConfig.llmProvider}:${defaultConfig.llmModel}`,
                llmProvider: defaultConfig.llmProvider,
                llmModel: defaultConfig.llmModel,
                displayName:
                  modelInfo?.name ||
                  defaultConfig.displayName ||
                  defaultConfig.llmModel,
              });
            }
          }
        } catch (error) {
          console.error(
            `Failed to load LLM config for evaluator ${evaluator.slug}:`,
            error,
          );
        }
      }
    }

    // Stop watching after selection
    if (unwatchFn) {
      unwatchFn();
    }
  };

  unwatchFn = watch(
    () => [
      writerAgents.value.length,
      editorAgents.value.length,
      evaluatorAgents.value.length,
    ],
    () => {
      if (
        writerAgents.value.length > 0 &&
        editorAgents.value.length > 0 &&
        evaluatorAgents.value.length > 0
      ) {
        autoSelectAgents();
      }
    },
    { immediate: true },
  );
});

// Execute
function handleExecute() {
  if (!canExecute.value) return;

  emit("execute", {
    contentTypeSlug: selectedContentType.value,
    contentTypeContext: selectedContentTypeContext.value,
    promptData: { ...promptData.value },
    config: {
      writers: [...selectedWriters.value],
      editors: [...selectedEditors.value],
      evaluators: [...selectedEvaluators.value],
      maxEditCycles: maxEditCycles.value,
      execution: {
        maxLocalConcurrent: maxLocalConcurrent.value,
        maxCloudConcurrent: maxCloudConcurrent.value,
        maxEditCycles: maxEditCycles.value,
        topNForFinalRanking: topNForFinalRanking.value,
        topNForDeliverable: topNForDeliverable.value,
      },
    },
  });
}
</script>

<style scoped>
.swarm-config-form {
  padding: 16px;
  max-width: 800px;
  margin: 0 auto;
}

.content-type-description {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
  margin-top: 8px;
  padding: 0 16px;
}

.agent-section {
  margin-bottom: 24px;
}

.agent-section h3,
.execution-config-section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--ion-color-primary);
}

.agent-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
}

.agent-row.add-row {
}

.agent-row.selected-row {
}

.agent-row .agent-select {
  flex: 2;
  min-width: 120px;
}

.agent-row .provider-select {
  flex: 1;
  min-width: 100px;
}

.agent-row .model-select {
  flex: 2;
  min-width: 150px;
}

.agent-row .agent-name {
  flex: 2;
  min-width: 120px;
  font-weight: 500;
  padding-left: 8px;
}

.agent-row ion-button {
  flex-shrink: 0;
}

.execution-config-section {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--ion-color-light);
}

.total-combinations {
  font-size: 1.125rem;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--ion-color-light);
}

.validation-error {
  color: var(--ion-color-danger);
  font-size: 0.875rem;
  margin-top: 12px;
  text-align: center;
}

.history-action {
  display: flex;
  justify-content: center;
  padding: 12px 16px 0;
}

ion-card {
  margin-bottom: 16px;
}

.model-info {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
  margin-top: 8px;
  padding: 0 16px;
}

.model-info ion-badge {
  vertical-align: middle;
  margin-left: 4px;
}
</style>
