/**
 * CAD Agent Types
 * Type definitions for the CAD Agent custom UI
 */

/**
 * CAD generation constraints
 */
export interface CadConstraints {
  units: 'mm' | 'inches';
  material: string;
  manufacturingMethod: string;
  toleranceClass: 'loose' | 'standard' | 'precision';
  wallThicknessMin?: number;
}

/**
 * Output formats for CAD generation
 */
export type CadOutputFormat = 'STEP' | 'STL' | 'GLTF' | 'DXF';

/**
 * CAD generation progress stages
 */
export type CadProgressStage =
  | 'prompt_received'
  | 'constraints_applied'
  | 'llm_started'
  | 'llm_completed'
  | 'code_validation'
  | 'execution_started'
  | 'execution_completed'
  | 'export_completed'
  | 'failed';

/**
 * Mesh statistics from generated model
 */
export interface MeshStats {
  vertices: number;
  faces: number;
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

/**
 * CAD generation deliverable
 */
export interface CadDeliverable {
  id: string;
  taskId: string;
  generatedCode: string;
  meshStats?: MeshStats;
  formats: {
    [key in CadOutputFormat]?: {
      url: string;
      size: number;
    };
  };
  createdAt: string;
}

/**
 * Progress log entry
 */
export interface ProgressLogEntry {
  timestamp: string;
  stage: CadProgressStage;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * CAD generation task state
 */
export interface CadTask {
  id: string;
  prompt: string;
  projectId?: string;
  constraints: CadConstraints;
  outputFormats: CadOutputFormat[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  currentStage: CadProgressStage;
  progressLogs: ProgressLogEntry[];
  generatedCode?: string;
  error?: string;
  deliverable?: CadDeliverable;
  createdAt: string;
  updatedAt: string;
}

/**
 * UI state for CAD Agent
 */
export interface CadAgentUIState {
  currentView: 'config' | 'progress' | 'deliverables';
}

/**
 * SSE event from CAD generation
 */
export interface CadSSEEvent {
  type: 'stage_update' | 'log' | 'code_generated' | 'deliverable_ready' | 'error';
  stage?: CadProgressStage;
  message?: string;
  code?: string;
  deliverable?: CadDeliverable;
  error?: string;
  timestamp: string;
}
