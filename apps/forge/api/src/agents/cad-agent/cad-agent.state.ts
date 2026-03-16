import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * CAD constraints interface
 */
export interface CadConstraints {
  /** Units for the design (e.g., 'mm', 'in', 'cm') */
  units?: string;
  /** Material specification */
  material?: string;
  /** Manufacturing method (e.g., '3d-printing', 'cnc', 'casting') */
  manufacturing_method?: string;
  /** Tolerance class */
  tolerance_class?: string;
  /** Minimum wall thickness */
  wall_thickness_min?: number;
  /** Allow additional custom constraints */
  [key: string]: unknown;
}

/**
 * Mesh statistics for GLTF output
 */
export interface MeshStats {
  /** Number of vertices in the mesh */
  vertices: number;
  /** Number of faces in the mesh */
  faces: number;
  /** Bounding box dimensions */
  boundingBox?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

/**
 * Output file URLs
 */
export interface CadOutputs {
  /** STEP file URL */
  step?: string;
  /** STL file URL */
  stl?: string;
  /** GLTF file URL */
  gltf?: string;
  /** DXF file URL */
  dxf?: string;
  /** Thumbnail image URL */
  thumbnail?: string;
}

/**
 * CAD Agent input interface
 * Validation is handled by NestJS DTOs at the controller level
 *
 * Context flows through via ExecutionContext parameter.
 * Provider/model come from context.provider and context.model.
 */
export interface CadAgentInput {
  /** Execution context - contains orgSlug, userId, conversationId, taskId, provider, model, etc. */
  context: ExecutionContext;
  /** Natural language prompt describing the CAD model to generate */
  userMessage: string;
  /** Optional project ID for organization (if selecting existing project) */
  projectId?: string;
  /** Name for new project to create (if not selecting existing project) */
  newProjectName?: string;
  /** Design constraints */
  constraints?: CadConstraints;
}

/**
 * Result from CAD Agent execution
 */
export interface CadAgentResult {
  taskId: string;
  status: 'completed' | 'failed';
  userMessage: string;
  generatedCode?: string;
  outputs?: CadOutputs;
  meshStats?: MeshStats;
  error?: string;
  duration: number;
}

/**
 * Status response for checking thread state
 */
export interface CadAgentStatus {
  taskId: string;
  status: CadAgentState['status'];
  userMessage: string;
  executionStatus: CadAgentState['executionStatus'];
  isCodeValid?: boolean;
  outputs?: CadOutputs;
  error?: string;
}

/**
 * CAD Agent State Annotation
 *
 * Uses ExecutionContext for all identification and configuration.
 * No individual fields for taskId, userId, etc.
 */
export const CadAgentStateAnnotation = Annotation.Root({
  // Include message history from LangGraph
  ...MessagesAnnotation.spec,

  // ExecutionContext - the core context that flows through the system
  // Note: Default is a placeholder that MUST be overwritten when invoking the graph.
  // Runtime validation happens in graph nodes, not at state initialization.
  executionContext: Annotation<ExecutionContext>({
    reducer: (_, next) => next,
    default: () => ({
      orgSlug: '',
      userId: '',
      conversationId: '',
      agentSlug: '',
      agentType: '',
      provider: '',
      model: '',
    }),
  }),

  // Input fields
  userMessage: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  projectId: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  drawingId: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Constraints
  constraints: Annotation<CadConstraints>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // Code generation
  generatedCode: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  codeType: Annotation<string>({
    reducer: (_, next) => next,
    default: () => 'opencascade-js',
  }),

  isCodeValid: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  validationErrors: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  codeAttempt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // Execution
  executionStatus: Annotation<'pending' | 'executing' | 'completed' | 'failed'>(
    {
      reducer: (_, next) => next,
      default: () => 'pending',
    },
  ),

  executionError: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  executionTimeMs: Annotation<number | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Outputs
  outputs: Annotation<CadOutputs>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  meshStats: Annotation<MeshStats | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Workflow status
  status: Annotation<
    | 'pending'
    | 'generating'
    | 'validating'
    | 'executing'
    | 'exporting'
    | 'completed'
    | 'failed'
  >({
    reducer: (_, next) => next,
    default: () => 'pending',
  }),

  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Workflow metadata
  startedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),

  completedAt: Annotation<number | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type CadAgentState = typeof CadAgentStateAnnotation.State;
