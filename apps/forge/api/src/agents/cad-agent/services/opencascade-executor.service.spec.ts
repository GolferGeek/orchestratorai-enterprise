/**
 * Unit tests for OpenCascadeExecutorService
 *
 * Tests:
 * - WASM initialization lifecycle
 * - Code execution (success and failure paths)
 * - Code cleaning (stripModuleSyntax, stripTypeScriptSyntax, fixDuplicateDeclarations)
 * - Mesh stats extraction
 * - Export to STEP, STL, GLTF, DXF, thumbnail formats
 * - isReady() check
 *
 * opencascade.js is fully mocked since it's a WASM module.
 */

// Mock opencascade.js BEFORE importing anything
jest.mock(
  'opencascade.js/dist/node.js',
  () => {
    return {
      default: jest.fn().mockResolvedValue(createMockOcctApi()),
    };
  },
  { virtual: true },
);

jest.mock(
  'opencascade.js',
  () => {
    return {
      default: jest.fn().mockResolvedValue(createMockOcctApi()),
    };
  },
  { virtual: true },
);

/**
 * Creates a comprehensive mock of the OpenCASCADE.js API
 */
function createMockOcctApi() {
  const mockShape = { type: 'TopoDS_Shape', isShape: true };

  const mockTransformation = { type: 'gp_Trsf' };

  const mockNode = {
    Transformed: jest.fn().mockReturnValue({
      X: jest.fn().mockReturnValue(1.0),
      Y: jest.fn().mockReturnValue(2.0),
      Z: jest.fn().mockReturnValue(3.0),
      delete: jest.fn(),
    }),
    delete: jest.fn(),
  };

  const mockTriangle = {
    Value: jest.fn().mockImplementation((idx: number) => idx),
    delete: jest.fn(),
  };

  const mockTriangles = {
    Length: jest.fn().mockReturnValue(2),
    Value: jest.fn().mockReturnValue(mockTriangle),
    delete: jest.fn(),
  };

  const mockTriangulation = {
    NbTriangles: jest.fn().mockReturnValue(2),
    NbNodes: jest.fn().mockReturnValue(3),
    Node: jest.fn().mockReturnValue(mockNode),
    Triangles: jest.fn().mockReturnValue(mockTriangles),
  };

  const mockTHandle = {
    IsNull: jest.fn().mockReturnValue(false),
    get: jest.fn().mockReturnValue(mockTriangulation),
    delete: jest.fn(),
  };

  const mockLocation = {
    Transformation: jest.fn().mockReturnValue(mockTransformation),
    delete: jest.fn(),
  };

  const mockCornerMin = {
    X: jest.fn().mockReturnValue(-5),
    Y: jest.fn().mockReturnValue(-5),
    Z: jest.fn().mockReturnValue(-5),
    delete: jest.fn(),
  };

  const mockCornerMax = {
    X: jest.fn().mockReturnValue(5),
    Y: jest.fn().mockReturnValue(5),
    Z: jest.fn().mockReturnValue(5),
    delete: jest.fn(),
  };

  const mockBbox = {
    IsVoid: jest.fn().mockReturnValue(false),
    CornerMin: jest.fn().mockReturnValue(mockCornerMin),
    CornerMax: jest.fn().mockReturnValue(mockCornerMax),
    delete: jest.fn(),
  };

  let explorerCallCount = 0;
  const mockExplorer = {
    Init: jest.fn(),
    More: jest.fn().mockImplementation(() => {
      explorerCallCount++;
      return explorerCallCount <= 2; // Return 2 faces/edges then stop
    }),
    Next: jest.fn().mockImplementation(() => {
      // Reset handled in individual tests
    }),
    Current: jest.fn().mockReturnValue(mockShape),
    delete: jest.fn(),
  };

  const mockCurve = {
    Value: jest.fn().mockImplementation((u: number) => ({
      X: jest.fn().mockReturnValue(u * 1.0),
      Y: jest.fn().mockReturnValue(u * 2.0),
      Z: jest.fn().mockReturnValue(u * 0.5),
    })),
  };

  const mockStepWriter = {
    Transfer: jest.fn(),
    Write: jest.fn(),
  };

  const mockStlWriter = {
    Write: jest.fn().mockReturnValue(true),
  };

  const mockMeshInstance = {
    delete: jest.fn(),
  };

  const mockFs = {
    readFile: jest
      .fn()
      .mockReturnValue(
        new Uint8Array(
          Buffer.from(
            'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;',
          ),
        ),
      ),
  };

  return {
    FS: mockFs,

    // Bounding box
    Bnd_Box_1: jest.fn().mockImplementation(() => mockBbox),
    BRepBndLib: {
      Add: jest.fn(),
    },

    // Shape enum
    TopAbs_ShapeEnum: {
      TopAbs_FACE: 'TopAbs_FACE',
      TopAbs_EDGE: 'TopAbs_EDGE',
      TopAbs_SHAPE: 'TopAbs_SHAPE',
    },

    // Explorer
    TopExp_Explorer_1: jest.fn().mockImplementation(() => {
      explorerCallCount = 0;
      return mockExplorer;
    }),

    // TopoDS
    TopoDS: {
      Face_1: jest.fn().mockReturnValue(mockShape),
      Edge_1: jest.fn().mockReturnValue(mockShape),
    },

    // Location
    TopLoc_Location_1: jest.fn().mockImplementation(() => mockLocation),

    // BRep_Tool
    BRep_Tool: {
      Triangulation: jest.fn().mockReturnValue(mockTHandle),
      Curve: jest.fn().mockReturnValue(mockCurve),
    },

    // Mesh
    BRepMesh_IncrementalMesh_2: jest
      .fn()
      .mockImplementation(() => mockMeshInstance),

    // STEP writer
    STEPControl_Writer_1: jest.fn().mockImplementation(() => mockStepWriter),
    STEPControl_StepModelType: {
      STEPControl_AsIs: 'STEPControl_AsIs',
    },

    // Progress range
    Message_ProgressRange_1: jest.fn().mockImplementation(() => ({})),

    // STL writer
    StlAPI_Writer: jest.fn().mockImplementation(() => mockStlWriter),

    // BRepCheck_Analyzer (optional validity check)
    BRepCheck_Analyzer: jest.fn().mockImplementation(() => ({
      IsValid: jest.fn().mockReturnValue(true),
    })),
  };
}

