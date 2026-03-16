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
            <h2>Edit Dimension</h2>
            <button class="close-btn" @click="$emit('close')">&times;</button>
          </header>

          <form @submit.prevent="handleSubmit" class="modal-body">
            <!-- Read-only info -->
            <div class="info-row">
              <span class="info-label">Slug:</span>
              <code class="info-value">{{ form.slug }}</code>
            </div>

            <!-- Editable fields -->
            <div class="form-group">
              <label for="name">Name *</label>
              <input
                id="name"
                v-model="form.name"
                type="text"
                required
                placeholder="Dimension name"
              />
            </div>

            <div class="form-group">
              <label for="displayName">Display Name</label>
              <input
                id="displayName"
                v-model="form.displayName"
                type="text"
                placeholder="Short display name"
              />
              <span class="help-text">Short name shown in charts and badges</span>
            </div>

            <div class="form-group">
              <label for="description">Description</label>
              <textarea
                id="description"
                v-model="form.description"
                rows="4"
                placeholder="Describe what this dimension measures..."
              ></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="weight">Weight (%)</label>
                <input
                  id="weight"
                  v-model.number="form.weightPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                />
                <span class="help-text">Contribution to composite score</span>
              </div>

              <div class="form-group">
                <label for="displayOrder">Display Order</label>
                <input
                  id="displayOrder"
                  v-model.number="form.displayOrder"
                  type="number"
                  min="1"
                  max="100"
                />
                <span class="help-text">Order in lists (lower = first)</span>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="icon">Icon</label>
                <div class="icon-input-wrapper">
                  <input
                    id="icon"
                    v-model="form.icon"
                    type="text"
                    placeholder="e.g., trending_up"
                  />
                  <span v-if="form.icon" class="material-icons icon-preview" :style="{ color: form.color }">
                    {{ form.icon }}
                  </span>
                </div>
                <span class="help-text">
                  <a href="https://fonts.google.com/icons" target="_blank" rel="noopener">Browse Material Icons</a>
                </span>
              </div>

              <div class="form-group">
                <label for="color">Color</label>
                <div class="color-input-wrapper">
                  <input
                    id="color"
                    v-model="form.color"
                    type="color"
                    class="color-picker"
                  />
                  <input
                    v-model="form.color"
                    type="text"
                    class="color-text"
                    placeholder="#ef4444"
                  />
                </div>
              </div>
            </div>

            <div class="form-group checkbox-group">
              <label class="checkbox-label">
                <input v-model="form.isActive" type="checkbox" />
                <span>Active</span>
              </label>
              <span class="help-text">Inactive dimensions are excluded from analysis</span>
            </div>

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
              {{ isSubmitting ? 'Saving...' : 'Save Changes' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { RiskDimension } from '@/types/risk-agent';

interface Props {
  isOpen: boolean;
  dimension: RiskDimension | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  save: [params: {
    id: string;
    name: string;
    displayName?: string;
    description?: string;
    weight: number;
    displayOrder: number;
    icon?: string;
    color?: string;
    isActive: boolean;
  }];
}>();

// Form state
const form = ref({
  slug: '',
  name: '',
  displayName: '',
  description: '',
  weightPercent: 0,
  displayOrder: 1,
  icon: '',
  color: '#15803d',
  isActive: true,
});

const isSubmitting = ref(false);
const error = ref<string | null>(null);

const isValid = computed(() => {
  return form.value.name.trim() !== '' && form.value.weightPercent >= 0 && form.value.weightPercent <= 100;
});

// Populate form when dimension changes
watch(() => props.dimension, (dimension) => {
  if (dimension) {
    const weight = dimension.weight > 1 ? dimension.weight : dimension.weight * 100;
    form.value = {
      slug: dimension.slug,
      name: dimension.name,
      displayName: dimension.displayName || '',
      description: dimension.description || '',
      weightPercent: Math.round(weight),
      displayOrder: dimension.displayOrder || 1,
      icon: dimension.icon || '',
      color: dimension.color || '#15803d',
      isActive: dimension.isActive !== false,
    };
    error.value = null;
  }
}, { immediate: true });

// Reset when modal closes
watch(() => props.isOpen, (open) => {
  if (!open) {
    error.value = null;
    isSubmitting.value = false;
  }
});

function handleSubmit() {
  if (!isValid.value || isSubmitting.value || !props.dimension) return;

  error.value = null;
  isSubmitting.value = true;

  emit('save', {
    id: props.dimension.id,
    name: form.value.name.trim(),
    displayName: form.value.displayName.trim() || undefined,
    description: form.value.description.trim() || undefined,
    weight: form.value.weightPercent / 100, // Convert back to 0-1 scale
    displayOrder: form.value.displayOrder,
    icon: form.value.icon.trim() || undefined,
    color: form.value.color || undefined,
    isActive: form.value.isActive,
  });
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
  max-width: 520px;
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

.info-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--info-bg, #f9fafb);
  border-radius: 6px;
}

.info-label {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}

.info-value {
  font-family: monospace;
  font-size: 0.875rem;
  background: var(--code-bg, #e5e7eb);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
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

.form-group input[type="text"],
.form-group input[type="number"],
.form-group textarea {
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  background: var(--input-bg, #ffffff);
}

.form-group input:focus,
.form-group textarea:focus {
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

.help-text a {
  color: var(--primary-color, #a87c4f);
  text-decoration: none;
}

.help-text a:hover {
  text-decoration: underline;
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

.icon-input-wrapper {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.icon-input-wrapper input {
  flex: 1;
}

.icon-preview {
  font-size: 24px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--info-bg, #f9fafb);
  border-radius: 6px;
}

.color-input-wrapper {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.color-picker {
  width: 40px;
  height: 36px;
  padding: 2px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  cursor: pointer;
}

.color-text {
  flex: 1;
}

.checkbox-group {
  padding: 0.75rem;
  background: var(--info-bg, #f9fafb);
  border-radius: 6px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
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
  --info-bg: #374151;
  --code-bg: #4b5563;
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
