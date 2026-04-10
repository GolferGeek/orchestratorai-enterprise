/**
 * Research Dispatcher — non-LLM routing node.
 *
 * Picks the next pending sub-question from the research tree, sets it to
 * 'researching' status, and stores it as the current research target.
 *
 * Domain-agnostic: no legal-specific logic.
 *
 * See: PRD §4.1 — research_dispatcher
 */
import { randomUUID } from 'crypto';
import type { LegalResearchState } from '../legal-research.state';
import type { ResearchTreeNode } from '../legal-research.state';
import type { ObservabilityService } from '../../../../shared/services/observability.service';

export function createResearchDispatcherNode(
  observability: ObservabilityService,
) {
  return async function researchDispatcherNode(
    state: LegalResearchState,
  ): Promise<Partial<LegalResearchState>> {
    const ctx = state.executionContext;

    // Handle redirect action from HITL: replace target branch
    if (state.hitlAction?.type === 'redirect') {
      const { targetNodeId, replacementQuestions } = state.hitlAction;
      const tree = [...state.researchTree.map((n) => ({ ...n }))];
      const targetNode = tree.find((n) => n.id === targetNodeId);

      if (targetNode) {
        // Mark old children as skipped
        const oldChildIds = targetNode.childIds;
        for (const node of tree) {
          if (oldChildIds.includes(node.id)) {
            node.status = 'skipped';
          }
        }

        // Create replacement nodes
        const newPending: string[] = [];
        const newNodes: ResearchTreeNode[] = [];
        targetNode.childIds = [];

        for (const question of replacementQuestions) {
          const id = randomUUID();
          targetNode.childIds.push(id);
          newNodes.push({
            id,
            parentId: targetNodeId,
            question,
            depth: targetNode.depth + 1,
            status: 'pending',
            childIds: [],
          });
          newPending.push(id);
        }

        tree.push(...newNodes);

        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `Redirect: replaced branch under "${targetNode.question.slice(0, 60)}" with ${replacementQuestions.length} new sub-questions`,
          { step: 'lr_research_redirect', progress: 40 },
        );

        // Pick the first new pending node to research
        const nextId = newPending[0];
        const nextNode = tree.find((n) => n.id === nextId);
        if (nextNode) nextNode.status = 'researching';

        return {
          researchTree: tree,
          pendingQuestions: newPending.slice(1),
          currentResearchTarget: nextId,
          hitlAction: undefined, // clear the action
        };
      }
    }

    // Normal dispatch: pick next pending question
    const pending = [...state.pendingQuestions];
    if (pending.length === 0) {
      // No pending questions — this shouldn't happen in normal flow
      return {};
    }

    const nextId = pending.shift()!;
    const tree = state.researchTree.map((n) =>
      n.id === nextId ? { ...n, status: 'researching' as const } : n,
    );

    const nextNode = tree.find((n) => n.id === nextId);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Researching: "${nextNode?.question?.slice(0, 80) ?? nextId}"`,
      {
        step: 'lr_research_dispatch',
        progress: 25,
        nodeId: nextId,
        depth: nextNode?.depth ?? 0,
        pendingCount: pending.length,
      },
    );

    return {
      researchTree: tree,
      pendingQuestions: pending,
      currentResearchTarget: nextId,
    };
  };
}
