import { StateGraph, END, CompiledStateGraph } from '@langchain/langgraph';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import {
  CadAgentStateAnnotation,
  CadAgentState,
  CadConstraints,
} from './cad-agent.state';
import { CadDbService } from './services/cad-db.service';
import {
  CadStorageService,
  CadFileFormat,
} from './services/cad-storage.service';
import {
  OpenCascadeExecutorService,
  OcctExecutionResult,
} from './services/opencascade-executor.service';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

const AGENT_SLUG = 'cad-agent';
const MAX_GENERATION_ATTEMPTS = 3;

/**
 * Create the CAD Agent graph
 *
 * Flow:
 * 1. Start → Initialize workflow
 * 2. Apply Constraints → Inject project constraints
 * 3. Generate Code → Generate OpenCASCADE.js code using LLM
 * 4. Validate Code → Validate TypeScript/JS code
 * 5. Execute CAD → Execute OpenCASCADE.js code via WASM
 * 6. Export Files → Export to STEP, STL, GLTF formats
 * 7. Handle Error → Handle errors
 */
// Using CompiledStateGraph with broad generics to avoid TS2589 type
// instantiation depth limit caused by deeply nested LangGraph generic types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CadAgentGraph = CompiledStateGraph<any, any, any>;

export async function createCadAgentGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  cadDbService: CadDbService,
  cadStorageService: CadStorageService,
  occtExecutor: OpenCascadeExecutorService,
): Promise<CadAgentGraph> {
  // Store execution result for use in export node
  let lastExecutionResult: OcctExecutionResult | null = null;
  // Node: Initialize workflow
  async function startNode(
    state: CadAgentState,
  ): Promise<Partial<CadAgentState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting CAD generation for: ${state.userMessage}`,
    );

    // Emit initial progress event
    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Prompt received',
      {
        type: 'progress',
        stage: 'prompt_received',
        progressPercent: 5,
      },
    );

    return {
      status: 'generating',
      startedAt: Date.now(),
      messages: [new HumanMessage(state.userMessage)],
    };
  }

  // Node: Apply constraints to enhance prompt
  async function applyConstraintsNode(
    state: CadAgentState,
  ): Promise<Partial<CadAgentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Applying constraints',
      {
        type: 'progress',
        stage: 'constraints_applied',
        progressPercent: 10,
      },
    );

    try {
      // Get effective constraints from DB or state
      let effectiveConstraints: CadConstraints;

      if (state.drawingId) {
        // Get constraints from database
        effectiveConstraints = await cadDbService.getEffectiveConstraints(
          state.drawingId,
        );

        // Log execution step
        await cadDbService.logStep({
          drawingId: state.drawingId,
          stepType: 'constraints_applied',
          message: 'Applied constraints from database',
          details: { constraints: effectiveConstraints },
        });
      } else {
        // Use constraints from state
        effectiveConstraints = state.constraints;
      }

      // Create enhanced prompt that includes constraints
      const constraintPrompt = buildConstraintPrompt(effectiveConstraints);
      const enhancedPrompt = `${state.userMessage}\n\n${constraintPrompt}`;

      return {
        constraints: effectiveConstraints,
        userMessage: enhancedPrompt,
        messages: [
          ...state.messages,
          new AIMessage(
            `Applied constraints: ${JSON.stringify(effectiveConstraints, null, 2)}`,
          ),
        ],
      };
    } catch (error) {
      return {
        error: `Failed to apply constraints: ${error instanceof Error ? error.message : String(error)}`,
        status: 'failed',
      };
    }
  }

  // Node: Generate OpenCASCADE.js code using LLM
  async function generateCodeNode(
    state: CadAgentState,
  ): Promise<Partial<CadAgentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Generating OpenCASCADE.js code',
      { type: 'progress', stage: 'llm_started', progressPercent: 30 },
    );

    // Log LLM start
    if (state.drawingId) {
      await cadDbService.logStep({
        drawingId: state.drawingId,
        stepType: 'llm_started',
        message: 'Starting LLM code generation',
      });
    }

    // Build system prompt for OpenCASCADE.js code generation
    const systemPrompt = buildOpenCascadeSystemPrompt(state.constraints);

    try {
      // Call LLM via llmClient.callLLM() with ExecutionContext
      const llmResponse = await llmClient.callLLM({
        context: ctx, // Full ExecutionContext
        systemMessage: systemPrompt,
        userMessage: state.userMessage,
        temperature: 0.7,
        maxTokens: 4000,
        callerName: `${AGENT_SLUG}:generate-code`,
      });

      // Extract code from response
      const generatedCode = extractCodeFromResponse(llmResponse.text);

      // Save generated code to DB
      if (state.drawingId) {
        await cadDbService.saveGeneratedCode({
          drawingId: state.drawingId,
          code: generatedCode,
          codeType: 'opencascade-js',
          llmProvider: ctx.provider,
          llmModel: ctx.model,
          promptTokens: llmResponse.usage?.promptTokens,
          completionTokens: llmResponse.usage?.completionTokens,
          attemptNumber: state.codeAttempt + 1,
        });

        // Log LLM completion
        await cadDbService.logStep({
          drawingId: state.drawingId,
          stepType: 'llm_completed',
          message: 'LLM code generation completed',
          details: {
            codeLength: generatedCode.length,
            promptTokens: llmResponse.usage?.promptTokens,
            completionTokens: llmResponse.usage?.completionTokens,
            cost: llmResponse.usage?.cost,
          },
        });
      }

      // Emit LLM completed progress event
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'LLM code generation completed',
        {
          type: 'progress',
          stage: 'llm_completed',
          progressPercent: 40,
        },
      );

      return {
        generatedCode,
        codeAttempt: state.codeAttempt + 1,
        status: 'validating',
        messages: [
          ...state.messages,
          new AIMessage(
            `Generated OpenCASCADE.js code (${generatedCode.length} chars)`,
          ),
        ],
      };
    } catch (error) {
      return {
        error: `Failed to generate code: ${error instanceof Error ? error.message : String(error)}`,
        status: 'failed',
      };
    }
  }

  // Node: Validate TypeScript/JS code
  async function validateCodeNode(
    state: CadAgentState,
  ): Promise<Partial<CadAgentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Validating code',
      {
        type: 'progress',
        stage: 'code_validation',
        progressPercent: 50,
      },
    );

    if (!state.generatedCode) {
      return {
        error: 'No code to validate',
        status: 'failed',
      };
    }

    // Check for basic syntax and required OpenCASCADE patterns
    const validationErrors = validateOpenCascadeCode(state.generatedCode);
    const isValid = validationErrors.length === 0;

    // Update code validation in DB
    if (state.drawingId) {
      const latestCode = await cadDbService.getLatestCode(state.drawingId);
      if (latestCode) {
        await cadDbService.updateCodeValidation(
          latestCode.id,
          isValid,
          validationErrors,
        );
      }

      // Log validation result
      await cadDbService.logStep({
        drawingId: state.drawingId,
        stepType: 'code_validation',
        message: isValid ? 'Code validation passed' : 'Code validation failed',
        details: {
          isValid,
          validationErrors,
          attempt: state.codeAttempt,
        },
      });
    }

    return {
      isCodeValid: isValid,
      validationErrors,
      status: isValid ? 'executing' : 'validating',
      executionStatus: isValid ? 'executing' : 'pending',
      messages: [
        ...state.messages,
        new AIMessage(
          isValid
            ? 'Code validation passed'
            : `Code validation failed: ${validationErrors.join(', ')}`,
        ),
      ],
    };
  }

  // Node: Execute OpenCASCADE.js code using WASM executor
  async function executeCadNode(
    state: CadAgentState,
  ): Promise<Partial<CadAgentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Executing CAD code',
      {
        type: 'progress',
        stage: 'execution_started',
        progressPercent: 70,
      },
    );

    // Log execution start
    if (state.drawingId) {
      await cadDbService.logStep({
        drawingId: state.drawingId,
        stepType: 'execution_started',
        message: 'Starting OpenCASCADE.js WASM code execution',
      });
    }

    try {
      if (!state.generatedCode) {
        throw new Error('No generated code to execute');
      }

      // Execute code using OpenCASCADE.js WASM
      const executionResult = await occtExecutor.executeCode(
        state.generatedCode,
      );

      if (!executionResult.success) {
        throw new Error(
          executionResult.error || 'OpenCASCADE execution failed',
        );
      }

      // Store result for export node
      lastExecutionResult = executionResult;

      // Log execution completion
      if (state.drawingId) {
        await cadDbService.logStep({
          drawingId: state.drawingId,
          stepType: 'execution_completed',
          message: 'OpenCASCADE.js code execution completed successfully',
          details: {
            executionTimeMs: executionResult.executionTimeMs,
            meshStats: executionResult.meshStats,
          },
        });
      }

      // Emit execution completed progress event
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'CAD execution completed',
        {
          type: 'progress',
          stage: 'execution_completed',
          progressPercent: 85,
        },
      );

      return {
        executionStatus: 'completed',
        executionTimeMs: executionResult.executionTimeMs,
        meshStats: executionResult.meshStats,
        status: 'exporting',
        messages: [
          ...state.messages,
          new AIMessage(
            `CAD code execution completed in ${executionResult.executionTimeMs}ms - ` +
              `vertices: ${executionResult.meshStats?.vertices || 0}, ` +
              `faces: ${executionResult.meshStats?.faces || 0}`,
          ),
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Log the generated code for debugging
      console.error('[CAD-EXEC] Execution failed. Generated code was:');
      console.error('--- START GENERATED CODE ---');
      console.error(state.generatedCode);
      console.error('--- END GENERATED CODE ---');
      console.error('[CAD-EXEC] Error:', errorMessage);

      // Log execution failure
      if (state.drawingId) {
        await cadDbService.logStep({
          drawingId: state.drawingId,
          stepType: 'execution_failed',
          message: `OpenCASCADE.js execution failed: ${errorMessage}`,
          details: {
            generatedCode: state.generatedCode?.substring(0, 1000), // First 1000 chars
          },
        });
      }

      return {
        executionStatus: 'failed',
        executionError: errorMessage,
        error: `CAD execution failed: ${errorMessage}`,
        status: 'failed',
      };
    }
  }

  // Node: Export to multiple formats
  async function exportFilesNode(
    state: CadAgentState,
  ): Promise<Partial<CadAgentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Exporting files',
      {
        type: 'progress',
        stage: 'export_completed',
        progressPercent: 90,
      },
    );

    try {
      // Get project ID from state or database
      let projectId = state.projectId;
      if (!projectId && state.drawingId) {
        const drawing = await cadDbService.getDrawing(state.drawingId);
        projectId = drawing?.project_id;
      }

      if (!projectId || !state.drawingId) {
        throw new Error('Missing projectId or drawingId for file export');
      }

      // Use execution result if available, otherwise fall back to placeholders
      const hasRealExecution =
        lastExecutionResult?.success &&
        lastExecutionResult.stepContent &&
        lastExecutionResult.stlContent &&
        lastExecutionResult.gltfContent;

      let stepContent: Buffer;
      let stlContent: Buffer;
      let gltfContent: Buffer;
      let dxfContent: Buffer;
      let thumbnailContent: Buffer;
      let meshStats = state.meshStats;

      if (hasRealExecution && lastExecutionResult) {
        // Use real execution results
        stepContent = Buffer.from(lastExecutionResult.stepContent!, 'utf-8');
        stlContent = Buffer.from(lastExecutionResult.stlContent!, 'utf-8');
        gltfContent = lastExecutionResult.gltfContent!;
        dxfContent = Buffer.from(lastExecutionResult.dxfContent || '', 'utf-8');
        thumbnailContent =
          lastExecutionResult.thumbnailContent || Buffer.alloc(0);
        meshStats = lastExecutionResult.meshStats;
      } else {
        // Fall back to placeholders (for testing or if execution failed)
        const generatedCode = state.generatedCode || '// No code generated';
        stepContent = Buffer.from(
          generatePlaceholderStep(state.userMessage, generatedCode),
          'utf-8',
        );
        stlContent = Buffer.from(
          generatePlaceholderStl(state.userMessage),
          'utf-8',
        );
        gltfContent = Buffer.from(
          generatePlaceholderGltf(state.userMessage),
          'utf-8',
        );
        dxfContent = Buffer.from(
          generatePlaceholderDxf(state.userMessage),
          'utf-8',
        );
        thumbnailContent = Buffer.from(generatePlaceholderThumbnail(), 'utf-8');
        meshStats = {
          vertices: 8,
          faces: 12,
          boundingBox: {
            min: { x: -5, y: -5, z: -5 },
            max: { x: 5, y: 5, z: 5 },
          },
        };
      }

      // Upload files to Supabase Storage
      const outputs: Record<string, string> = {};
      const fileContents: Record<CadFileFormat, Buffer> = {
        step: stepContent,
        stl: stlContent,
        gltf: gltfContent,
        dxf: dxfContent,
        thumbnail: thumbnailContent,
      };

      const formats: CadFileFormat[] = [
        'step',
        'stl',
        'gltf',
        'dxf',
        'thumbnail',
      ];

      for (const format of formats) {
        const fileContent = fileContents[format];
        if (fileContent.length === 0) continue;

        // Upload to storage
        const storageResult = await cadStorageService.storeFile(
          fileContent,
          ctx,
          projectId,
          state.drawingId,
          format,
        );

        outputs[format] = storageResult.publicUrl;

        // Save metadata to database
        await cadDbService.saveCadOutput({
          drawingId: state.drawingId,
          format,
          storagePath: storageResult.storagePath,
          fileSizeBytes: storageResult.sizeBytes,
          meshStats:
            format === 'gltf'
              ? (meshStats as unknown as Record<string, unknown>)
              : undefined,
        });
      }

      // Log export completion
      await cadDbService.logStep({
        drawingId: state.drawingId,
        stepType: 'export_completed',
        message: hasRealExecution
          ? 'File export completed with real OpenCASCADE geometry'
          : 'File export completed with placeholder geometry',
        details: { outputs, hasRealExecution },
      });

      // Update drawing status to completed
      await cadDbService.completeDrawing(state.drawingId);

      const duration = Date.now() - state.startedAt;

      // Emit final progress event at 100%
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Generation complete',
        {
          type: 'progress',
          stage: 'export_completed',
          progressPercent: 100,
        },
      );

      // Emit completed event with type for frontend handler
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Workflow completed',
        {
          type: 'completed',
          outputs,
          duration,
        },
      );

      await observability.emitCompleted(
        ctx,
        ctx.conversationId,
        { outputs },
        duration,
      );

      // Clear execution result after export
      lastExecutionResult = null;

      return {
        outputs: {
          step: outputs.step,
          stl: outputs.stl,
          gltf: outputs.gltf,
          dxf: outputs.dxf,
          thumbnail: outputs.thumbnail,
        },
        meshStats,
        status: 'completed',
        completedAt: Date.now(),
        messages: [
          ...state.messages,
          new AIMessage(
            hasRealExecution
              ? `Files exported successfully: STEP, STL, GLTF, DXF, Thumbnail (vertices: ${meshStats?.vertices}, faces: ${meshStats?.faces})`
              : `Files exported successfully (placeholder geometry): STEP, STL, GLTF, DXF, Thumbnail`,
          ),
        ],
      };
    } catch (error) {
      return {
        error: `Failed to export files: ${error instanceof Error ? error.message : String(error)}`,
        status: 'failed',
      };
    }
  }

  // Node: Handle errors
  async function handleErrorNode(
    state: CadAgentState,
  ): Promise<Partial<CadAgentState>> {
    const ctx = state.executionContext;

    const duration = Date.now() - state.startedAt;

    // Emit failed event with type for frontend handler
    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Workflow failed',
      {
        type: 'failed',
        error: state.error || 'Unknown error',
        duration,
      },
    );

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error || 'Unknown error',
      duration,
    );

    // Update drawing status to failed
    if (state.drawingId) {
      await cadDbService.updateDrawingStatus(
        state.drawingId,
        'failed',
        state.error,
      );
    }

    return {
      status: 'failed',
      completedAt: Date.now(),
    };
  }

  // Build the graph
  const graph = new StateGraph(CadAgentStateAnnotation)
    .addNode('start', startNode)
    .addNode('apply_constraints', applyConstraintsNode)
    .addNode('generate_code', generateCodeNode)
    .addNode('validate_code', validateCodeNode)
    .addNode('execute_cad', executeCadNode)
    .addNode('export_files', exportFilesNode)
    .addNode('handle_error', handleErrorNode)
    // Edges
    .addEdge('__start__', 'start')
    .addEdge('start', 'apply_constraints')
    .addConditionalEdges('apply_constraints', (state) => {
      if (state.error) return 'handle_error';
      return 'generate_code';
    })
    .addConditionalEdges('generate_code', (state) => {
      if (state.error) return 'handle_error';
      return 'validate_code';
    })
    .addConditionalEdges('validate_code', (state) => {
      // If code is invalid
      if (!state.isCodeValid) {
        // If we've hit max attempts, give up
        if (state.codeAttempt >= MAX_GENERATION_ATTEMPTS) {
          return 'handle_error';
        }
        // Otherwise, retry generation
        return 'generate_code';
      }
      // Code is valid, proceed to execution
      return 'execute_cad';
    })
    .addConditionalEdges('execute_cad', (state) => {
      if (state.error || state.executionStatus === 'failed') {
        return 'handle_error';
      }
      return 'export_files';
    })
    .addEdge('export_files', END)
    .addEdge('handle_error', END);

  // Compile with checkpointer.
  // Cast to CadAgentGraph (CompiledStateGraph<any,any,any>) to avoid TS2589
  // type instantiation depth limit from deeply chained LangGraph builder types.
  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as CadAgentGraph;
  return compiled;
}

/**
 * Build constraint prompt from CAD constraints
 */
function buildConstraintPrompt(constraints: CadConstraints): string {
  const parts: string[] = [];

  if (constraints.units) {
    parts.push(`Units: ${constraints.units}`);
  }

  if (constraints.material) {
    parts.push(`Material: ${constraints.material}`);
  }

  if (constraints.manufacturing_method) {
    parts.push(`Manufacturing Method: ${constraints.manufacturing_method}`);
  }

  if (constraints.tolerance_class) {
    parts.push(`Tolerance Class: ${constraints.tolerance_class}`);
  }

  if (constraints.wall_thickness_min !== undefined) {
    parts.push(`Minimum Wall Thickness: ${constraints.wall_thickness_min}`);
  }

  if (parts.length === 0) {
    return 'Design Constraints: None specified';
  }

  return `Design Constraints:\n${parts.map((p) => `- ${p}`).join('\n')}`;
}

/**
 * Build OpenCASCADE.js system prompt with API hints
 */
function buildOpenCascadeSystemPrompt(constraints: CadConstraints): string {
  return `You are an expert CAD engineer specializing in OpenCASCADE.js.

Your task is to generate **plain JavaScript** code using the OpenCASCADE.js library to create 3D CAD models.

**CRITICAL RULES - FOLLOW EXACTLY:**
1. Code must be plain JavaScript - NO TypeScript syntax!
2. NO type annotations, NO import/export statements
3. ONLY use the EXACT class names from this whitelist - do NOT invent ANY class names!
4. ALWAYS call .Shape() on shape builders to get the actual shape

**WHITELIST OF VALID CLASSES - ONLY USE THESE:**
Primitives: BRepPrimAPI_MakeBox_2, BRepPrimAPI_MakeCylinder_1, BRepPrimAPI_MakeSphere_5, BRepPrimAPI_MakeCone_1, BRepPrimAPI_MakeTorus_1
Booleans: BRepAlgoAPI_Cut_3, BRepAlgoAPI_Fuse_3, BRepAlgoAPI_Common_3
Transform: gp_Trsf_1, gp_Vec_4, gp_Pnt_3, gp_Dir_4, gp_Ax1_2, BRepBuilderAPI_Transform_2
Fillet/Chamfer: BRepFilletAPI_MakeFillet, BRepFilletAPI_MakeChamfer
Explorer: TopExp_Explorer_1 (then call .Init())
Utilities: Message_ProgressRange_1, TopoDS.Edge_1, TopoDS.Face_1
Enums: TopAbs_ShapeEnum.TopAbs_EDGE, TopAbs_ShapeEnum.TopAbs_FACE, TopAbs_ShapeEnum.TopAbs_SHAPE, ChFi3d_FilletShape.ChFi3d_Rational

**DO NOT USE** any class not in the whitelist above! Common mistakes to avoid:
- TopExp_Explorer_2 does NOT exist as a constructor - use TopExp_Explorer_1() then call .Init(shape, toFind, toAvoid)
- TopExp_Explorer_3 does NOT exist
- TopoDS_Shape_1 does NOT exist - shapes are returned by .Shape() method
- BRepFilletAPI_MakeFillet2d does NOT exist - use BRepFilletAPI_MakeFillet

**OpenCASCADE.js API - EXACT PATTERNS TO USE:**

PRIMITIVES - Create shapes using these exact constructors:
\`\`\`javascript
// Box: BRepPrimAPI_MakeBox_2(dx, dy, dz)
const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();

// Sphere at center point: BRepPrimAPI_MakeSphere_5(center, radius)
const center = new oc.gp_Pnt_3(5, 5, 5);
const sphere = new oc.BRepPrimAPI_MakeSphere_5(center, 3).Shape();

// Cylinder: BRepPrimAPI_MakeCylinder_1(radius, height)
const cylinder = new oc.BRepPrimAPI_MakeCylinder_1(2, 10).Shape();

// Cone: BRepPrimAPI_MakeCone_1(r1, r2, height)
const cone = new oc.BRepPrimAPI_MakeCone_1(5, 2, 10).Shape();

// Torus: BRepPrimAPI_MakeTorus_1(majorRadius, minorRadius)
const torus = new oc.BRepPrimAPI_MakeTorus_1(10, 2).Shape();
\`\`\`

BOOLEAN OPERATIONS - Combine shapes:
\`\`\`javascript
// Cut (subtract shape2 from shape1)
const cut = new oc.BRepAlgoAPI_Cut_3(shape1, shape2, new oc.Message_ProgressRange_1());
cut.Build(new oc.Message_ProgressRange_1());
const cutResult = cut.Shape();

// Fuse (union/add shapes together)
const fuse = new oc.BRepAlgoAPI_Fuse_3(shape1, shape2, new oc.Message_ProgressRange_1());
fuse.Build(new oc.Message_ProgressRange_1());
const fuseResult = fuse.Shape();

// Common (intersection of two shapes)
const common = new oc.BRepAlgoAPI_Common_3(shape1, shape2, new oc.Message_ProgressRange_1());
common.Build(new oc.Message_ProgressRange_1());
const commonResult = common.Shape();
\`\`\`

TRANSFORMATIONS - Move/rotate shapes:
\`\`\`javascript
// Create transformation
const transform = new oc.gp_Trsf_1();

// Translate (move)
const translation = new oc.gp_Vec_4(dx, dy, dz);
transform.SetTranslation_1(translation);

// Apply transformation to shape
const transformed = new oc.BRepBuilderAPI_Transform_2(shape, transform, true).Shape();

// Rotation around an axis
const rotTransform = new oc.gp_Trsf_1();
const axis = new oc.gp_Ax1_2(
  new oc.gp_Pnt_3(0, 0, 0),  // Point on axis
  new oc.gp_Dir_4(0, 0, 1)   // Direction of axis (Z-axis)
);
rotTransform.SetRotation_1(axis, Math.PI / 4);  // 45 degrees
const rotated = new oc.BRepBuilderAPI_Transform_2(shape, rotTransform, true).Shape();
\`\`\`

FILLETS (Rounded Edges) - Add rounded edges to shapes:
\`\`\`javascript
// Create fillet maker with shape and fillet type
// ChFi3d_Rational is standard fillet shape
const filletMaker = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);

// Iterate through edges using TopExp_Explorer_1 with Init()
const explorer = new oc.TopExp_Explorer_1();
explorer.Init(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
while (explorer.More()) {
  const edge = oc.TopoDS.Edge_1(explorer.Current());
  filletMaker.Add_2(2.0, edge);  // 2.0 is the fillet radius
  explorer.Next();
}

// Build and get the filleted shape
filletMaker.Build(new oc.Message_ProgressRange_1());
const filletedShape = filletMaker.Shape();
\`\`\`

CHAMFERS (Beveled Edges) - Add chamfered/beveled edges to EDGES (NOT faces!):
\`\`\`javascript
// Create chamfer maker
const chamferMaker = new oc.BRepFilletAPI_MakeChamfer(shape);

// Add chamfer to specific EDGES using TopExp_Explorer_1 with Init()
const explorer = new oc.TopExp_Explorer_1();
explorer.Init(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
while (explorer.More()) {
  const edge = oc.TopoDS.Edge_1(explorer.Current());
  chamferMaker.Add_2(1.5, edge);  // 1.5 is the chamfer distance
  explorer.Next();
}

// Build and get the chamfered shape
chamferMaker.Build(new oc.Message_ProgressRange_1());
const chamferedShape = chamferMaker.Shape();
\`\`\`

**CRITICAL FILLET/CHAMFER WARNINGS:**
- Chamfers are added to EDGES, not faces! Never pass a face to chamferMaker.Add_2()
- Do NOT apply BOTH fillets AND chamfers to ALL edges - this will cause geometry failures
- Fillet radius MUST be less than half the shortest adjacent edge length
- Use small radii (1-3mm) to avoid failures on complex geometry
- If you need both fillets and chamfers, apply them to DIFFERENT edges
- For complex parts, skip fillets/chamfers entirely or apply to only a few specific edges

ITERATING EDGES/FACES - Access sub-shapes:
\`\`\`javascript
// Explore edges of a shape - use TopExp_Explorer_1() then Init()
const edgeExplorer = new oc.TopExp_Explorer_1();
edgeExplorer.Init(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
const edges = [];
while (edgeExplorer.More()) {
  edges.push(oc.TopoDS.Edge_1(edgeExplorer.Current()));
  edgeExplorer.Next();
}

// Explore faces of a shape - use TopExp_Explorer_1() then Init()
const faceExplorer = new oc.TopExp_Explorer_1();
faceExplorer.Init(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
const faces = [];
while (faceExplorer.More()) {
  faces.push(oc.TopoDS.Face_1(faceExplorer.Current()));
  faceExplorer.Next();
}
\`\`\`

**Code Requirements:**

1. Define a function called "createModel" that takes "oc" as its only parameter
2. The function must return the final shape
3. Use ONLY the exact API patterns shown above
4. Add comments explaining each step
5. NO TypeScript - plain JavaScript only

Constraints to follow:
${buildConstraintPrompt(constraints)}

**Complete Example - Box with Hole (Simple, Robust):**

\`\`\`javascript
// Main function to create the CAD model
function createModel(oc) {
  // Step 1: Create a box 20x20x10
  const box = new oc.BRepPrimAPI_MakeBox_2(20, 20, 10).Shape();

  // Step 2: Create a cylinder at center for the hole
  const cylinder = new oc.BRepPrimAPI_MakeCylinder_1(5, 15).Shape();

  // Step 3: Move cylinder to center of box
  const transform = new oc.gp_Trsf_1();
  const translation = new oc.gp_Vec_4(10, 10, 0);
  transform.SetTranslation_1(translation);
  const movedCylinder = new oc.BRepBuilderAPI_Transform_2(cylinder, transform, true).Shape();

  // Step 4: Boolean cut to create the hole
  const cut = new oc.BRepAlgoAPI_Cut_3(box, movedCylinder, new oc.Message_ProgressRange_1());
  cut.Build(new oc.Message_ProgressRange_1());
  const result = cut.Shape();

  // Return the final shape (no fillets to keep it simple and robust)
  return result;
}
\`\`\`

**IMPORTANT DESIGN GUIDELINES - MUST FOLLOW:**
1. Start with basic shapes and boolean operations - these are most reliable
2. **NEVER** add fillets or chamfers if the model has ANY boolean cut operations (holes, subtractions). Fillets on cut geometry WILL crash the WASM runtime with an unrecoverable exception.
3. Only add fillets/chamfers to extremely simple shapes (single box, single cylinder) with NO boolean operations
4. For brackets, enclosures, or any part with holes: return the shape WITHOUT fillets/chamfers
5. Never apply both fillets AND chamfers to the same shape
6. When in doubt, skip fillets entirely - a sharp-edged model is infinitely better than a crashed execution

Generate clean JavaScript code that creates the requested CAD model using ONLY the API patterns shown above.`;
}

