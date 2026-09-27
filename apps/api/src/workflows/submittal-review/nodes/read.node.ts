import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { WorkflowDocumentsService } from '../../shared/documents/workflow-documents.service';
import { reportProgress } from '../../shared/runs';
import type { SpecLibraryService } from '../spec-library.service';
import type { SubmittalReviewState } from '../submittal-review.state';

/** The specification section (from the knowledge base) and the submittal (pasted, or its one document). */
export function createReadNode(deps: { specs: SpecLibraryService; documents: WorkflowDocumentsService }) {
  return async (state: SubmittalReviewState, config: LangGraphRunnableConfig): Promise<Partial<SubmittalReviewState>> => {
    const context = state.executionContext;
    await reportProgress(config, 'read', 10, `Loading section ${state.specSection} and the submittal`);
    if (state.submittalText && state.documents.length > 0) throw new Error('Give the submittal as text or as one document, not both');
    if (!state.submittalText && state.documents.length !== 1) throw new Error('Give the submittal as text or as exactly one document');
    const specText = await deps.specs.text(context.orgSlug, state.specSection);
    const submittalText = state.submittalText ?? (await deps.documents.text(context, state.documents[0]!));
    return { specText, submittalText };
  };
}
