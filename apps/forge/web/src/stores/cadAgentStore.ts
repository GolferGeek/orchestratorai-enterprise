/**
 * CAD Agent Store - State + Synchronous Mutations Only
 *
 * Architecture: Stores contain ONLY state and synchronous mutations
 * For async operations, use cadAgentService
 *
 * ExecutionContext: This store does NOT create ExecutionContext.
 * ExecutionContext is received from executionContextStore and passed through services.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ============================================================================
// TYPES
// ============================================================================

export interface CadConstraints {
  units: 'mm' | 'inches';
  material: string;
  manufacturing_method: string;
  tolerance_class: 'loose' | 'standard' | 'precision';
  wall_thickness_min: number;
}

export interface CadOutputs {
  step?: string;
  stl?: string;
  gltf?: string;
  dxf?: string;
  thumbnail?: string;
}

export interface MeshStats {
  vertices: number;
  faces: number;
  boundingBox?: {
    min: [number, number, number] | { x: number; y: number; z: number };
    max: [number, number, number] | { x: number; y: number; z: number };
  };
}

export interface ExecutionLogEntry {
  id: string;
  stepType: string;
  message?: string;
  durationMs?: number;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  constraints: CadConstraints;
  createdAt: string;
}

interface CadAgentState {
  // Current task
  currentTaskId: string | null;
  currentDrawingId: string | null;
  currentProjectId: string | null;

  // UI state
  currentView: 'welcome' | 'config' | 'progress' | 'deliverables';
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;

  // Constraints
  constraints: CadConstraints;

  // Generation progress
  currentStage: string | null; // 'prompt_received' | 'constraints_applied' | etc.
  progressPercent: number;
  executionLog: ExecutionLogEntry[];

  // Generated code
  generatedCode: string | null;
  isCodeValid: boolean | null;
  validationErrors: string[];
  codeAttempt: number;

  // Outputs
  outputs: CadOutputs | null;
  meshStats: MeshStats | null;

  // Projects list for selector
  projects: Project[];
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_CONSTRAINTS: CadConstraints = {
  units: 'mm',
  material: 'PLA',
  manufacturing_method: '3D Printing',
  tolerance_class: 'standard',
  wall_thickness_min: 2.0,
};

// ============================================================================
// STORE DEFINITION
// ============================================================================

export const useCadAgentStore = defineStore('cadAgent', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<CadAgentState>({
    // Current task
    currentTaskId: null,
    currentDrawingId: null,
    currentProjectId: null,

    // UI state
    currentView: 'welcome',
    isLoading: false,
    isGenerating: false,
    error: null,

    // Constraints
    constraints: { ...DEFAULT_CONSTRAINTS },

    // Generation progress
    currentStage: null,
    progressPercent: 0,
    executionLog: [],

    // Generated code
    generatedCode: null,
    isCodeValid: null,
    validationErrors: [],
    codeAttempt: 0,

    // Outputs
    outputs: null,
    meshStats: null,

    // Projects list
    projects: [],
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const currentTaskId = computed(() => state.value.currentTaskId);
  const currentDrawingId = computed(() => state.value.currentDrawingId);
  const currentProjectId = computed(() => state.value.currentProjectId);
  const currentView = computed(() => state.value.currentView);
  const isLoading = computed(() => state.value.isLoading);
  const isGenerating = computed(() => state.value.isGenerating);
  const error = computed(() => state.value.error);
  const constraints = computed(() => state.value.constraints);
  const currentStage = computed(() => state.value.currentStage);
  const progressPercent = computed(() => state.value.progressPercent);
  const executionLog = computed(() => state.value.executionLog);
  const generatedCode = computed(() => state.value.generatedCode);
  const isCodeValid = computed(() => state.value.isCodeValid);
  const validationErrors = computed(() => state.value.validationErrors);
  const codeAttempt = computed(() => state.value.codeAttempt);
  const outputs = computed(() => state.value.outputs);
  const meshStats = computed(() => state.value.meshStats);
  const projects = computed(() => state.value.projects);

  // Has task data
  const hasTaskData = computed(() => {
    return state.value.currentTaskId !== null;
  });

  // Has progress data
  const hasProgressData = computed(() => {
    return (
      state.value.currentStage !== null ||
      state.value.executionLog.length > 0 ||
      state.value.generatedCode !== null
    );
  });

  // Has deliverables
  const hasDeliverables = computed(() => {
    return state.value.outputs !== null && Object.keys(state.value.outputs).length > 0;
  });

  // Effective constraints - merge project + local constraints
  const effectiveConstraints = computed(() => {
    const project = currentProject.value;
    if (!project) {
      return state.value.constraints;
    }
    // Merge project constraints with local overrides
    return {
      ...project.constraints,
      ...state.value.constraints,
    };
  });

  // Current project
  const currentProject = computed(() => {
    if (!state.value.currentProjectId) return null;
    return state.value.projects.find((p) => p.id === state.value.currentProjectId) || null;
  });

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getProjectById(id: string): Project | undefined {
    return state.value.projects.find((p) => p.id === id);
  }

  function getExecutionLogById(id: string): ExecutionLogEntry | undefined {
    return state.value.executionLog.find((e) => e.id === id);
  }

  // ============================================================================
  // MUTATIONS (Synchronous Only)
  // ============================================================================

  // Task management
  function setCurrentTaskId(taskId: string | null) {
    state.value.currentTaskId = taskId;
  }

  function setCurrentDrawingId(drawingId: string | null) {
    state.value.currentDrawingId = drawingId;
  }

  function setCurrentProjectId(projectId: string | null) {
    state.value.currentProjectId = projectId;
  }

  // UI state
  function setUIView(view: 'welcome' | 'config' | 'progress' | 'deliverables') {
    state.value.currentView = view;
  }

  function setLoading(loading: boolean) {
    state.value.isLoading = loading;
  }

  function setGenerating(generating: boolean) {
    state.value.isGenerating = generating;
  }

  function setError(error: string | null) {
    state.value.error = error;
  }

  function clearError() {
    state.value.error = null;
  }

  // Constraints
  function setConstraints(constraints: Partial<CadConstraints>) {
    state.value.constraints = {
      ...state.value.constraints,
      ...constraints,
    };
  }

  function resetConstraints() {
    state.value.constraints = { ...DEFAULT_CONSTRAINTS };
  }

  // Progress
  function setCurrentStage(stage: string | null) {
    state.value.currentStage = stage;
  }

  function setProgressPercent(percent: number) {
    state.value.progressPercent = Math.max(0, Math.min(100, percent));
  }

  function addExecutionLogEntry(entry: ExecutionLogEntry) {
    state.value.executionLog.push(entry);
  }

  function clearExecutionLog() {
    state.value.executionLog = [];
  }

  // Code
  function setGeneratedCode(code: string | null) {
    state.value.generatedCode = code;
  }

  function setCodeValidation(isValid: boolean, errors: string[] = []) {
    state.value.isCodeValid = isValid;
    state.value.validationErrors = errors;
  }

  function incrementCodeAttempt() {
    state.value.codeAttempt += 1;
  }

  function resetCodeAttempt() {
    state.value.codeAttempt = 0;
  }

  // Outputs
  function setOutputs(outputs: CadOutputs | null) {
    state.value.outputs = outputs;
  }

  function setMeshStats(stats: MeshStats | null) {
    state.value.meshStats = stats;
  }

  // Projects
  function setProjects(projects: Project[]) {
    state.value.projects = projects;
  }

  function addProject(project: Project) {
    const existingIndex = state.value.projects.findIndex((p) => p.id === project.id);
    if (existingIndex >= 0) {
      state.value.projects[existingIndex] = project;
    } else {
      state.value.projects.push(project);
    }
  }

  function removeProject(projectId: string) {
    state.value.projects = state.value.projects.filter((p) => p.id !== projectId);
    // Clear current project if it was removed
    if (state.value.currentProjectId === projectId) {
      state.value.currentProjectId = null;
    }
  }

  // Reset
  function resetTaskState() {
    // Reset task-specific state for new generation
    state.value.currentTaskId = null;
    state.value.currentDrawingId = null;
    state.value.currentStage = null;
    state.value.progressPercent = 0;
    state.value.executionLog = [];
    state.value.generatedCode = null;
    state.value.isCodeValid = null;
    state.value.validationErrors = [];
    state.value.codeAttempt = 0;
    state.value.outputs = null;
    state.value.meshStats = null;
    state.value.isGenerating = false;
    state.value.error = null;
  }

  function resetAll() {
    // Full reset - clear everything
    state.value.currentTaskId = null;
    state.value.currentDrawingId = null;
    state.value.currentProjectId = null;
    state.value.currentView = 'welcome';
    state.value.isLoading = false;
    state.value.isGenerating = false;
    state.value.error = null;
    state.value.constraints = { ...DEFAULT_CONSTRAINTS };
    state.value.currentStage = null;
    state.value.progressPercent = 0;
    state.value.executionLog = [];
    state.value.generatedCode = null;
    state.value.isCodeValid = null;
    state.value.validationErrors = [];
    state.value.codeAttempt = 0;
    state.value.outputs = null;
    state.value.meshStats = null;
    state.value.projects = [];
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    currentTaskId,
    currentDrawingId,
    currentProjectId,
    currentView,
    isLoading,
    isGenerating,
    error,
    constraints,
    currentStage,
    progressPercent,
    executionLog,
    generatedCode,
    isCodeValid,
    validationErrors,
    codeAttempt,
    outputs,
    meshStats,
    projects,

    // Derived state
    hasTaskData,
    hasProgressData,
    hasDeliverables,
    effectiveConstraints,
    currentProject,

    // Getters (functions)
    getProjectById,
    getExecutionLogById,

    // Mutations
    setCurrentTaskId,
    setCurrentDrawingId,
    setCurrentProjectId,
    setUIView,
    setLoading,
    setGenerating,
    setError,
    clearError,
    setConstraints,
    resetConstraints,
    setCurrentStage,
    setProgressPercent,
    addExecutionLogEntry,
    clearExecutionLog,
    setGeneratedCode,
    setCodeValidation,
    incrementCodeAttempt,
    resetCodeAttempt,
    setOutputs,
    setMeshStats,
    setProjects,
    addProject,
    removeProject,
    resetTaskState,
    resetAll,
  };
});