/**
 * Extract code from LLM response (handles markdown code blocks)
 */
function extractCodeFromResponse(response: string): string {
  // Try to extract code from markdown code blocks
  const codeBlockMatch = response.match(
    /```(?:typescript|javascript|ts|js)?\n([\s\S]*?)\n```/,
  );

  if (codeBlockMatch) {
    return codeBlockMatch[1]!.trim();
  }

  // If no code block found, return the whole response
  return response.trim();
}

/**
 * Whitelist of valid OpenCASCADE.js class names
 * These are the ONLY classes that exist in the WASM build
 */
const VALID_OC_CLASSES = new Set([
  // Primitives
  'BRepPrimAPI_MakeBox_2',
  'BRepPrimAPI_MakeCylinder_1',
  'BRepPrimAPI_MakeSphere_5',
  'BRepPrimAPI_MakeCone_1',
  'BRepPrimAPI_MakeTorus_1',
  // Booleans
  'BRepAlgoAPI_Cut_3',
  'BRepAlgoAPI_Fuse_3',
  'BRepAlgoAPI_Common_3',
  // Transform
  'gp_Trsf_1',
  'gp_Vec_4',
  'gp_Pnt_3',
  'gp_Dir_4',
  'gp_Ax1_2',
  'BRepBuilderAPI_Transform_2',
  // Fillet/Chamfer
  'BRepFilletAPI_MakeFillet',
  'BRepFilletAPI_MakeChamfer',
  // Explorer - use TopExp_Explorer_1() then call .Init()
  'TopExp_Explorer_1',
  // Utilities
  'Message_ProgressRange_1',
  // Static methods (accessed via oc.TopoDS.Edge_1, etc.)
  'TopoDS',
  // Enums (accessed via oc.TopAbs_ShapeEnum.TopAbs_EDGE, etc.)
  'TopAbs_ShapeEnum',
  'ChFi3d_FilletShape',
]);

