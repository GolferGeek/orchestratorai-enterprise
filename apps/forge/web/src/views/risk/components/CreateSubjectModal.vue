<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="fade">
      <div v-if="isOpen" class="modal-backdrop" @click="$emit('close')"></div>
    </Transition>

    <!-- Modal -->
    <Transition name="scale">
      <div v-if="isOpen" class="modal-container">
        <div class="modal">
          <header class="modal-header">
            <h2>Add New Subject</h2>
            <button class="close-btn" @click="$emit('close')">&times;</button>
          </header>

          <form @submit.prevent="handleSubmit" class="modal-body">
            <!-- Basic Info -->
            <section class="form-section">
              <h3>Subject Information</h3>

              <div class="form-group">
                <label for="identifier">Identifier *</label>
                <input
                  id="identifier"
                  v-model="form.identifier"
                  type="text"
                  required
                  placeholder="e.g., AAPL, BTC, PROJECT-001"
                />
                <span class="help-text">Unique identifier (stock ticker, crypto symbol, project code)</span>
              </div>

              <div class="form-group">
                <label for="name">Display Name *</label>
                <input
                  id="name"
                  v-model="form.name"
                  type="text"
                  required
                  placeholder="e.g., Apple Inc., Bitcoin, Q1 Launch Project"
                />
              </div>

              <div class="form-group">
                <label for="subjectType">Subject Type *</label>
                <select id="subjectType" v-model="form.subjectType" required>
                  <option value="" disabled>Select a type</option>
                  <option value="stock">Stock</option>
                  <option value="crypto">Cryptocurrency</option>
                  <option value="decision">Decision</option>
                  <option value="project">Project</option>
                </select>
              </div>

              <div class="form-group">
                <div class="label-with-action">
                  <label for="context">Context (Optional)</label>
                  <button
                    type="button"
                    class="ai-btn"
                    :disabled="!canGenerateContext || isGeneratingContext"
                    @click="generateContext"
                    title="Generate context with AI"
                  >
                    <span v-if="isGeneratingContext" class="spinner-tiny"></span>
                    <span v-else>✨ AI</span>
                  </button>
                </div>
                <textarea
                  id="context"
                  v-model="form.context"
                  rows="3"
                  placeholder="Additional context for risk analysis..."
                ></textarea>
                <span class="help-text">Background info to help with analysis. Click AI to auto-generate.</span>
              </div>
            </section>

            <!-- Metadata (conditional based on type) -->
            <section v-if="form.subjectType === 'stock'" class="form-section">
              <h3>Stock Details</h3>
              <div class="form-row">
                <div class="form-group">
                  <label for="sector">Sector</label>
                  <input
                    id="sector"
                    v-model="form.metadata.sector"
                    type="text"
                    placeholder="e.g., Technology"
                  />
                </div>
                <div class="form-group">
                  <label for="exchange">Exchange</label>
                  <input
                    id="exchange"
                    v-model="form.metadata.exchange"
                    type="text"
                    placeholder="e.g., NASDAQ"
                  />
                </div>
              </div>
            </section>

            <section v-if="form.subjectType === 'crypto'" class="form-section">
              <h3>Crypto Details</h3>
              <div class="form-row">
                <div class="form-group">
                  <label for="blockchain">Blockchain</label>
                  <input
                    id="blockchain"
                    v-model="form.metadata.blockchain"
                    type="text"
                    placeholder="e.g., Ethereum, Solana"
                  />
                </div>
                <div class="form-group">
                  <label for="category">Category</label>
                  <input
                    id="category"
                    v-model="form.metadata.category"
                    type="text"
                    placeholder="e.g., Layer 1, DeFi"
                  />
                </div>
              </div>
            </section>

            <!-- Error -->
            <div v-if="error" class="error-message">
              {{ error }}
            </div>
          </form>

          <footer class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="$emit('close')">
              Cancel
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="isSubmitting || !isValid"
              @click="handleSubmit"
            >
              <span v-if="isSubmitting" class="spinner-small"></span>
              {{ isSubmitting ? 'Creating...' : 'Add Subject' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { RiskSubject, CreateSubjectRequest } from '@/types/risk-agent';
import { apiService } from '@/services/apiService';

interface Props {
  isOpen: boolean;
  scopeId: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  create: [params: CreateSubjectRequest];
}>();

// Form state
const form = ref({
  identifier: '',
  name: '',
  subjectType: '' as RiskSubject['subjectType'] | '',
  context: '',
  metadata: {
    sector: '',
    exchange: '',
    blockchain: '',
    category: '',
  },
});

const isSubmitting = ref(false);
const isGeneratingContext = ref(false);
const error = ref<string | null>(null);

const canGenerateContext = computed(() => {
  return form.value.identifier.trim() !== '' && form.value.subjectType !== '';
});

const isValid = computed(() => {
  return (
    form.value.identifier.trim() !== '' &&
    form.value.name.trim() !== '' &&
    form.value.subjectType !== '' &&
    props.scopeId !== null
  );
});

// Reset form when modal opens
watch(() => props.isOpen, (open) => {
  if (open) {
    form.value = {
      identifier: '',
      name: '',
      subjectType: '',
      context: '',
      metadata: {
        sector: '',
        exchange: '',
        blockchain: '',
        category: '',
      },
    };
    error.value = null;
  }
});

async function generateContext() {
  if (!canGenerateContext.value || isGeneratingContext.value) return;

  isGeneratingContext.value = true;
  error.value = null;

  const subjectTypeLabels: Record<string, string> = {
    stock: 'publicly traded stock',
    crypto: 'cryptocurrency',
    decision: 'business decision',
    project: 'project',
    bond: 'bond investment',
    fund: 'investment fund',
    portfolio: 'investment portfolio',
    custom: 'custom asset',
  };
  const subjectTypeLabel = subjectTypeLabels[form.value.subjectType] || form.value.subjectType;

  const systemPrompt = `You are a risk analysis assistant. Generate a brief context summary (2-3 sentences) for risk analysis purposes. Focus on key characteristics, market position, and potential risk factors. Be factual and concise.`;

  const userPrompt = `Generate a brief context for risk analysis of "${form.value.identifier}"${form.value.name ? ` (${form.value.name})` : ''}, which is a ${subjectTypeLabel}.${
    form.value.subjectType === 'stock' && form.value.metadata.sector
      ? ` It operates in the ${form.value.metadata.sector} sector.`
      : ''
  }${
    form.value.subjectType === 'crypto' && form.value.metadata.blockchain
      ? ` It is built on ${form.value.metadata.blockchain}.`
      : ''
  }`;

  try {
    // Use the simple /llm/quick endpoint that doesn't require ExecutionContext
    const response = await apiService.post<{ response: string }>('/llm/quick', {
      systemPrompt,
      userPrompt,
    });

    if (response.response) {
      form.value.context = response.response;
    }
  } catch (err) {
    console.error('Failed to generate context:', err);
    error.value = 'Failed to generate context. Please try again or enter manually.';
  } finally {
    isGeneratingContext.value = false;
  }
}

function handleSubmit() {
  if (!isValid.value || isSubmitting.value || !props.scopeId) return;

  error.value = null;
  isSubmitting.value = true;

  // Build metadata based on subject type
  const metadata: Record<string, string> = {};
  if (form.value.subjectType === 'stock') {
    if (form.value.metadata.sector) metadata.sector = form.value.metadata.sector;
    if (form.value.metadata.exchange) metadata.exchange = form.value.metadata.exchange;
  } else if (form.value.subjectType === 'crypto') {
    if (form.value.metadata.blockchain) metadata.blockchain = form.value.metadata.blockchain;
    if (form.value.metadata.category) metadata.category = form.value.metadata.category;
  }

  const params: CreateSubjectRequest = {
    scopeId: props.scopeId,
    identifier: form.value.identifier.trim().toUpperCase(),
    name: form.value.name.trim(),
    subjectType: form.value.subjectType as RiskSubject['subjectType'],
    context: form.value.context.trim() || undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };

  emit('create', params);
  isSubmitting.value = false;
}

// Expose method to set error from parent
defineExpose({
  setError: (msg: string) => {
    error.value = msg;
    isSubmitting.value = false;
  },
  setSubmitting: (val: boolean) => {
    isSubmitting.value = val;
  },
});
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

.modal-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  padding: 1rem;
}

.modal {
  background: var(--modal-bg, #ffffff);
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary, #111827);
}

.modal-body {
  padding: 1.25rem;
  overflow-y: auto;
  flex: 1;
}

.form-section {
  margin-bottom: 1.5rem;
}

.form-section:last-child {
  margin-bottom: 0;
}

.form-section h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0 0 1rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.form-group {
  margin-bottom: 1rem;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary, #111827);
  margin-bottom: 0.375rem;
}

.label-with-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
}

.label-with-action label {
  margin-bottom: 0;
}

.ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  border: 1px solid var(--primary-color, #a87c4f);
  background: transparent;
  color: var(--primary-color, #a87c4f);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.ai-btn:hover:not(:disabled) {
  background: var(--primary-color, #a87c4f);
  color: white;
}

.ai-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner-tiny {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  background: var(--input-bg, #ffffff);
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--primary-color, #a87c4f);
  box-shadow: 0 0 0 3px rgba(168, 124, 79, 0.1);
}

.form-group textarea {
  resize: vertical;
}

.help-text {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  margin-top: 0.25rem;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

@media (max-width: 480px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

.error-message {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
  margin-top: 1rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-secondary {
  background: var(--btn-secondary-bg, #f3f4f6);
  color: var(--btn-secondary-text, #374151);
}

.btn-secondary:hover {
  background: var(--btn-secondary-hover, #e5e7eb);
}

.btn-primary {
  background: var(--primary-color, #a87c4f);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-color-dark, #8f693f);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.scale-enter-active,
.scale-leave-active {
  transition: all 0.2s ease;
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Dark mode */
html.ion-palette-dark .modal,
html[data-theme="dark"] .modal {
  --modal-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --input-bg: #374151;
  --btn-secondary-bg: #374151;
  --btn-secondary-text: #f9fafb;
  --btn-secondary-hover: #4b5563;
}

html.ion-palette-dark .error-message,
html[data-theme="dark"] .error-message {
  background: rgba(220, 38, 38, 0.1);
  border-color: rgba(220, 38, 38, 0.3);
}
</style>
