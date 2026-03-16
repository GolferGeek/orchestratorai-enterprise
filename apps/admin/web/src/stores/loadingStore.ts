import { defineStore } from 'pinia';

interface LoadingState {
  isLoading: boolean;
  message: string | null;
  spinnerType: 'lines' | 'dots' | 'bubbles' | 'circles' | 'crescent';
  loadingTasks: Set<string>;
}

export const useLoadingStore = defineStore('loading', {
  state: (): LoadingState => ({
    isLoading: false,
    message: null,
    spinnerType: 'dots',
    loadingTasks: new Set()
  }),

  getters: {
    hasActiveTasks: (state) => state.loadingTasks.size > 0,
    taskCount: (state) => state.loadingTasks.size
  },

  actions: {
    /**
     * Start loading with a specific task ID
     */
    startLoading(taskId: string, message?: string, spinnerType?: LoadingState['spinnerType']) {
      this.loadingTasks.add(taskId);
      this.isLoading = true;
      
      if (message) {
        this.message = message;
      }
      
      if (spinnerType) {
        this.spinnerType = spinnerType;
      }
    },

    /**
     * Stop loading for a specific task
     */
    stopLoading(taskId: string) {
      this.loadingTasks.delete(taskId);
      
      // If no more active tasks, hide loading
      if (this.loadingTasks.size === 0) {
        this.isLoading = false;
        this.message = null;
      }
    },

    /**
     * Stop all loading immediately
     */
    stopAllLoading() {
      this.loadingTasks.clear();
      this.isLoading = false;
      this.message = null;
    },

    /**
     * Update loading message
     */
    updateMessage(message: string) {
      if (this.isLoading) {
        this.message = message;
      }
    },

    /**
     * Update spinner type
     */
    updateSpinner(spinnerType: LoadingState['spinnerType']) {
      this.spinnerType = spinnerType;
    }
  }
});