/**
 * Known INVALID class names that LLMs commonly generate
 * Map from invalid -> suggested valid alternative
 */
const INVALID_CLASS_FIXES: Record<string, string> = {
  TopExp_Explorer_2:
    'TopExp_Explorer_1() then call .Init(shape, toFind, toAvoid)',
  TopExp_Explorer_3:
    'TopExp_Explorer_1() then call .Init(shape, toFind, toAvoid)',
  TopoDS_Shape_1:
    'shapes are returned by .Shape() method, not constructed directly',
  TopoDS_Shape:
    'shapes are returned by .Shape() method, not constructed directly',
  BRepFilletAPI_MakeFillet2d: 'BRepFilletAPI_MakeFillet',
  BRepFilletAPI_MakeFillet2d_1: 'BRepFilletAPI_MakeFillet',
  BRepFilletAPI_MakeFillet2d_2: 'BRepFilletAPI_MakeFillet',
  gp_Pnt_1: 'gp_Pnt_3',
  gp_Pnt_2: 'gp_Pnt_3',
  gp_Vec_1: 'gp_Vec_4',
  gp_Vec_2: 'gp_Vec_4',
  gp_Vec_3: 'gp_Vec_4',
  BRepPrimAPI_MakeBox_1: 'BRepPrimAPI_MakeBox_2',
  BRepPrimAPI_MakeBox_3: 'BRepPrimAPI_MakeBox_2',
};

