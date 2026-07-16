/**
 * Question Analysis node — receives the user's legal question, jurisdiction,
 * and context. Produces a restated question, jurisdictions, initial
 * sub-questions, and a research plan. Populates the root node and initial
 * children in the research tree.
 *
 * See: PRD §4.1 — question_analysis
 */
import { randomUUID } from 'crypto';
import type { LegalResearchState } from '../legal-research.state';
import type { ResearchTreeNode } from '../legal-research.state';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import {
  loadWorkflowMemory,
  formatMemoryForPrompt,
  stripMarkdownFences,
} from '../../../nodes/specialist-utils';

const AGENT_SLUG = 'legal-department';

interface QuestionAnalysisOutput {
  restatedQuestion: string;
  jurisdictions: string[];
  initialSubQuestions: Array<{ question: string; priority: number }>;
  researchPlan: string;
}

export function createQuestionAnalysisNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function questionAnalysisNode(
    state: LegalResearchState,
  ): Promise<Partial<LegalResearchState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Analyzing legal question and identifying sub-questions',
      { step: 'lr_question_analysis', progress: 10 },
    );

    try {
      const memory = await loadWorkflowMemory('legal-research');
      const systemMessage = buildSystemPrompt() + formatMemoryForPrompt(memory);
      const userMessage = buildUserMessage(state);

      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage,
        userMessage,
        callerName: `${AGENT_SLUG}:lr-question-analysis`,
        temperature: 0.3,
        maxTokens: 3000,
      });

      const parsed = JSON.parse(
        stripMarkdownFences(response.text),
      ) as QuestionAnalysisOutput;

      // Cap sub-questions to the configured max
      const maxSub = state.researchConfig.maxSubQuestionsPerLevel;
      const subQuestions = parsed.initialSubQuestions
        .sort((a, b) => b.priority - a.priority)
        .slice(0, maxSub);

      // Build research tree: root + initial children
      const rootId = randomUUID();
      const rootNode: ResearchTreeNode = {
        id: rootId,
        parentId: null,
        question: parsed.restatedQuestion,
        depth: 0,
        status: 'answered', // root is "answered" by the analysis itself
        findings: parsed.researchPlan,
        childIds: [],
        confidence: undefined,
      };

      const childNodes: ResearchTreeNode[] = subQuestions.map((sq) => {
        const childId = randomUUID();
        rootNode.childIds.push(childId);
        return {
          id: childId,
          parentId: rootId,
          question: sq.question,
          depth: 1,
          status: 'pending' as const,
          childIds: [],
        };
      });

      const researchTree = [rootNode, ...childNodes];
      const pendingQuestions = childNodes.map((n) => n.id);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Question analysis complete: ${subQuestions.length} sub-questions identified`,
        {
          step: 'lr_question_analysis_complete',
          progress: 15,
          subQuestionCount: subQuestions.length,
          jurisdictions: parsed.jurisdictions,
        },
      );

      return {
        researchTree,
        pendingQuestions,
        currentDepth: 1,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Question analysis failed: ${msg}`,
        Date.now() - state.startedAt,
      );
      return { error: `Question analysis: ${msg}`, status: 'failed' };
    }
  };
}

function buildSystemPrompt(): string {
  return `You are a Chief Legal Officer performing question analysis for a legal research workflow.

Given a legal question, jurisdiction, practice area, and key facts, produce a structured analysis.

OUTPUT FORMAT (JSON only, no markdown):
{
  "restatedQuestion": "A precise, unambiguous restatement of the legal question",
  "jurisdictions": ["List of in-scope jurisdictions"],
  "initialSubQuestions": [
    { "question": "Sub-question text", "priority": 1 }
  ],
  "researchPlan": "Brief description of research strategy and ordering"
}

RULES:
- Generate 2-5 initial sub-questions that must be answered to address the main question
- Each sub-question should be specific and researchable
- Priority: higher number = higher priority
- The restated question should be unambiguous and capture the full scope
- Consider both substantive law and procedural aspects
- If jurisdiction is specified, focus there; if not, note applicable jurisdictions

OUTPUT: Generate ONLY the JSON. No preamble, no explanation.`;
}

function buildUserMessage(state: LegalResearchState): string {
  let msg = `Legal Question: ${state.userMessage}\n`;
  if (state.jurisdiction) msg += `Jurisdiction: ${state.jurisdiction}\n`;
  if (state.practiceArea) msg += `Practice Area: ${state.practiceArea}\n`;
  if (state.keyFacts) msg += `Key Facts: ${state.keyFacts}\n`;
  msg += `\nResearch Configuration:\n`;
  msg += `- Max depth: ${state.researchConfig.maxDepth}\n`;
  msg += `- Max sub-questions per level: ${state.researchConfig.maxSubQuestionsPerLevel}\n`;
  return msg;
}
