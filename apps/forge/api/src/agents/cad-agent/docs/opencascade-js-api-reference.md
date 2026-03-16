# OpenCASCADE.js API Reference

Version: 2.0.0-beta

## Sources
- [opencascade.js GitHub](https://github.com/donalffons/opencascade.js/)
- [opencascade.js Examples](https://github.com/donalffons/opencascade.js-examples)
- [GitHub Issue #106 - STEP Export](https://github.com/donalffons/opencascade.js/issues/106)

## Shape Traversal

### TopExp_Explorer
```javascript
// Use _1 constructor (no args), then call Init()
const explorer = new oc.TopExp_Explorer_1();
explorer.Init(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);

while (explorer.More()) {
  const currentShape = explorer.Current();
  // Cast to specific type
  const face = oc.TopoDS.Face_1(currentShape);

  // Process face...

  explorer.Next();
}
```

## Triangulation / Meshing

### BRepMesh_IncrementalMesh
```javascript
// Pass the FACE (not shape), no .Perform() call needed
new oc.BRepMesh_IncrementalMesh_2(myFace, 0.1, false, 0.5, false);
// Parameters: (face, linearDeflection, isRelative, angularDeflection, isInParallel)
```

### Getting Triangulation from Face
```javascript
const location = new oc.TopLoc_Location_1();
// Third parameter is 0 (not an enum - it's the mesh purpose)
const triangulationHandle = oc.BRep_Tool.Triangulation(face, location, 0);

if (!triangulationHandle.IsNull()) {
  const triangulation = triangulationHandle.get();

  const nbNodes = triangulation.NbNodes();
  const nbTriangles = triangulation.NbTriangles();

  // Access nodes (1-indexed)
  for (let i = 1; i <= nbNodes; i++) {
    const node = triangulation.Node(i);
    const transformed = node.Transformed(location.Transformation());
    const x = transformed.X();
    const y = transformed.Y();
    const z = transformed.Z();
  }

  // Access triangles
  const triangles = triangulation.Triangles();
  for (let i = 1; i <= nbTriangles; i++) {
    const triangle = triangles.Value(i);
    const n1 = triangle.Value(1);
    const n2 = triangle.Value(2);
    const n3 = triangle.Value(3);
  }
}
```

## STEP Export

### STEPControl_Writer (Simple)
```javascript
const writer = new oc.STEPControl_Writer_1();
const progressRange = new oc.Message_ProgressRange_1();

// Transfer shape to writer
writer.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progressRange);

// Write to virtual filesystem
const filename = "/tmp/model.step";
writer.Write(filename);

// Read from virtual filesystem
const content = oc.FS.readFile(filename);
const text = new TextDecoder().decode(content);
```

### STEPCAFControl_Writer (With Colors/Names)
```javascript
const writerCAF = new oc.STEPCAFControl_Writer_1();
writerCAF.SetColorMode(true);
writerCAF.SetNameMode(true);

// Configure precision
oc.Interface_Static.SetIVal("write.precision.mode", 1);
oc.Interface_Static.SetIVal("write.precision.val", 0.1);

const progressRange = new oc.Message_ProgressRange_1();
writerCAF.Transfer_1(doc, oc.STEPControl_StepModelType.STEPControl_AsIs, "", progressRange);
```

## STL Export

### StlAPI_Writer
```javascript
// IMPORTANT: Must mesh first!
new oc.BRepMesh_IncrementalMesh_2(shape, 0.1, false, 0.5, false);

const writer = new oc.StlAPI_Writer();
// Note: No SetASCIIMode method - writes ASCII by default
const progressRange = new oc.Message_ProgressRange_1();

const filename = "/tmp/model.stl";
writer.Write(shape, filename, progressRange);

const content = oc.FS.readFile(filename);
```

## Bounding Box

### Bnd_Box
```javascript
const bbox = new oc.Bnd_Box_1();
oc.BRepBndLib.Add(shape, bbox, false);

// Get values using reference objects
const xmin = { value: 0 }, ymin = { value: 0 }, zmin = { value: 0 };
const xmax = { value: 0 }, ymax = { value: 0 }, zmax = { value: 0 };
bbox.Get(xmin, ymin, zmin, xmax, ymax, zmax);
```

## Type Casting

### TopoDS Casting
```javascript
// Cast shape to specific type
const face = oc.TopoDS.Face_1(shape);
const edge = oc.TopoDS.Edge_1(shape);
const vertex = oc.TopoDS.Vertex_1(shape);
```

## Memory Management

All OpenCASCADE.js objects should be deleted when done:
```javascript
const shape = makeShape();
// ... use shape ...
shape.delete();
```

## Important Notes

1. Constructor variants are numbered: `ClassName_1`, `ClassName_2`, etc.
2. Indices are 1-based (not 0-based) for nodes, triangles, etc.
3. The virtual filesystem is accessed via `oc.FS`
4. Progress ranges use `Message_ProgressRange_1()`
5. Enum values are accessed as `oc.EnumName.EnumValue`