/**
 * Validate OpenCASCADE.js code for basic syntax and required patterns
 */
function validateOpenCascadeCode(code: string): string[] {
  const errors: string[] = [];

  // Check for basic patterns that should be present
  if (!code.includes('oc.') && !code.includes('new oc.')) {
    errors.push(
      "Code does not appear to use OpenCASCADE.js API (missing 'oc.' references)",
    );
  }

  // Check for common shape creation patterns
  const hasShapeCreation =
    code.includes('MakeBox') ||
    code.includes('MakeCylinder') ||
    code.includes('MakeSphere') ||
    code.includes('MakeCone') ||
    code.includes('MakePrism') ||
    code.includes('MakeTorus');

  if (!hasShapeCreation) {
    errors.push(
      'Code does not appear to create any shapes (missing MakeBox, MakeCylinder, etc.)',
    );
  }

  // Check for function or export structure
  const hasFunction =
    code.includes('function') || code.includes('export') || code.includes('=>');

  if (!hasFunction) {
    errors.push('Code should define a function or export structure');
  }

  // Check for basic syntax errors (very simple check)
  const openBraces = (code.match(/{/g) || []).length;
  const closeBraces = (code.match(/}/g) || []).length;

  if (openBraces !== closeBraces) {
    errors.push('Mismatched curly braces');
  }

  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;

  if (openParens !== closeParens) {
    errors.push('Mismatched parentheses');
  }

  // Check for INVALID class names that don't exist in OpenCASCADE.js WASM
  // This catches common LLM mistakes BEFORE execution
  for (const [invalidClass, fix] of Object.entries(INVALID_CLASS_FIXES)) {
    if (code.includes(invalidClass)) {
      errors.push(
        `INVALID CLASS: "${invalidClass}" does not exist. Use ${fix} instead.`,
      );
    }
  }

  // Also check for any oc.ClassName pattern that's not in our whitelist
  const classUsagePattern = /oc\.([A-Za-z_][A-Za-z0-9_]*)/g;
  const usedClasses = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = classUsagePattern.exec(code)) !== null) {
    usedClasses.add(match[1]!);
  }

  for (const usedClass of usedClasses) {
    // Skip enum/static property access (like TopAbs_ShapeEnum.TopAbs_EDGE)
    if (
      usedClass.startsWith('TopAbs_') ||
      usedClass.startsWith('ChFi3d_') ||
      usedClass === 'TopoDS'
    ) {
      continue;
    }
    // Check if it's in our whitelist
    if (!VALID_OC_CLASSES.has(usedClass)) {
      // Check if it's a known invalid class with a fix
      if (INVALID_CLASS_FIXES[usedClass]) {
        // Already handled above
        continue;
      }
      errors.push(
        `UNKNOWN CLASS: "oc.${usedClass}" is not in the valid class whitelist. Only use classes from the whitelist in the prompt.`,
      );
    }
  }

  return errors;
}

