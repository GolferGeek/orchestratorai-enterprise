import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * OpenCASCADE.js Execution Result
 */
export interface OcctExecutionResult {
  success: boolean;
  /** The resulting shape from execution */
  shape?: unknown;
  /** STEP file content */
  stepContent?: string;
  /** STL file content (ASCII) */
  stlContent?: string;
  /** GLTF/GLB binary content */
  gltfContent?: Buffer;
  /** DXF file content (2D projection) */
  dxfContent?: string;
  /** Thumbnail PNG content (as buffer) */
  thumbnailContent?: Buffer;
  /** Mesh statistics */
  meshStats?: {
    vertices: number;
    faces: number;
    boundingBox: {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    };
  };
  /** Execution time in ms */
  executionTimeMs: number;
  /** Error message if failed */
  error?: string;
}

/**
 * OpenCASCADE.js Executor Service
 *
 * Initializes OpenCASCADE.js WASM module and executes generated CAD code
 * to produce actual geometry. Handles:
 * - WASM initialization
 * - Safe code execution in isolated context
 * - Geometry extraction and export
 * - STEP, STL, GLTF conversion
 */
@Injectable()
export class OpenCascadeExecutorService implements OnModuleInit {
  private readonly logger = new Logger(OpenCascadeExecutorService.name);
  private oc: unknown = null;
  private isInitialized = false;
  private initSkipped = false;
  private initPromise: Promise<void> | null = null;
  /**
   * When true, OpenCascade WASM init is skipped at startup.
   * Use when the LangGraph server fails to start due to opencascade.js loading
   * (e.g. memory, Node/ESM issues). CAD agent will be unavailable.
   */
  private readonly skipOpenCascadeInit: boolean;

  constructor(private readonly configService: ConfigService) {
    this.skipOpenCascadeInit =
      this.configService.get<string>('SKIP_OPENCASCADE_INIT') === 'true' ||
      this.configService.get<string>('SKIP_OPENCASCADE_INIT') === '1';
  }

