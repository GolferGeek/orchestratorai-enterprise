import { ref, onUnmounted } from 'vue';
import { useLoadingStore } from '../stores/loadingStore';

export function useLoading(taskId?: string) {
  const loadingStore = useLoadingStore();
  const currentTaskId = ref(taskId || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  /**
   * Start loading with optional message and spinner type
   */
  const startLoading = (
    message?: string, 
    spinnerType?: 'lines' | 'dots' | 'bubbles' | 'circles' | 'crescent'
  ) => {
    loadingStore.startLoading(currentTaskId.value, message, spinnerType);
  };

  /**
   * Stop the current loading task
   */
  const stopLoading = () => {
    loadingStore.stopLoading(currentTaskId.value);
  };

  /**
   * Update loading message
   */
  const updateMessage = (message: string) => {
    loadingStore.updateMessage(message);
  };

  /**
   * Wrap an async operation with loading
   */
  const withLoading = async <T>(
    operation: () => Promise<T>,
    message?: string,
    spinnerType?: 'lines' | 'dots' | 'bubbles' | 'circles' | 'crescent'
  ): Promise<T> => {
    startLoading(message, spinnerType);
    
    try {
      const result = await operation();
      return result;
    } finally {
      stopLoading();
    }
  };

  /**
   * Wrap a sync operation with loading
   */
  const withSyncLoading = <T>(
    operation: () => T,
    message?: string,
    spinnerType?: 'lines' | 'dots' | 'bubbles' | 'circles' | 'crescent'
  ): T => {
    startLoading(message, spinnerType);
    
    try {
      const result = operation();
      return result;
    } finally {
      // Use setTimeout to allow UI to update
      setTimeout(() => stopLoading(), 0);
    }
  };

  /**
   * Clean up on component unmount
   */
  onUnmounted(() => {
    stopLoading();
  });

  return {
    startLoading,
    stopLoading,
    updateMessage,
    withLoading,
    withSyncLoading,
    taskId: currentTaskId.value
  };
}