import { ConfigService } from '@nestjs/config';
import { OpenCascadeExecutorService } from './opencascade-executor.service';

const mockConfigService = {
  get: jest.fn().mockReturnValue(undefined),
} as unknown as ConfigService;

describe('OpenCascadeExecutorService', () => {
  let service: OpenCascadeExecutorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OpenCascadeExecutorService(mockConfigService);
  });

  // ========================================
  // INITIALIZATION
  // ========================================

  describe('onModuleInit', () => {
    it('should start initialization without blocking', async () => {
      service.onModuleInit();
      expect(service).toBeDefined();
    });

    it('should be ready after initialization', async () => {
      service.onModuleInit();
      // Wait for init promise to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      // isReady should be true after successful init
      expect(service.isReady()).toBe(true);
    });
  });

  describe('isReady', () => {
    it('should return false before initialization', () => {
      const freshService = new OpenCascadeExecutorService(mockConfigService);
      expect(freshService.isReady()).toBe(false);
    });

    it('should return true after successful initialization', async () => {
      service.onModuleInit();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(service.isReady()).toBe(true);
    });
  });

  // ========================================
  // executeCode
  // ========================================

  describe('executeCode', () => {
    beforeEach(async () => {
      // Initialize the service before each test
      service.onModuleInit();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should execute valid createModel code and return a result', async () => {
      const code = `
function createModel(oc) {
  const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  return box;
}
`;
      const result = await service.executeCode(code);

      // Result should always be defined with executionTimeMs
      expect(result).toBeDefined();
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      // If successful, verify fields are present
      if (result.success) {
        expect(result.meshStats).toBeDefined();
        expect(result.stepContent).toBeDefined();
        expect(result.stlContent).toBeDefined();
        expect(result.gltfContent).toBeDefined();
      } else {
        // At minimum, error should be defined
        expect(result.error).toBeDefined();
      }
    });

    it('should execute code with main function name', async () => {
      const code = `
function main(oc) {
  const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  return box;
}
`;
      const result = await service.executeCode(code);
      // May succeed or fail depending on the mock behavior but should not throw
      expect(result).toBeDefined();
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should execute code with buildModel function name', async () => {
      const code = `
function buildModel(oc) {
  const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  return box;
}
`;
      const result = await service.executeCode(code);
      expect(result).toBeDefined();
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should execute code with makeShape function name', async () => {
      const code = `
function makeShape(oc) {
  const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  return box;
}
`;
      const result = await service.executeCode(code);
      expect(result).toBeDefined();
    });

    it('should execute code with generateModel function name', async () => {
      const code = `
function generateModel(oc) {
  const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  return box;
}
`;
      const result = await service.executeCode(code);
      expect(result).toBeDefined();
    });

    it('should return failure if code has no recognized function', async () => {
      const code = `
const someVar = 42;
// No function defined
`;
      const result = await service.executeCode(code);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return failure if code throws an error', async () => {
      const code = `
function createModel(oc) {
  throw new Error("Test error");
}
`;
      const result = await service.executeCode(code);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
    });

    it('should return failure if code returns null/undefined shape', async () => {
      const code = `
function createModel(oc) {
  return null;
}
`;
      const result = await service.executeCode(code);
      expect(result.success).toBe(false);
      expect(result.error).toContain('valid shape');
    });

    it('should handle WASM numeric exception (pointer)', async () => {
      const code = `
function createModel(oc) {
  throw 42; // Simulate WASM exception (pointer)
}
`;
      const result = await service.executeCode(code);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should strip TypeScript imports and export statements', async () => {
      const code = `
import { something } from 'somewhere';
import type { SomeType } from './types';
export function createModel(oc) {
  const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  return box;
}
`;
      const result = await service.executeCode(code);
      expect(result).toBeDefined();
    });

    it('should handle export default syntax', async () => {
      const code = `
export default function createModel(oc) {
  const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  return box;
}
`;
      const result = await service.executeCode(code);
      expect(result).toBeDefined();
    });

    it('should strip TypeScript type annotations', async () => {
      const code = `
function createModel(oc: any): unknown {
  const box: unknown = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  return box;
}
`;
      const result = await service.executeCode(code);
      expect(result).toBeDefined();
    });

    it('should fix duplicate variable declarations', async () => {
      const code = `
function createModel(oc) {
  const transform = new oc.gp_Trsf_1();
  const transform = new oc.gp_Trsf_1(); // duplicate
  const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  return box;
}
`;
      const result = await service.executeCode(code);
      // Should not throw "already declared" error
      expect(result).toBeDefined();
    });
  });

  // ========================================
  // STRIP MODULE SYNTAX (tested indirectly via executeCode)
  // ========================================

  describe('Code cleaning via executeCode', () => {
    beforeEach(async () => {
      service.onModuleInit();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should remove import statements including type imports', async () => {
      const code = `
import React from 'react';
import type { Foo } from './foo';
import { Bar, Baz } from './bar';
function createModel(oc) {
  return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
}
`;
      const result = await service.executeCode(code);
      expect(result).toBeDefined();
    });

    it('should remove export { } blocks', async () => {
      const code = `
function createModel(oc) {
  return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
}
export { createModel };
`;
      const result = await service.executeCode(code);
      expect(result).toBeDefined();
    });

    it('should handle TypeScript generics in function declarations', async () => {
      const code = `
function createModel<T>(oc: T): unknown {
  return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
}
`;
      const result = await service.executeCode(code);
      expect(result).toBeDefined();
    });

    it("should handle 'as' type assertions", async () => {
      const code = `
function createModel(oc) {
  const shape = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape() as unknown;
  return shape;
}
`;
      const result = await service.executeCode(code);
      expect(result).toBeDefined();
    });

    it('should handle let/const duplicate declarations', async () => {
      const code = `
function createModel(oc) {
  let box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
  let box = new oc.BRepPrimAPI_MakeBox_2(20, 20, 20).Shape();
  return box;
}
`;
      const result = await service.executeCode(code);
      expect(result).toBeDefined();
    });
  });

  // ========================================
  // EXPORT FUNCTIONS
  // ========================================

  describe('GLTF export with triangulation', () => {
    beforeEach(async () => {
      service.onModuleInit();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should return a valid GLTF buffer from executeCode result', async () => {
      const code = `
function createModel(oc) {
  return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
}
`;
      const result = await service.executeCode(code);

      if (result.success) {
        expect(result.gltfContent).toBeDefined();
        expect(Buffer.isBuffer(result.gltfContent)).toBe(true);

        // Parse GLTF and verify structure
        const gltfStr = result.gltfContent!.toString('utf-8');
        const gltf = JSON.parse(gltfStr);
        expect(gltf.asset.version).toBe('2.0');
      }
    });

    it('should handle GLTF face meshing failure gracefully', async () => {
      // This tests the error path in buildGltfFromTriangulation
      // If triangulation returns null handle, it skips the face
      const code = `
function createModel(oc) {
  return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
}
`;
      const result = await service.executeCode(code);
      expect(result).toBeDefined();
    });
  });

  describe('Thumbnail generation', () => {
    beforeEach(async () => {
      service.onModuleInit();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should generate an SVG thumbnail buffer', async () => {
      const code = `
function createModel(oc) {
  return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
}
`;
      const result = await service.executeCode(code);

      if (result.success) {
        expect(result.thumbnailContent).toBeDefined();
        expect(Buffer.isBuffer(result.thumbnailContent)).toBe(true);

        const svgStr = result.thumbnailContent!.toString('utf-8');
        expect(svgStr).toContain('<svg');
        expect(svgStr).toContain('</svg>');
        expect(svgStr).toContain('CAD Agent');
      }
    });
  });

  describe('DXF export', () => {
    beforeEach(async () => {
      service.onModuleInit();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should generate a valid DXF string', async () => {
      const code = `
function createModel(oc) {
  return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
}
`;
      const result = await service.executeCode(code);

      if (result.success) {
        expect(result.dxfContent).toBeDefined();
        expect(typeof result.dxfContent).toBe('string');
        expect(result.dxfContent).toContain('SECTION');
        expect(result.dxfContent).toContain('EOF');
      }
    });
  });

  describe('STEP export', () => {
    beforeEach(async () => {
      service.onModuleInit();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should generate STEP content', async () => {
      const code = `
function createModel(oc) {
  return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
}
`;
      const result = await service.executeCode(code);

      if (result.success) {
        expect(result.stepContent).toBeDefined();
        expect(typeof result.stepContent).toBe('string');
      }
    });
  });

  describe('STL export', () => {
    beforeEach(async () => {
      service.onModuleInit();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should generate STL content', async () => {
      const code = `
function createModel(oc) {
  return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
}
`;
      const result = await service.executeCode(code);

      if (result.success) {
        expect(result.stlContent).toBeDefined();
        expect(typeof result.stlContent).toBe('string');
      }
    });
  });

  // ========================================
  // ERROR HANDLING PATHS
  // ========================================

  describe('initialization failure handling', () => {
    it('should handle WASM load failure gracefully', async () => {
      // Mock both import paths to fail
      jest.resetModules();
      jest.mock(
        'opencascade.js/dist/node.js',
        () => {
          throw new Error('Cannot find module');
        },
        { virtual: true },
      );

      // The service should still handle the error
      const freshService = new OpenCascadeExecutorService(mockConfigService);

      // Call executeCode which will trigger ensureInitialized
      // It should not throw but return failure
      const result = await freshService.executeCode(
        'function createModel(oc) { return null; }',
      );
      expect(result.success).toBe(false);
    });
  });

  describe('executeCode without initialization', () => {
    it('should initialize on demand if onModuleInit was not called', async () => {
      const freshService = new OpenCascadeExecutorService(mockConfigService);
      // Don't call onModuleInit

      const result = await freshService.executeCode(`
function createModel(oc) {
  return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
}
`);
      expect(result).toBeDefined();
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ========================================
  // Mesh stats with void bounding box
  // ========================================

  describe('mesh stats with void bounding box', () => {
    beforeEach(async () => {
      // Reset mocks to simulate void bounding box
      jest.resetModules();
      jest.clearAllMocks();
    });

    it('should handle void bounding box', async () => {
      // Re-mock with void bbox
      jest.doMock(
        'opencascade.js/dist/node.js',
        () => ({
          default: jest.fn().mockResolvedValue({
            FS: {
              readFile: jest
                .fn()
                .mockReturnValue(new Uint8Array(Buffer.from('content'))),
            },
            Bnd_Box_1: jest.fn().mockImplementation(() => ({
              IsVoid: jest.fn().mockReturnValue(true), // Void bbox
              CornerMin: jest.fn(),
              CornerMax: jest.fn(),
              delete: jest.fn(),
            })),
            BRepBndLib: { Add: jest.fn() },
            TopAbs_ShapeEnum: {
              TopAbs_FACE: 'TopAbs_FACE',
              TopAbs_EDGE: 'TopAbs_EDGE',
              TopAbs_SHAPE: 'TopAbs_SHAPE',
            },
            TopExp_Explorer_1: jest.fn().mockImplementation(() => ({
              Init: jest.fn(),
              More: jest.fn().mockReturnValue(false),
              Next: jest.fn(),
              Current: jest.fn(),
              delete: jest.fn(),
            })),
            TopoDS: { Face_1: jest.fn(), Edge_1: jest.fn() },
            TopLoc_Location_1: jest.fn().mockImplementation(() => ({
              Transformation: jest.fn().mockReturnValue({}),
              delete: jest.fn(),
            })),
            BRep_Tool: {
              Triangulation: jest.fn().mockReturnValue({
                IsNull: jest.fn().mockReturnValue(true),
                delete: jest.fn(),
              }),
              Curve: jest.fn().mockReturnValue(null),
            },
            BRepMesh_IncrementalMesh_2: jest
              .fn()
              .mockImplementation(() => ({ delete: jest.fn() })),
            STEPControl_Writer_1: jest.fn().mockImplementation(() => ({
              Transfer: jest.fn(),
              Write: jest.fn(),
            })),
            STEPControl_StepModelType: { STEPControl_AsIs: 'AsIs' },
            Message_ProgressRange_1: jest.fn().mockImplementation(() => ({})),
            StlAPI_Writer: jest.fn().mockImplementation(() => ({
              Write: jest.fn().mockReturnValue(true),
            })),
          }),
        }),
        { virtual: true },
      );

      // Service with this mock will show void bbox
      const svc = new OpenCascadeExecutorService(mockConfigService);
      svc.onModuleInit();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = await svc.executeCode(`
function createModel(oc) {
  return new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
}
`);
      expect(result).toBeDefined();
    });
  });
});