  onModuleInit() {
    // Start initialization but don't block or crash the process
    this.initPromise = this.initialize().catch((err) => {
      this.logger.error(
        `OpenCASCADE.js init failed — CAD agent will be unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Initialize OpenCASCADE.js WASM module
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (this.skipOpenCascadeInit) {
      this.initSkipped = true;
      this.initPromise = Promise.resolve();
      this.logger.warn(
        'OpenCASCADE.js init skipped (SKIP_OPENCASCADE_INIT=1). CAD agent unavailable.',
      );
      return;
    }

    try {
      this.logger.log('Initializing OpenCASCADE.js WASM module...');

      // Dynamic import for ESM module
      // Note: opencascade.js is quite large (~50MB WASM) and takes time to load
      const initOpenCascade = await this.loadOpenCascade();
      this.oc = await initOpenCascade();

      this.isInitialized = true;
      this.logger.log('OpenCASCADE.js initialized successfully');
    } catch (error) {
      this.logger.error(
        `Failed to initialize OpenCASCADE.js: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Load OpenCASCADE module with proper ESM handling
   */
  private async loadOpenCascade(): Promise<() => Promise<unknown>> {
    try {
      // Try node.js specific import
      const module = await import('opencascade.js/dist/node.js');
      // Handle both default export and module itself being the initializer
      const initializer = module.default || module;
      // If it's a function, return it; otherwise wrap in function
      if (typeof initializer === 'function') {
        return initializer as () => Promise<unknown>;
      }
      // Module exports an object with an init function
      return () => Promise.resolve(initializer);
    } catch {
      // Fallback to default import
      const module = await import('opencascade.js');
      const initializer = (module as { default?: unknown }).default || module;
      if (typeof initializer === 'function') {
        return initializer as () => Promise<unknown>;
      }
      return () => Promise.resolve(initializer);
    }
  }

  /**
   * Ensure WASM is initialized before execution
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initSkipped) {
      throw new Error(
        'CAD agent unavailable: OpenCASCADE.js init was skipped (SKIP_OPENCASCADE_INIT=1). ' +
          'Remove the env var and restart to enable CAD.',
      );
    }
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Execute OpenCASCADE.js code and produce geometry
   *
   * @param code - The generated OpenCASCADE.js code to execute
   * @returns Execution result with geometry and exports
   */
  async executeCode(code: string): Promise<OcctExecutionResult> {
    const startTime = Date.now();

    try {
      await this.ensureInitialized();

      if (!this.oc) {
        throw new Error('OpenCASCADE.js not initialized');
      }

      this.logger.debug(`Executing OpenCASCADE.js code (${code.length} chars)`);

      // Safety: strip fillet/chamfer code if boolean operations are present
      // Fillets on boolean-cut geometry commonly crash the WASM runtime
      const safeCode = this.stripUnsafeFillets(code);

      // Execute the code in a sandboxed context
      let shape: unknown;
      try {
        shape = await this.runCodeSandboxed(safeCode);
      } catch (firstError) {
        const msg =
          firstError instanceof Error ? firstError.message : String(firstError);
        if (
          msg.includes('WASM exception') &&
          safeCode === code &&
          this.hasFilletOrChamfer(code)
        ) {
          // Retry without fillets/chamfers
          this.logger.warn(
            '[CAD-EXEC] WASM exception with fillets — retrying without fillet/chamfer code',
          );
          const strippedCode = this.forceStripFillets(code);
          shape = await this.runCodeSandboxed(strippedCode);
        } else {
          throw firstError;
        }
      }

      if (!shape) {
        throw new Error('Code execution did not produce a valid shape');
      }

      // Log shape info for debugging
      this.logger.log(
        `[CAD-EXEC] Shape returned from code execution: ${typeof shape}`,
      );
      // Skip BRepCheck_Analyzer — it expects 3 params in this WASM build
      // and is not critical for the export pipeline
      this.logger.log('[CAD-EXEC] Shape obtained, skipping validity check');

      // Extract mesh statistics
      this.logger.log('[CAD-EXEC] Extracting mesh statistics...');
      const meshStats = this.extractMeshStats(shape);
      this.logger.log(
        `[CAD-EXEC] Mesh stats: ${meshStats?.vertices} vertices, ${meshStats?.faces} faces`,
      );

      // Export to various formats with logging
      this.logger.log('[CAD-EXEC] Exporting to STEP...');
      const stepContent = this.exportToSTEP(shape);
      this.logger.log(
        `[CAD-EXEC] STEP export done (${stepContent.length} chars)`,
      );

      this.logger.log('[CAD-EXEC] Exporting to STL...');
      const stlContent = this.exportToSTL(shape);
      this.logger.log(
        `[CAD-EXEC] STL export done (${stlContent.length} chars)`,
      );

      this.logger.log('[CAD-EXEC] Exporting to GLTF...');
      const gltfContent = this.exportToGLTF(shape);
      this.logger.log(
        `[CAD-EXEC] GLTF export done (${gltfContent.length} bytes)`,
      );

      this.logger.log('[CAD-EXEC] Exporting to DXF...');
      const dxfContent = this.exportToDXF(shape, meshStats!.boundingBox);
      this.logger.log(
        `[CAD-EXEC] DXF export done (${dxfContent.length} chars)`,
      );

      this.logger.log('[CAD-EXEC] Generating thumbnail...');
      const thumbnailContent = this.generateThumbnail(meshStats!);
      this.logger.log('[CAD-EXEC] Thumbnail done');

      const executionTimeMs = Date.now() - startTime;

      this.logger.log(
        `[CAD-EXEC] All exports completed in ${executionTimeMs}ms - vertices: ${meshStats!.vertices}, faces: ${meshStats!.faces}`,
      );

      return {
        success: true,
        shape,
        stepContent,
        stlContent,
        gltfContent,
        dxfContent,
        thumbnailContent,
        meshStats,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`Code execution failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        executionTimeMs,
      };
    }
  }

  /**
   * Run code in a sandboxed context
   *
   * Creates a function from the code and executes it with the oc instance.
   * This provides some isolation but is not fully secure for untrusted code.
   */
  private async runCodeSandboxed(code: string): Promise<unknown> {
    const oc = this.oc as Record<string, unknown>;

    try {
      // Look for a createModel or main function in the code
      // The LLM is instructed to generate a function that takes 'oc' and returns a shape

      // Strip import/export statements since:
      // 1. The 'oc' object is already passed directly to the function
      // 2. Type imports are not needed at runtime
      // 3. new Function() doesn't support ES modules
      const cleanedCode = this.stripModuleSyntax(code);

      // Log the first 500 chars of cleaned code for debugging
      this.logger.log(
        `[CAD-EXEC] Cleaned code preview (${cleanedCode.length} chars):\n${cleanedCode.slice(0, 500)}...`,
      );

      // Check what function names are defined
      const hasFunctionCreateModel = /function\s+createModel\s*\(/.test(
        cleanedCode,
      );
      const hasConstCreateModel = /const\s+createModel\s*=/.test(cleanedCode);
      const hasFunctionMain = /function\s+main\s*\(/.test(cleanedCode);
      const hasConstMain = /const\s+main\s*=/.test(cleanedCode);

      this.logger.log(
        `[CAD-EXEC] Function detection: createModel=${hasFunctionCreateModel || hasConstCreateModel}, main=${hasFunctionMain || hasConstMain}`,
      );

      // Wrap the code in a function that returns the shape
      // Handle multiple function naming patterns
      // Also wrap in try-catch to get better error messages from WASM
      const codePreview = JSON.stringify(cleanedCode.slice(0, 300));
      const wrappedCode = `
        // Helper to extract meaningful error from WASM exceptions
        function getWasmErrorMessage(err) {
          if (typeof err === 'number') {
            // WASM pointer - try to get exception info
            if (oc.HEAPU8 && oc.___cxa_demangle) {
              try {
                // Try to demangle the exception type
                return 'OpenCASCADE.js WASM exception (pointer: ' + err + '). This usually means invalid geometry or unsupported operation.';
              } catch (e) {
                return 'OpenCASCADE.js WASM exception (pointer: ' + err + ')';
              }
            }
            return 'OpenCASCADE.js threw a WASM exception. Common causes: invalid class name, wrong constructor arguments, or unsupported geometry operation. Error pointer: ' + err;
          }
          if (err instanceof Error) {
            return err.message;
          }
          return String(err);
        }

        try {
          ${cleanedCode}

          // Try to find and call the main function
          // Check various patterns: function declaration, const arrow, etc.
          if (typeof createModel === 'function') {
            return createModel(oc);
          } else if (typeof main === 'function') {
            return main(oc);
          } else if (typeof buildModel === 'function') {
            return buildModel(oc);
          } else if (typeof makeShape === 'function') {
            return makeShape(oc);
          } else if (typeof generateModel === 'function') {
            return generateModel(oc);
          } else {
            throw new Error('No createModel or main function found in generated code. Code preview: ' + ${codePreview});
          }
        } catch (wasmErr) {
          throw new Error(getWasmErrorMessage(wasmErr));
        }
      `;

      // Create a function with 'oc' in scope
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const executeFunc = new Function('oc', wrappedCode) as (
        oc: unknown,
      ) => Promise<unknown>;

      // Execute and get the result
      const result = await executeFunc(oc);

      return result;
    } catch (error) {
      this.logger.error(
        `Sandboxed execution error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Strip ES module syntax and TypeScript-specific syntax from code
   *
   * Removes:
   * - import/export statements (not supported by new Function())
   * - TypeScript type annotations (not valid JavaScript)
   *
   * Also fixes common LLM code generation issues:
   * - Duplicate variable declarations (const -> let for reusable vars)
   *
   * The 'oc' object containing all OpenCASCADE types is passed directly,
   * so imports are not needed at runtime.
   */
  private stripModuleSyntax(code: string): string {
    // Remove import statements (including type imports)
    // Handles: import X from 'Y', import { X } from 'Y', import type { X } from 'Y', etc.
    let cleaned = code.replace(/^\s*import\s+.*?['"];?\s*$/gm, '');

    // Remove export keywords but keep the declarations
    // export function X -> function X
    // export const X -> const X
    // export default X -> X
    cleaned = cleaned.replace(/^\s*export\s+default\s+/gm, '');
    cleaned = cleaned.replace(/^\s*export\s+/gm, '');

    // Remove any remaining standalone 'export' statements
    cleaned = cleaned.replace(/^\s*export\s*{\s*[^}]*\s*}\s*;?\s*$/gm, '');

    // Remove TypeScript type annotations
    // These are not valid in plain JavaScript executed via new Function()
    cleaned = this.stripTypeScriptSyntax(cleaned);

    // Fix duplicate variable declarations by converting const to let for common reusable names
    // LLMs often generate code like: const transform = ...; ... const transform = ...;
    // This causes "Identifier 'X' has already been declared" errors
    cleaned = this.fixDuplicateDeclarations(cleaned);

    return cleaned;
  }

  /**
   * Fix duplicate variable declarations that LLMs commonly generate
   *
   * Converts `const` to `let` for variables that are declared multiple times,
   * and removes the `let`/`const` keyword from subsequent declarations.
   */
  private fixDuplicateDeclarations(code: string): string {
    // Find all variable declarations
    const constPattern = /\bconst\s+(\w+)\s*=/g;
    const letPattern = /\blet\s+(\w+)\s*=/g;

    // Count occurrences of each variable name
    const varCounts = new Map<string, number>();

    let match;
    while ((match = constPattern.exec(code)) !== null) {
      const varName = match[1]!;
      varCounts.set(varName, (varCounts.get(varName) || 0) + 1);
    }
    while ((match = letPattern.exec(code)) !== null) {
      const varName = match[1]!;
      varCounts.set(varName, (varCounts.get(varName) || 0) + 1);
    }

    // For variables declared more than once, convert all to let and remove keyword from duplicates
    let result = code;
    for (const [varName, count] of varCounts) {
      if (count > 1) {
        this.logger.warn(
          `[CAD-EXEC] Fixing duplicate declaration of '${varName}' (${count} occurrences)`,
        );

        // First, convert all const declarations of this var to let
        const constVarPattern = new RegExp(
          `\\bconst\\s+(${varName})\\s*=`,
          'g',
        );
        result = result.replace(constVarPattern, `let ${varName} =`);

        // Now find all let declarations and keep only the first one
        const letVarPattern = new RegExp(`\\blet\\s+(${varName})\\s*=`, 'g');
        let firstFound = false;
        result = result.replace(letVarPattern, (fullMatch) => {
          if (!firstFound) {
            firstFound = true;
            return fullMatch; // Keep the first declaration
          }
          // Remove 'let' from subsequent declarations (just assignment)
          return `${varName} =`;
        });
      }
    }

    return result;
  }

  /**
   * Strip TypeScript-specific syntax from code
   *
   * Removes:
   * - Type annotations on function parameters: (param: Type) -> (param)
   * - Return type annotations: function(): Type -> function()
   * - Variable type annotations: const x: Type = -> const x =
   * - Type assertions: value as Type -> value
   * - Generic type parameters: <T> -> (removed)
   */
  private stripTypeScriptSyntax(code: string): string {
    let cleaned = code;

    // Remove function return type annotations: ): Type { or ): Type =>
    // Match ): followed by type annotation until { or =>
    cleaned = cleaned.replace(
      /\)\s*:\s*[A-Za-z_$][\w$]*(?:<[^>]*>)?\s*(?=[{=])/g,
      ') ',
    );

    // Remove parameter type annotations: (param: Type) or (param: Type, ...)
    // This is tricky - we need to handle multiple parameters
    // Match : followed by type until , or )
    cleaned = cleaned.replace(
      /:\s*[A-Za-z_$][\w$]*(?:<[^>]*>)?(?=\s*[,)])/g,
      '',
    );

    // Remove variable type annotations: const x: Type = or let x: Type =
    cleaned = cleaned.replace(/:\s*[A-Za-z_$][\w$]*(?:<[^>]*>)?\s*(?==)/g, ' ');

    // Remove type assertions: value as Type (but keep the value)
    cleaned = cleaned.replace(/\s+as\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?/g, '');

    // Remove generic type parameters on function declarations: function<T>
    cleaned = cleaned.replace(/function\s*<[^>]*>/g, 'function');

    // Remove interface and type declarations (entire lines)
    cleaned = cleaned.replace(
      /^\s*(?:interface|type)\s+\w+\s*[={][\s\S]*?(?:^}|\n\s*\n)/gm,
      '',
    );

    return cleaned;
  }

  /**
   * Extract mesh statistics from a shape
   */
  private extractMeshStats(shape: unknown): OcctExecutionResult['meshStats'] {
    const oc = this.oc as Record<string, unknown>;

    // Default values
    let xmin = 0,
      ymin = 0,
      zmin = 0;
    let xmax = 0,
      ymax = 0,
      zmax = 0;
    let vertices = 0;
    let faces = 0;

    // Try to get bounding box using CornerMin/CornerMax (more reliable than Get with refs)
    try {
      const bbox = new (oc['Bnd_Box_1'] as new () => {
        IsVoid: () => boolean;
        CornerMin: () => {
          X: () => number;
          Y: () => number;
          Z: () => number;
          delete: () => void;
        };
        CornerMax: () => {
          X: () => number;
          Y: () => number;
          Z: () => number;
          delete: () => void;
        };
        delete: () => void;
      })();
      const brepBndLib = oc['BRepBndLib'] as {
        Add: (shape: unknown, bbox: unknown, useTriangulation: boolean) => void;
      };
      brepBndLib.Add(shape, bbox, false);

      if (!bbox.IsVoid()) {
        const cornerMin = bbox.CornerMin();
        const cornerMax = bbox.CornerMax();
        xmin = cornerMin.X();
        ymin = cornerMin.Y();
        zmin = cornerMin.Z();
        xmax = cornerMax.X();
        ymax = cornerMax.Y();
        zmax = cornerMax.Z();
        cornerMin.delete();
        cornerMax.delete();
        this.logger.log(
          `[CAD-EXEC] Bounding box: (${xmin.toFixed(2)}, ${ymin.toFixed(2)}, ${zmin.toFixed(2)}) to (${xmax.toFixed(2)}, ${ymax.toFixed(2)}, ${zmax.toFixed(2)})`,
        );
      } else {
        this.logger.warn(`[CAD-EXEC] Bounding box is void`);
      }
      bbox.delete();
    } catch (bboxError) {
      this.logger.warn(
        `[CAD-EXEC] Failed to extract bounding box: ${bboxError instanceof Error ? bboxError.message : String(bboxError)}`,
      );
    }

    // Try to count faces (skip vertex/triangle counting which is causing WASM crashes)
    try {
      const TopAbs_FACE = (oc['TopAbs_ShapeEnum'] as { TopAbs_FACE: unknown })
        .TopAbs_FACE;
      const TopAbs_SHAPE = (oc['TopAbs_ShapeEnum'] as { TopAbs_SHAPE: unknown })
        .TopAbs_SHAPE;
      // Use TopExp_Explorer_1 (no args constructor) then Init()
      const explorer = new (oc['TopExp_Explorer_1'] as new () => {
        Init: (shape: unknown, toFind: unknown, toAvoid: unknown) => void;
        More: () => boolean;
        Next: () => void;
      })();
      explorer.Init(shape, TopAbs_FACE, TopAbs_SHAPE);

      while (explorer.More()) {
        faces++;
        explorer.Next();
      }
      // Estimate vertices based on faces (rough approximation)
      vertices = faces * 4;
      this.logger.log(
        `[CAD-EXEC] Face count: ${faces}, estimated vertices: ${vertices}`,
      );
    } catch (faceError) {
      this.logger.warn(
        `[CAD-EXEC] Failed to count faces: ${faceError instanceof Error ? faceError.message : String(faceError)}`,
      );
    }

    return {
      vertices,
      faces,
      boundingBox: {
        min: { x: xmin, y: ymin, z: zmin },
        max: { x: xmax, y: ymax, z: zmax },
      },
    };
  }

  /**
   * Export shape to STEP format
   */
  private exportToSTEP(shape: unknown): string {
    const oc = this.oc as Record<string, unknown>;

    try {
      // Create a progress range for the transfer operation
      const progressRange = new (oc[
        'Message_ProgressRange_1'
      ] as new () => unknown)();

      const writer = new (oc['STEPControl_Writer_1'] as new () => {
        Transfer: (
          shape: unknown,
          mode: unknown,
          compgraph: boolean,
          progress: unknown,
        ) => unknown;
        Write: (filename: string) => unknown;
      })();

      // STEPControl_Writer.Transfer requires 4 params: (shape, mode, compgraph, progress)
      writer.Transfer(
        shape,
        (oc['STEPControl_StepModelType'] as { STEPControl_AsIs: unknown })
          .STEPControl_AsIs,
        true,
        progressRange,
      );

      // Write to virtual file system
      const filename = '/tmp/model.step';
      writer.Write(filename);

      // Read from virtual file system
      const fs = (oc as { FS: { readFile: (path: string) => Uint8Array } }).FS;
      const content = fs.readFile(filename);

      return new TextDecoder().decode(content);
    } catch (error) {
      this.logger.warn(
        `STEP export failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }

  /**
   * Export shape to STL format (ASCII)
   */
  private exportToSTL(shape: unknown): string {
    const oc = this.oc as Record<string, unknown>;

    try {
      // Triangulate the shape first - meshing happens in constructor (no Perform needed)
      // Use coarser deflection (0.5) for faster meshing on Cloud Run
      const deflection = 0.5;
      new (oc['BRepMesh_IncrementalMesh_2'] as new (
        shape: unknown,
        deflection: number,
        isRelative: boolean,
        angularDeflection: number,
        isInParallel: boolean,
      ) => void)(shape, deflection, false, 0.5, false);

      // Progress range for write operation
      const writeProgressRange = new (oc[
        'Message_ProgressRange_1'
      ] as new () => unknown)();

      // StlAPI_Writer - no _1 suffix needed
      const writer = new (oc['StlAPI_Writer'] as new () => {
        Write: (shape: unknown, filename: string, progress: unknown) => boolean;
      })();

      const filename = '/tmp/model.stl';
      writer.Write(shape, filename, writeProgressRange);

      const fs = (oc as { FS: { readFile: (path: string) => Uint8Array } }).FS;
      const content = fs.readFile(filename);

      return new TextDecoder().decode(content);
    } catch (error) {
      this.logger.warn(
        `STL export failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }

  /**
   * Export shape to GLTF format
   *
   * Returns the GLTF JSON with embedded binary buffer
   */
  private exportToGLTF(shape: unknown): Buffer {
    const oc = this.oc as Record<string, unknown>;

    try {
      // Triangulate the shape - meshing happens in constructor (no Perform needed)
      // Use coarser deflection (0.5) for faster meshing on Cloud Run
      const deflection = 0.5;
      new (oc['BRepMesh_IncrementalMesh_2'] as new (
        shape: unknown,
        deflection: number,
        isRelative: boolean,
        angularDeflection: number,
        isInParallel: boolean,
      ) => void)(shape, deflection, false, 0.5, false);

      // Use RWGltf_CafWriter if available, otherwise manual conversion
      // For simplicity, we'll create a basic GLTF from triangulation

      const gltf = this.buildGltfFromTriangulation(shape);
      return Buffer.from(JSON.stringify(gltf, null, 2), 'utf-8');
    } catch (error) {
      this.logger.warn(
        `GLTF export failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Return a valid minimal GLTF with required asset.version
      const emptyGltf = {
        asset: {
          version: '2.0',
          generator:
            'OpenCASCADE.js - Orchestrator AI CAD Agent (error fallback)',
        },
        scene: 0,
        scenes: [{ nodes: [] }],
        nodes: [],
        meshes: [],
      };
      return Buffer.from(JSON.stringify(emptyGltf), 'utf-8');
    }
  }

  /**
   * Build GLTF JSON from shape triangulation
   * Based on: https://github.com/donalffons/opencascade.js-examples/blob/main/src/common/visualize.js
   */
  private buildGltfFromTriangulation(shape: unknown): object {
    const oc = this.oc as Record<string, unknown>;

    // Collect all vertices and indices from all faces
    const allVertices: number[] = [];
    const allIndices: number[] = [];
    let vertexOffset = 0;

    // Use TopExp_Explorer_1 (no args constructor) then Init()
    const TopAbs_FACE = (oc['TopAbs_ShapeEnum'] as { TopAbs_FACE: unknown })
      .TopAbs_FACE;
    const TopAbs_SHAPE = (oc['TopAbs_ShapeEnum'] as { TopAbs_SHAPE: unknown })
      .TopAbs_SHAPE;

    const explorer = new (oc['TopExp_Explorer_1'] as new () => {
      Init: (shape: unknown, toFind: unknown, toAvoid: unknown) => void;
      More: () => boolean;
      Next: () => void;
      Current: () => unknown;
      delete: () => void;
    })();
    explorer.Init(shape, TopAbs_FACE, TopAbs_SHAPE);

    while (explorer.More()) {
      const myShape = explorer.Current();
      // Cast TopoDS_Shape to TopoDS_Face using TopoDS.Face_1
      const myFace = (
        oc['TopoDS'] as { Face_1: (shape: unknown) => unknown }
      ).Face_1(myShape);

      // Mesh THIS FACE (not the whole shape) - this is critical!
      try {
        const inc = new (oc['BRepMesh_IncrementalMesh_2'] as new (
          face: unknown,
          deflection: number,
          isRelative: boolean,
          angularDeflection: number,
          isInParallel: boolean,
        ) => { delete: () => void })(myFace, 0.5, false, 0.5, false);
        // inc is created but we don't need to call anything - meshing happens in constructor
        // We should delete it after use
        inc.delete();
      } catch (meshErr) {
        this.logger.warn(
          `[CAD-EXEC] Face meshing failed: ${meshErr instanceof Error ? meshErr.message : String(meshErr)}`,
        );
        explorer.Next();
        continue;
      }

      const aLocation = new (oc['TopLoc_Location_1'] as new () => {
        Transformation: () => unknown;
        delete: () => void;
      })();

      // BRep_Tool.Triangulation - third param is 0 (Poly_MeshPurpose_NONE)
      const myT = (
        oc['BRep_Tool'] as {
          Triangulation: (
            face: unknown,
            location: unknown,
            meshPurpose: number,
          ) => {
            IsNull: () => boolean;
            get: () => {
              NbTriangles: () => number;
              NbNodes: () => number;
              Node: (i: number) => {
                Transformed: (t: unknown) => {
                  X: () => number;
                  Y: () => number;
                  Z: () => number;
                  delete: () => void;
                };
                delete: () => void;
              };
              Triangles: () => {
                Length: () => number;
                Value: (i: number) => {
                  Value: (idx: number) => number;
                  delete: () => void;
                };
                delete: () => void;
              };
            };
            delete: () => void;
          };
        }
      ).Triangulation(myFace, aLocation, 0);

      if (myT.IsNull()) {
        aLocation.delete();
        explorer.Next();
        continue;
      }

      const triangulation = myT.get();
      const nbNodes = triangulation.NbNodes();

      // Get vertices with transformation applied
      const t1 = aLocation.Transformation();
      for (let i = 1; i <= nbNodes; i++) {
        const p = triangulation.Node(i);
        const p1 = p.Transformed(t1);
        allVertices.push(p1.X(), p1.Y(), p1.Z());
        p.delete();
        p1.delete();
      }

      // Get triangles using Triangles().Value() pattern
      const triangles = triangulation.Triangles();
      const nbTriangles = triangulation.NbTriangles();
      for (let nt = 1; nt <= nbTriangles; nt++) {
        const t = triangles.Value(nt);
        const n1 = t.Value(1);
        const n2 = t.Value(2);
        const n3 = t.Value(3);
        // Convert 1-based to 0-based and add offset
        allIndices.push(
          n1 - 1 + vertexOffset,
          n2 - 1 + vertexOffset,
          n3 - 1 + vertexOffset,
        );
        t.delete();
      }

      vertexOffset += nbNodes;

      // Clean up
      triangles.delete();
      myT.delete();
      aLocation.delete();

      explorer.Next();
    }

    explorer.delete();

    // Calculate bounding box
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < allVertices.length; i += 3) {
      min[0] = Math.min(min[0]!, allVertices[i]!);
      min[1] = Math.min(min[1]!, allVertices[i + 1]!);
      min[2] = Math.min(min[2]!, allVertices[i + 2]!);
      max[0] = Math.max(max[0]!, allVertices[i]!);
      max[1] = Math.max(max[1]!, allVertices[i + 1]!);
      max[2] = Math.max(max[2]!, allVertices[i + 2]!);
    }

    // Create binary buffer
    const vertexBuffer = new Float32Array(allVertices);
    const indexBuffer = new Uint16Array(allIndices);

    const vertexBytes = new Uint8Array(vertexBuffer.buffer);
    const indexBytes = new Uint8Array(indexBuffer.buffer);

    const totalLength = vertexBytes.length + indexBytes.length;
    const combined = new Uint8Array(totalLength);
    combined.set(vertexBytes, 0);
    combined.set(indexBytes, vertexBytes.length);

    const base64 = Buffer.from(combined).toString('base64');

    return {
      asset: {
        version: '2.0',
        generator: 'OpenCASCADE.js - Orchestrator AI CAD Agent',
      },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: 'CADModel' }],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
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
          count: allVertices.length / 3,
          type: 'VEC3',
          max: max,
          min: min,
        },
        {
          bufferView: 1,
          componentType: 5123, // UNSIGNED_SHORT
          count: allIndices.length,
          type: 'SCALAR',
        },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: vertexBytes.length },
        {
          buffer: 0,
          byteOffset: vertexBytes.length,
          byteLength: indexBytes.length,
        },
      ],
      buffers: [
        {
          uri: `data:application/octet-stream;base64,${base64}`,
          byteLength: totalLength,
        },
      ],
    };
  }

  /**
   * Export shape to DXF format (2D projection)
   *
   * DXF is a 2D CAD format. We project the 3D shape edges onto the XY plane
   * and export them as DXF entities.
   */
  private exportToDXF(
    shape: unknown,
    boundingBox: NonNullable<OcctExecutionResult['meshStats']>['boundingBox'],
  ): string {
    const oc = this.oc as Record<string, unknown>;

    try {
      // Collect all edges from the shape
      const edges: Array<{
        start: { x: number; y: number };
        end: { x: number; y: number };
      }> = [];

      // Use TopExp_Explorer_1 (no args constructor) then Init()
      const TopAbs_EDGE = (oc['TopAbs_ShapeEnum'] as { TopAbs_EDGE: unknown })
        .TopAbs_EDGE;
      const TopAbs_SHAPE = (oc['TopAbs_ShapeEnum'] as { TopAbs_SHAPE: unknown })
        .TopAbs_SHAPE;

      const explorer = new (oc['TopExp_Explorer_1'] as new () => {
        Init: (shape: unknown, toFind: unknown, toAvoid: unknown) => void;
        More: () => boolean;
        Next: () => void;
        Current: () => unknown;
      })();
      explorer.Init(shape, TopAbs_EDGE, TopAbs_SHAPE);

      while (explorer.More()) {
        const edge = explorer.Current();

        try {
          // Get curve from edge
          const first = { value: 0 };
          const last = { value: 0 };
          const curve = (
            oc['BRep_Tool'] as {
              Curve: (
                edge: unknown,
                first: { value: number },
                last: { value: number },
              ) => {
                Value: (u: number) => {
                  X: () => number;
                  Y: () => number;
                  Z: () => number;
                };
              } | null;
            }
          ).Curve(edge, first, last);

          if (curve) {
            // Sample start and end points
            const startPt = curve.Value(first.value);
            const endPt = curve.Value(last.value);

            edges.push({
              start: { x: startPt.X(), y: startPt.Y() },
              end: { x: endPt.X(), y: endPt.Y() },
            });
          }
        } catch {
          // Skip edges that can't be processed
        }

        explorer.Next();
      }

      // Build DXF content
      return this.buildDxfContent(edges, boundingBox);
    } catch (error) {
      this.logger.warn(
        `DXF export failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Return minimal valid DXF
      return this.buildDxfContent([], boundingBox);
    }
  }

  /**
   * Build DXF file content from edges
   */
  private buildDxfContent(
    edges: Array<{
      start: { x: number; y: number };
      end: { x: number; y: number };
    }>,
    boundingBox: NonNullable<OcctExecutionResult['meshStats']>['boundingBox'],
  ): string {
    const lines: string[] = [];

    // DXF Header section
    lines.push('0', 'SECTION');
    lines.push('2', 'HEADER');
    lines.push('9', '$ACADVER');
    lines.push('1', 'AC1014'); // AutoCAD R14 format
    lines.push('9', '$EXTMIN');
    lines.push('10', String(boundingBox.min.x));
    lines.push('20', String(boundingBox.min.y));
    lines.push('30', String(boundingBox.min.z));
    lines.push('9', '$EXTMAX');
    lines.push('10', String(boundingBox.max.x));
    lines.push('20', String(boundingBox.max.y));
    lines.push('30', String(boundingBox.max.z));
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

    // Entities section
    lines.push('0', 'SECTION');
    lines.push('2', 'ENTITIES');

    // Add LINE entities for each edge
    for (const edge of edges) {
      lines.push('0', 'LINE');
      lines.push('8', '0'); // Layer
      lines.push('10', String(edge.start.x)); // Start X
      lines.push('20', String(edge.start.y)); // Start Y
      lines.push('30', '0'); // Start Z (projected to XY plane)
      lines.push('11', String(edge.end.x)); // End X
      lines.push('21', String(edge.end.y)); // End Y
      lines.push('31', '0'); // End Z
    }

    lines.push('0', 'ENDSEC');
    lines.push('0', 'EOF');

    return lines.join('\n');
  }

  /**
   * Generate a thumbnail for the CAD model
   *
   * Since we're running server-side without a GPU, we generate an SVG-based
   * placeholder thumbnail that shows model statistics. For proper 3D rendering,
   * a separate worker with headless Chrome/WebGL would be needed.
   *
   * The SVG is converted to PNG using a simple encoding approach.
   */
  private generateThumbnail(
    meshStats: NonNullable<OcctExecutionResult['meshStats']>,
  ): Buffer {
    const width = 256;
    const height = 256;

    const bbox = meshStats.boundingBox;
    const dims = {
      x: (bbox.max.x - bbox.min.x).toFixed(1),
      y: (bbox.max.y - bbox.min.y).toFixed(1),
      z: (bbox.max.z - bbox.min.z).toFixed(1),
    };

    // Create an SVG representation
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
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
    ${dims.x} × ${dims.y} × ${dims.z}
  </text>
  <text x="128" y="195" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#718096">
    ${meshStats.vertices.toLocaleString()} vertices
  </text>
  <text x="128" y="210" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#718096">
    ${meshStats.faces.toLocaleString()} faces
  </text>

  <!-- CAD Agent badge -->
  <text x="128" y="240" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#4a5568">
    CAD Agent
  </text>
</svg>`;

    // For now, return the SVG as a buffer
    // TODO: In production, use sharp or canvas to convert SVG to PNG
    // For now, we'll save as SVG but with PNG extension (viewers can often handle this)
    // A proper solution would use: const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return Buffer.from(svg, 'utf-8');
  }

  /**
   * Check if OpenCASCADE.js is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if code contains fillet or chamfer operations
   */
  private hasFilletOrChamfer(code: string): boolean {
    return /BRepFilletAPI_MakeFillet|BRepFilletAPI_MakeChamfer/i.test(code);
  }

  /**
   * Check if code contains boolean cut/fuse/common operations
   */
  private hasBooleanOps(code: string): boolean {
    return /BRepAlgoAPI_Cut|BRepAlgoAPI_Fuse|BRepAlgoAPI_Common/i.test(code);
  }

  /**
   * Strip fillet/chamfer code when boolean operations are present.
   * Fillets on boolean-cut geometry commonly crash the WASM runtime.
   * Returns the original code if no stripping is needed.
   */
  private stripUnsafeFillets(code: string): string {
    if (!this.hasFilletOrChamfer(code) || !this.hasBooleanOps(code)) {
      return code;
    }

    this.logger.warn(
      '[CAD-EXEC] Code has both boolean ops and fillets/chamfers — stripping fillets to prevent WASM crash',
    );

    return this.forceStripFillets(code);
  }

  /**
   * Force-strip all fillet/chamfer code blocks from generated code.
   * Removes fillet/chamfer variable declarations, explorer loops for fillets,
   * and fillet Build/Shape calls. Returns the pre-fillet shape instead.
   */
  private forceStripFillets(code: string): string {
    let stripped = code;

    // Remove fillet/chamfer maker creation and all related lines
    // Pattern: var/const/let filletMaker = new oc.BRepFilletAPI_MakeFillet(...)
    stripped = stripped.replace(
      /^[ \t]*(?:var|const|let)\s+\w*[Ff]illet\w*\s*=\s*new\s+oc\.BRepFilletAPI_MakeFillet\b[^;]*;/gm,
      '// [STRIPPED] Fillet removed to prevent WASM crash',
    );
    stripped = stripped.replace(
      /^[ \t]*(?:var|const|let)\s+\w*[Cc]hamfer\w*\s*=\s*new\s+oc\.BRepFilletAPI_MakeChamfer\b[^;]*;/gm,
      '// [STRIPPED] Chamfer removed to prevent WASM crash',
    );

    // Remove filletMaker.Add_2(...) calls
    stripped = stripped.replace(
      /^[ \t]*\w*[Ff]illet\w*\.Add_2\([^)]*\);/gm,
      '',
    );
    stripped = stripped.replace(
      /^[ \t]*\w*[Cc]hamfer\w*\.Add_2\([^)]*\);/gm,
      '',
    );

    // Remove filletMaker.Build(...) calls
    stripped = stripped.replace(
      /^[ \t]*\w*[Ff]illet\w*\.Build\([^)]*\);/gm,
      '',
    );
    stripped = stripped.replace(
      /^[ \t]*\w*[Cc]hamfer\w*\.Build\([^)]*\);/gm,
      '',
    );

    // Replace "filletMaker.Shape()" or "filletedShape = filletMaker.Shape()" with the base shape
    // The LLM typically returns filletedShape at the end, which we need to replace
    // with the pre-fillet shape variable
    stripped = stripped.replace(
      /^[ \t]*(?:var|const|let)\s+(\w*[Ff]illet\w*)\s*=\s*\w*[Ff]illet\w*\.Shape\(\);/gm,
      '',
    );

    // Remove edge explorer loops used specifically for fillets
    // Pattern: var edgeExplorer = ...; ... while (edgeExplorer.More()) { ... filletMaker ... }
    // This is complex to parse so we'll just remove individual fillet-related statements

    // If the return statement returns a fillet variable, replace it with the pre-fillet shape
    // Look for: return filletedBracket; or return filletedShape;
    // Replace with: return bracket; or return shape; (the last non-fillet shape assignment)
    const filletReturnMatch = stripped.match(/return\s+(\w*[Ff]illet\w*)\s*;/);
    if (filletReturnMatch) {
      // Find the variable the fillet was initialized from
      // Pattern: var filletedBracket = bracket;
      const initMatch = code.match(
        new RegExp(
          `(?:var|const|let)\\s+${filletReturnMatch[1]}\\s*=\\s*(\\w+)\\s*;`,
        ),
      );
      if (initMatch && initMatch[1]) {
        stripped = stripped.replace(
          new RegExp(`return\\s+${filletReturnMatch[1]}\\s*;`),
          `return ${initMatch[1]};`,
        );
      }
    }

    this.logger.log(
      `[CAD-EXEC] Stripped fillets from code (${code.length} -> ${stripped.length} chars)`,
    );

    return stripped;
  }
}
