/**
 * Validation Composable (Admin Web — simplified)
 * Basic form validation for admin management views.
 */
import { ref, computed } from 'vue';

export interface FieldError {
  field: string;
  message: string;
}

export function useValidation() {
  const errors = ref<FieldError[]>([]);

  const hasErrors = computed(() => errors.value.length > 0);

  function addError(field: string, message: string) {
    errors.value.push({ field, message });
  }

  function clearErrors() {
    errors.value = [];
  }

  function getFieldError(field: string): string | null {
    return errors.value.find((e) => e.field === field)?.message ?? null;
  }

  function validateRequired(value: unknown, fieldName: string): boolean {
    if (value === null || value === undefined || value === '') {
      addError(fieldName, `${fieldName} is required`);
      return false;
    }
    return true;
  }

  function validateEmail(value: string, fieldName = 'email'): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      addError(fieldName, 'Invalid email address');
      return false;
    }
    return true;
  }

  return {
    errors,
    hasErrors,
    addError,
    clearErrors,
    getFieldError,
    validateRequired,
    validateEmail,
  };
}