/**
 * Generate a placeholder STEP file content
 * STEP files are ISO 10303 format for CAD data exchange
 * This generates a minimal valid STEP file with a placeholder cube
 */
function generatePlaceholderStep(prompt: string, code: string): string {
  const timestamp = new Date().toISOString();
  return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('CAD Agent Generated Model - Placeholder'), '2;1');
FILE_NAME('model.step', '${timestamp}', ('CAD Agent'), ('Orchestrator AI'), '', 'OpenCASCADE', '');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
/* Placeholder STEP content for: ${prompt.replace(/'/g, "''")} */
/* Generated code: */
${code
  .split('\n')
  .map((line) => `/* ${line} */`)
  .join('\n')}
/* This is a placeholder file - actual geometry will be generated when OpenCASCADE.js execution is implemented */
#1 = SHAPE_DEFINITION_REPRESENTATION(#2,#10);
#2 = PRODUCT_DEFINITION_SHAPE('','',#3);
#3 = PRODUCT_DEFINITION('design','',#4,#9);
#4 = PRODUCT_DEFINITION_FORMATION('','',#5);
#5 = PRODUCT('Placeholder Model','Placeholder Model','',(#6));
#6 = MECHANICAL_CONTEXT('',#7,'mechanical');
#7 = APPLICATION_CONTEXT('automotive_design');
#8 = APPLICATION_PROTOCOL_DEFINITION('','automotive_design',2000,#7);
#9 = PRODUCT_DEFINITION_CONTEXT('part_definition',#7,'design');
#10 = ADVANCED_BREP_SHAPE_REPRESENTATION('Placeholder',(#11,#15),#46);
ENDSEC;
END-ISO-10303-21;`;
}

/**
 * Generate a placeholder STL file content
 * STL is a simple triangular mesh format
 * This generates an ASCII STL with a simple cube
 */
function generatePlaceholderStl(_prompt: string): string {
  return `solid PlaceholderCube
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 10 0 0
      vertex 10 10 0
    endloop
  endfacet
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 10 10 0
      vertex 0 10 0
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 10
      vertex 10 10 10
      vertex 10 0 10
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 10
      vertex 0 10 10
      vertex 10 10 10
    endloop
  endfacet
  facet normal 0 -1 0
    outer loop
      vertex 0 0 0
      vertex 10 0 10
      vertex 10 0 0
    endloop
  endfacet
  facet normal 0 -1 0
    outer loop
      vertex 0 0 0
      vertex 0 0 10
      vertex 10 0 10
    endloop
  endfacet
  facet normal 0 1 0
    outer loop
      vertex 0 10 0
      vertex 10 10 0
      vertex 10 10 10
    endloop
  endfacet
  facet normal 0 1 0
    outer loop
      vertex 0 10 0
      vertex 10 10 10
      vertex 0 10 10
    endloop
  endfacet
  facet normal -1 0 0
    outer loop
      vertex 0 0 0
      vertex 0 10 0
      vertex 0 10 10
    endloop
  endfacet
  facet normal -1 0 0
    outer loop
      vertex 0 0 0
      vertex 0 10 10
      vertex 0 0 10
    endloop
  endfacet
  facet normal 1 0 0
    outer loop
      vertex 10 0 0
      vertex 10 10 10
      vertex 10 10 0
    endloop
  endfacet
  facet normal 1 0 0
    outer loop
      vertex 10 0 0
      vertex 10 0 10
      vertex 10 10 10
    endloop
  endfacet
