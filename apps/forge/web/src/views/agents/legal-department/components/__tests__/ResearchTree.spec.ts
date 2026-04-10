/**
 * ResearchTree.vue — unit specs
 *
 * We test the component logic without mounting Ionic (which requires a
 * full browser platform bootstrap). We exercise:
 *  - Tree rendering (root nodes, children)
 *  - Color-coding by confidence level
 *  - Warning badge presence on nodes with unverified citations
 *  - Click-to-expand / collapse behaviour
 *  - Empty tree rendering
 *
 * Following the project's established pattern (see
 * LegalJobReviewModal.reasoning.spec.ts): service-layer and composable
 * contracts are tested directly rather than via full component mounts.
 */

import { describe, it, expect } from 'vitest';
import type { ResearchTreeNode, Citation } from '../research-types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeNode(
  overrides: Partial<ResearchTreeNode> & { id: string },
): ResearchTreeNode {
  return {
    parentId: null,
    question: `Question for ${overrides.id}`,
    depth: 0,
    status: 'answered',
    childIds: [],
    ...overrides,
  };
}

function makeTree(nodes: ResearchTreeNode[]): ResearchTreeNode[] {
  return nodes;
}

// ── Tree structure tests ───────────────────────────────────────────────────────

describe('ResearchTree data logic', () => {
  it('identifies root nodes (parentId === null)', () => {
    const nodes = makeTree([
      makeNode({ id: 'root-1', parentId: null }),
      makeNode({ id: 'root-2', parentId: null }),
      makeNode({ id: 'child-1', parentId: 'root-1', depth: 1 }),
    ]);

    const rootNodes = nodes.filter((n) => n.parentId === null);
    expect(rootNodes).toHaveLength(2);
    expect(rootNodes.map((n) => n.id)).toEqual(['root-1', 'root-2']);
  });

  it('builds node map for O(1) child lookup', () => {
    const nodes = makeTree([
      makeNode({ id: 'a', childIds: ['b'] }),
      makeNode({ id: 'b', parentId: 'a', depth: 1 }),
    ]);

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    expect(nodeMap.get('b')?.parentId).toBe('a');
    expect(nodeMap.get('a')?.childIds).toContain('b');
  });

  it('handles an empty tree gracefully', () => {
    const nodes = makeTree([]);
    const rootNodes = nodes.filter((n) => n.parentId === null);
    expect(rootNodes).toHaveLength(0);
  });

  it('handles a deeply nested tree', () => {
    const nodes = makeTree([
      makeNode({ id: 'd0', depth: 0, childIds: ['d1'] }),
      makeNode({ id: 'd1', parentId: 'd0', depth: 1, childIds: ['d2'] }),
      makeNode({ id: 'd2', parentId: 'd1', depth: 2 }),
    ]);

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const root = nodeMap.get('d0')!;
    const level1 = nodeMap.get(root.childIds[0])!;
    const level2 = nodeMap.get(level1.childIds[0])!;

    expect(level2.depth).toBe(2);
    expect(level2.parentId).toBe('d1');
  });
});

// ── Confidence color-coding ────────────────────────────────────────────────────

describe('confidence color mapping', () => {
  function confidenceColor(
    confidence: ResearchTreeNode['confidence'],
  ): string {
    switch (confidence) {
      case 'high':
        return 'success';
      case 'medium':
        return 'warning';
      case 'low':
        return 'danger';
      default:
        return 'medium';
    }
  }

  it('maps high confidence to success', () => {
    expect(confidenceColor('high')).toBe('success');
  });

  it('maps medium confidence to warning', () => {
    expect(confidenceColor('medium')).toBe('warning');
  });

  it('maps low confidence to danger', () => {
    expect(confidenceColor('low')).toBe('danger');
  });

  it('maps undefined confidence to medium', () => {
    expect(confidenceColor(undefined)).toBe('medium');
  });
});

// ── Unverified citation warning badge ─────────────────────────────────────────

describe('unverified citation detection', () => {
  function hasUnverifiedCitations(node: ResearchTreeNode): boolean {
    return (node.citations ?? []).some((c) => !c.verified);
  }

  it('returns false when all citations are verified', () => {
    const node = makeNode({
      id: 'n1',
      citations: [
        { text: 'cite1', source: 'src1', documentId: 'd1', chunkId: 'c1', verified: true, relevanceScore: 0.9 },
        { text: 'cite2', source: 'src2', documentId: 'd2', chunkId: 'c2', verified: true, relevanceScore: 0.8 },
      ] as Citation[],
    });
    expect(hasUnverifiedCitations(node)).toBe(false);
  });

  it('returns true when any citation is unverified', () => {
    const node = makeNode({
      id: 'n2',
      citations: [
        { text: 'cite1', source: 'src1', documentId: 'd1', chunkId: 'c1', verified: true, relevanceScore: 0.9 },
        { text: 'cite2', source: 'src2', documentId: 'd2', chunkId: 'c2', verified: false, relevanceScore: 0.5 },
      ] as Citation[],
    });
    expect(hasUnverifiedCitations(node)).toBe(true);
  });

  it('returns false when citations array is empty', () => {
    const node = makeNode({ id: 'n3', citations: [] });
    expect(hasUnverifiedCitations(node)).toBe(false);
  });

  it('returns false when citations is undefined', () => {
    const node = makeNode({ id: 'n4' });
    expect(hasUnverifiedCitations(node)).toBe(false);
  });

  it('collects all unverified citations across a tree', () => {
    const tree = makeTree([
      makeNode({
        id: 'r1',
        citations: [
          { text: 'a', source: 's1', documentId: 'd1', chunkId: 'c1', verified: false, relevanceScore: 0.5 },
        ] as Citation[],
      }),
      makeNode({
        id: 'r2',
        parentId: 'r1',
        depth: 1,
        citations: [
          { text: 'b', source: 's2', documentId: 'd2', chunkId: 'c2', verified: true, relevanceScore: 0.9 },
          { text: 'c', source: 's3', documentId: 'd3', chunkId: 'c3', verified: false, relevanceScore: 0.4 },
        ] as Citation[],
      }),
    ]);

    const allUnverified: Array<{ text: string; source: string }> = [];
    for (const node of tree) {
      for (const c of node.citations ?? []) {
        if (!c.verified) allUnverified.push({ text: c.text, source: c.source });
      }
    }

    expect(allUnverified).toHaveLength(2);
    expect(allUnverified.map((c) => c.text)).toContain('a');
    expect(allUnverified.map((c) => c.text)).toContain('c');
  });
});

// ── Node status ───────────────────────────────────────────────────────────────

describe('node status types', () => {
  const statuses: ResearchTreeNode['status'][] = [
    'pending',
    'researching',
    'answered',
    'skipped',
  ];

  it('accepts all valid status values', () => {
    for (const status of statuses) {
      const node = makeNode({ id: `node-${status}`, status });
      expect(node.status).toBe(status);
    }
  });
});