endsolid PlaceholderCube
`;
}

/**
 * Generate a placeholder GLTF file content
 * GLTF (GL Transmission Format) is a JSON-based 3D model format
 * This generates a minimal valid GLTF with a simple triangle
 */
function generatePlaceholderGltf(prompt: string): string {
  // Generate binary buffer data for a simple cube (8 vertices, 12 triangles)
  const cubeBufferData = generateCubeBufferData();

  const gltf = {
    asset: {
      version: '2.0',
      generator: 'CAD Agent - Orchestrator AI',
      extras: {
        prompt,
        placeholder: true,
        note: 'This is a placeholder cube - actual geometry will be generated when OpenCASCADE.js execution is implemented',
      },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        mesh: 0,
        name: 'PlaceholderCube',
      },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
            },
            indices: 1,
            mode: 4, // TRIANGLES
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: 8,
        type: 'VEC3',
        max: [5, 5, 5],
        min: [-5, -5, -5],
      },
      {
        bufferView: 1,
        componentType: 5123, // UNSIGNED_SHORT
        count: 36,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 96 }, // 8 vertices * 3 floats * 4 bytes
      { buffer: 0, byteOffset: 96, byteLength: 72 }, // 36 indices * 2 bytes
    ],
    buffers: [
      {
        uri: cubeBufferData.uri,
        byteLength: cubeBufferData.byteLength,
      },
    ],
  };

  return JSON.stringify(gltf, null, 2);
}

/**
 * Generate binary buffer data for a cube as base64 data URI
 */
function generateCubeBufferData(): { uri: string; byteLength: number } {
  // 8 vertices of a cube centered at origin with size 10 (-5 to 5)
  const vertices = new Float32Array([
    -5,
    -5,
    -5, // 0: back-bottom-left
    5,
    -5,
    -5, // 1: back-bottom-right
    5,
    5,
    -5, // 2: back-top-right
    -5,
    5,
    -5, // 3: back-top-left
    -5,
    -5,
    5, // 4: front-bottom-left
    5,
    -5,
    5, // 5: front-bottom-right
    5,
    5,
    5, // 6: front-top-right
    -5,
    5,
    5, // 7: front-top-left
  ]);

  // 12 triangles (36 indices) for cube faces
  const indices = new Uint16Array([
    // Back face
    0, 2, 1, 0, 3, 2,
    // Front face
    4, 5, 6, 4, 6, 7,
    // Left face
    0, 4, 7, 0, 7, 3,
    // Right face
    1, 2, 6, 1, 6, 5,
    // Bottom face
    0, 1, 5, 0, 5, 4,
    // Top face
    3, 7, 6, 3, 6, 2,
  ]);

  // Combine into single buffer
  const vertexBytes = new Uint8Array(vertices.buffer);
  const indexBytes = new Uint8Array(indices.buffer);

  const totalLength = vertexBytes.length + indexBytes.length;
  const combined = new Uint8Array(totalLength);
  combined.set(vertexBytes, 0);
  combined.set(indexBytes, vertexBytes.length);

  // Convert to base64
  const base64 = Buffer.from(combined).toString('base64');

  return {
    uri: `data:application/octet-stream;base64,${base64}`,
    byteLength: totalLength,
  };
}

/**
 * Generate a placeholder DXF file content
 * DXF (Drawing eXchange Format) is a 2D CAD format
 * This generates a minimal valid DXF with a simple cube projection
 */
function generatePlaceholderDxf(prompt: string): string {
  const lines: string[] = [];

  // DXF Header section
  lines.push('0', 'SECTION');
  lines.push('2', 'HEADER');
  lines.push('9', '$ACADVER');
  lines.push('1', 'AC1014'); // AutoCAD R14 format
  lines.push('9', '$EXTMIN');
  lines.push('10', '-5');
  lines.push('20', '-5');
  lines.push('30', '-5');
  lines.push('9', '$EXTMAX');
  lines.push('10', '5');
  lines.push('20', '5');
  lines.push('30', '5');
  lines.push('0', 'ENDSEC');

  // Tables section (minimal)
  lines.push('0', 'SECTION');
  lines.push('2', 'TABLES');
  lines.push('0', 'TABLE');
  lines.push('2', 'LAYER');
  lines.push('70', '1');
  lines.push('0', 'LAYER');
  lines.push('2', '0'); // Layer name
  lines.push('70', '0'); // Layer flags
  lines.push('62', '7'); // Color (white)
  lines.push('6', 'CONTINUOUS'); // Linetype
  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // Entities section - draw a square (cube top-down view)
  lines.push('0', 'SECTION');
  lines.push('2', 'ENTITIES');

  // Add comment about placeholder
  lines.push('999', `Placeholder DXF for: ${prompt.slice(0, 100)}`);

  // Bottom edge
  lines.push(
    '0',
    'LINE',
    '8',
    '0',
    '10',
    '-5',
    '20',
    '-5',
    '30',
    '0',
    '11',
    '5',
    '21',
    '-5',
    '31',
    '0',
  );
  // Right edge
  lines.push(
    '0',
    'LINE',
    '8',
    '0',
    '10',
    '5',
    '20',
    '-5',
    '30',
    '0',
    '11',
    '5',
    '21',
    '5',
    '31',
    '0',
  );
  // Top edge
  lines.push(
    '0',
    'LINE',
    '8',
    '0',
    '10',
    '5',
    '20',
    '5',
    '30',
    '0',
    '11',
    '-5',
    '21',
    '5',
    '31',
    '0',
  );
  // Left edge
  lines.push(
    '0',
    'LINE',
    '8',
    '0',
    '10',
    '-5',
    '20',
    '5',
    '30',
    '0',
    '11',
    '-5',
    '21',
    '-5',
    '31',
    '0',
  );

  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  return lines.join('\n');
}

/**
 * Generate a placeholder thumbnail SVG
 * This creates a simple SVG showing a 3D box representation
 */
function generatePlaceholderThumbnail(): string {
  const width = 256;
  const height = 256;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>

  <!-- 3D Box representation -->
  <g transform="translate(128, 100)">
    <!-- Back face -->
    <polygon points="-40,-30 40,-30 60,-10 -20,-10" fill="#4a5568" stroke="#718096" stroke-width="1"/>
    <!-- Left face -->
    <polygon points="-40,-30 -20,-10 -20,40 -40,20" fill="#2d3748" stroke="#718096" stroke-width="1"/>
    <!-- Top face -->
    <polygon points="-40,-30 40,-30 20,-50 -60,-50" fill="#667eea" stroke="#7c3aed" stroke-width="1"/>
    <!-- Front face -->
    <polygon points="-20,-10 60,-10 60,40 -20,40" fill="#4c51bf" stroke="#718096" stroke-width="1"/>
    <!-- Right face -->
    <polygon points="60,-10 40,-30 40,20 60,40" fill="#5a67d8" stroke="#718096" stroke-width="1"/>
  </g>

  <!-- Stats text -->
  <text x="128" y="175" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#a0aec0">
    10.0 × 10.0 × 10.0
  </text>
  <text x="128" y="195" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#718096">
    8 vertices
  </text>
  <text x="128" y="210" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#718096">
    12 faces
  </text>

  <!-- CAD Agent badge -->
  <text x="128" y="240" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#4a5568">
    CAD Agent (Placeholder)
  </text>
</svg>`;
}
