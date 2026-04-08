import {
  StateGraph,
  END,
  interrupt,
  CompiledStateGraph,
} from '@langchain/langgraph';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import {
  ExtendedPostWriterStateAnnotation,
  ExtendedPostWriterState,
  GeneratedContent,
} from './extended-post-writer.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

const AGENT_SLUG = 'extended-post-writer';

/**
 * Create the Extended Post Writer graph with HITL
 *
 * Flow:
 * 1. Start → Generate blog post
 * 2. Generate blog → Generate SEO → Generate social → HITL interrupt
 * 3. HITL resume → Route based on decision:
 *    - approve/skip → Finalize
 *    - replace → Finalize (content already in state)
 *    - regenerate → Back to generate blog (with feedback)
 *    - reject → Finalize (marked as rejected)
 * 4. Finalize → End
 *
 * KEY DESIGN DECISIONS:
 * - ExecutionContext flows through entire workflow - no individual context fields
 * - Uses context.conversationId as thread_id in LangGraph config
 * - hitlDecision and hitlFeedback come from HitlBaseState
 * - API Runner handles deliverable creation and version tracking
 * - interrupt() returns content structure for API Runner to process
 */
// Using CompiledStateGraph with broad generics to avoid TS2589 type
// instantiation depth limit caused by deeply nested LangGraph generic types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExtendedPostWriterGraph = CompiledStateGraph<any, any, any>;

export async function createExtendedPostWriterGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
): Promise<ExtendedPostWriterGraph> {
  // Node: Initialize
  async function initializeNode(
    state: ExtendedPostWriterState,
  ): Promise<Partial<ExtendedPostWriterState>> {
    const ctx = state.executionContext;
    const topic = state.userMessage || state.topic;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting content generation for topic: ${topic}`,
    );

    return {
      status: 'generating',
      topic,
      startedAt: Date.now(),
      messages: [new HumanMessage(`Create content about: ${topic}`)],
    };
  }

  // Node: Generate blog post
  async function generateBlogPostNode(
    state: ExtendedPostWriterState,
  ): Promise<Partial<ExtendedPostWriterState>> {
    const ctx = state.executionContext;
    const {
      topic,
      hitlFeedback,
      generationCount,
      tone,
      keywords,
      context: additionalContext,
    } = state;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      hitlFeedback
        ? 'Regenerating blog post with feedback'
        : 'Generating blog post',
      {
        step: 'generate_blog_post',
        progress: 20,
      },
    );

    const keywordsStr =
      keywords && keywords.length > 0
        ? `Keywords to include: ${keywords.join(', ')}`
        : '';

    const contextStr = additionalContext
      ? `Additional context: ${additionalContext}`
      : '';

    const feedbackStr = hitlFeedback
      ? `\n\nPrevious feedback to incorporate: ${hitlFeedback}`
      : '';

    const prompt = `You are a professional content writer. Create a compelling blog post for the following topic.

Topic: ${topic}
Tone: ${tone}
${keywordsStr}
${contextStr}
${feedbackStr}

Generate a well-structured blog post (800-1200 words) with:
- An engaging introduction that hooks the reader
- Clear body sections with subheadings (use markdown ## for headings)
- A compelling conclusion with a call to action

Return ONLY the blog post content in markdown format, no additional text or JSON wrapping.`;

    try {
      const response = await llmClient.callLLM({
        context: ctx,
        userMessage: prompt,
        callerName: `${AGENT_SLUG}:generate-post`,
      });

      return {
        blogPost: response.text.trim(),
        generationCount: generationCount + 1,
        hitlFeedback: null,
        hitlDecision: null,
        messages: [...state.messages, new AIMessage('Blog post generated.')],
      };
    } catch (error) {
      return {
        error: `Failed to generate blog post: ${error instanceof Error ? error.message : String(error)}`,
        status: 'failed',
      };
    }
  }

  // Node: Generate SEO description
  async function generateSeoNode(
    state: ExtendedPostWriterState,
  ): Promise<Partial<ExtendedPostWriterState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Generating SEO description',
      {
        step: 'generate_seo',
        progress: 40,
      },
    );

    const prompt = `Based on the following blog post, create a compelling SEO meta description (150-160 characters) that captures the main value proposition.

BLOG POST:
${state.blogPost}

Return ONLY the SEO description, no additional text.`;

    try {
      const response = await llmClient.callLLM({
        context: ctx,
        userMessage: prompt,
        callerName: `${AGENT_SLUG}:generate-seo`,
      });

      return {
        seoDescription: response.text.trim(),
        messages: [
          ...state.messages,
          new AIMessage('SEO description generated.'),
        ],
      };
    } catch (error) {
      return {
        error: `Failed to generate SEO description: ${error instanceof Error ? error.message : String(error)}`,
        status: 'failed',
      };
    }
  }

  // Node: Generate social posts
  async function generateSocialNode(
    state: ExtendedPostWriterState,
  ): Promise<Partial<ExtendedPostWriterState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Generating social media posts',
      {
        step: 'generate_social',
        progress: 60,
      },
    );

    const prompt = `Based on the following blog post, create 3 social media posts:
1. Twitter/X post (under 280 characters) - engaging hook with key insight
2. LinkedIn post (2-3 paragraphs, professional tone) - valuable takeaways
3. Instagram caption (engaging, conversational, with 3-5 relevant hashtags)

BLOG POST:
${state.blogPost}

Return the posts in JSON format:
{
  "posts": [
    "Twitter post here",
    "LinkedIn post here",
    "Instagram post here"
  ]
}`;

    try {
      const response = await llmClient.callLLM({
        context: ctx,
        userMessage: prompt,
        callerName: `${AGENT_SLUG}:generate-social`,
      });

      // Log the raw response for debugging
      const responseText = response.text.trim();
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `LLM response received (${responseText.length} chars)`,
        {
          step: 'generate_social_parse',
          progress: 65,
          metadata: {
            responsePreview: responseText.substring(0, 200),
            responseLength: responseText.length,
          },
        },
      );

      // Try to parse JSON, but don't fail the whole workflow if it doesn't work
      let socialPosts: string[] = [];
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { posts: string[] };
          socialPosts = parsed.posts || [];
        }
      } catch (parseError) {
        // If JSON parsing fails, try to extract posts from the raw response
        // Look for numbered lists or bullet points
        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          'Failed to parse social posts JSON, attempting to extract from raw response',
          {
            step: 'generate_social_fallback',
            progress: 70,
            metadata: {
              parseError:
                parseError instanceof Error
                  ? parseError.message
                  : String(parseError),
              responseText: responseText.substring(0, 500),
            },
          },
        );

        // Try to find numbered list items (1., 2., 3., etc.)
        const numberedMatches = responseText.match(
          /\d+\.\s+(.+?)(?=\d+\.|$)/gs,
        );
        if (numberedMatches && numberedMatches.length > 0) {
          socialPosts = numberedMatches
            .map((match) => {
              // Remove the number prefix and clean up
              return match.replace(/^\d+\.\s+/, '').trim();
            })
            .filter((post) => post.length > 0);
        }

        // If no numbered list, try bullet points
        if (socialPosts.length === 0) {
          const bulletMatches = responseText.match(
            /[-*•]\s+(.+?)(?=[-*•]|$)/gs,
          );
          if (bulletMatches && bulletMatches.length > 0) {
            socialPosts = bulletMatches
              .map((match) => {
                return match.replace(/^[-*•]\s+/, '').trim();
              })
              .filter((post) => post.length > 0);
          }
        }

        // If still no posts found, use the raw response as a single post (if it's meaningful)
        if (socialPosts.length === 0 && responseText.length > 20) {
          socialPosts = [responseText];
        }
      }

      // If we still have no posts after all parsing attempts, return empty array
      // Don't use placeholder - let the frontend handle empty social posts gracefully
      if (socialPosts.length === 0) {
        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          'No social posts could be extracted from LLM response',
          {
            step: 'generate_social_empty',
            progress: 75,
            metadata: {
              responseText: responseText.substring(0, 500),
              responseLength: responseText.length,
            },
          },
        );
        return {
          socialPosts: [],
          messages: [
            ...state.messages,
            new AIMessage(
              'Social posts generation completed (no posts extracted).',
            ),
          ],
        };
      }

      return {
        socialPosts,
        messages: [...state.messages, new AIMessage('Social posts generated.')],
      };
    } catch (error) {
      // Don't fail the workflow for social posts - return empty array instead of placeholder
      console.error(
        `Social posts generation error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        socialPosts: [],
        messages: [
          ...state.messages,
          new AIMessage(
            'Social posts generation failed (returning empty array).',
          ),
        ],
      };
    }
  }

  // Node: HITL interrupt - waits for human approval of blog post
  // interrupt() pauses the graph and returns the resume value when invoked with Command({ resume: value })
  // On initial call: interrupt() pauses, checkpoints state
  // On resume: interrupt() returns the value passed via Command({ resume: value })
  // NOTE: At this point only blogPost is generated. SEO and social posts come after approval.
  async function hitlInterruptNode(
    state: ExtendedPostWriterState,
  ): Promise<Partial<ExtendedPostWriterState>> {
    const ctx = state.executionContext;

    console.log(
      `🔍 [HITL-NODE] Entering hitlInterruptNode for task ${ctx.conversationId}`,
    );

    // Only blog post is available at this point
    const content = {
      blogPost: state.blogPost,
      seoDescription: '', // Not generated yet
      socialPosts: [], // Not generated yet
    };

    // Emit observability event before interrupt
    await observability.emitHitlWaiting(
      ctx,
      ctx.conversationId,
      content,
      'Blog post ready for review',
    );

    console.log(
      `🔍 [HITL-NODE] About to call interrupt() for task ${ctx.conversationId}`,
    );

    // interrupt() pauses the graph here
    // When resumed with Command({ resume: { decision, feedback, editedContent } }),
    // interrupt() returns that value and execution continues
    // CRITICAL: interrupt() should pause the graph. If it returns undefined, we're waiting for HITL.
    // If it returns a value, we've been resumed and should continue.
    type HitlInterruptResponse =
      | {
          decision: string;
          feedback?: string;
          editedContent?: { blogPost?: string };
        }
      | undefined;
    const hitlResponseRaw: unknown = interrupt({
      reason: 'human_review',
      nodeName: 'hitl_interrupt',
      topic: state.topic,
      content,
      message:
        'Please review the blog post before generating SEO and social content',
    });
    const hitlResponse = hitlResponseRaw as HitlInterruptResponse;

    console.log(
      `🔍 [HITL-NODE] interrupt() returned: ${JSON.stringify(hitlResponse)}`,
    );

    // If hitlResponse is undefined, we're still waiting (graph checkpointed)
    // In LangGraph 1.0+, interrupt() returns undefined on first call and pauses the graph
    // CRITICAL: This return should cause the graph to pause. If the graph continues past this point,
    // it means interrupt() didn't work correctly or the checkpointer isn't configured properly.
    if (!hitlResponse) {
      console.log(
        `🔍 [HITL-NODE] No response from interrupt - graph should pause here. Returning hitl_waiting status.`,
      );
      // Return state that indicates HITL is pending - this should cause graph to pause
      // The graph should NOT continue past this point when interrupt() returns undefined
      return {
        hitlPending: true,
        status: 'hitl_waiting',
        // Ensure we don't accidentally continue - clear any status that might trigger continuation
      };
    }

    // We have a response - extract the decision
    const { decision, feedback, editedContent } = hitlResponse;

    // If user provided edited content with 'replace' decision, update the blog post
    const updatedBlogPost = editedContent?.blogPost || state.blogPost;

    return {
      hitlPending: false,
      hitlDecision: decision as ExtendedPostWriterState['hitlDecision'],
      hitlFeedback: feedback || null,
      blogPost: updatedBlogPost,
      status: decision === 'reject' ? 'rejected' : 'generating', // Will continue to SEO
    };
  }

  // Routing function after HITL
  // After blog post approval, continue to generate SEO and social posts
  function routeAfterHitl(state: ExtendedPostWriterState): string {
    switch (state.hitlDecision) {
      case 'approve':
      case 'skip':
      case 'replace':
        return 'generate_seo'; // Continue to generate SEO and social posts
      case 'reject':
        return 'finalize_rejected';
      case 'regenerate':
        return 'generate_blog_post';
      default:
        throw new Error(`Invalid HITL decision: ${state.hitlDecision}`);
    }
  }

  // Node: Finalize content
  async function finalizeNode(
    state: ExtendedPostWriterState,
  ): Promise<Partial<ExtendedPostWriterState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Finalizing approved content',
      {
        step: 'finalize',
        progress: 90,
      },
    );

    const finalContent: GeneratedContent = {
      blogPost: state.blogPost,
      seoDescription: state.seoDescription,
      socialPosts: state.socialPosts,
    };

    await observability.emitCompleted(
      ctx,
      ctx.conversationId,
      { content: finalContent },
      Date.now() - state.startedAt,
    );

    return {
      finalContent,
      status: 'completed',
      completedAt: Date.now(),
      messages: [
        ...state.messages,
        new AIMessage('Content finalized and ready for publishing.'),
      ],
    };
  }

  // Node: Handle rejection
  async function finalizeRejectedNode(
    state: ExtendedPostWriterState,
  ): Promise<Partial<ExtendedPostWriterState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      `Content rejected: ${state.hitlFeedback}`,
      Date.now() - state.startedAt,
    );

    return {
      status: 'failed',
      error: 'Content rejected by user',
      completedAt: Date.now(),
    };
  }

  // Node: Handle errors
  async function handleErrorNode(
    state: ExtendedPostWriterState,
  ): Promise<Partial<ExtendedPostWriterState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error!,
      Date.now() - state.startedAt,
    );

    return {
      status: 'failed',
      completedAt: Date.now(),
    };
  }

  // Build the graph
  // Flow: initialize → generate_blog_post → HITL → (after approval) generate_seo → generate_social → finalize
  const graph = new StateGraph(ExtendedPostWriterStateAnnotation)
    .addNode('initialize', initializeNode)
    .addNode('generate_blog_post', generateBlogPostNode)
    .addNode('hitl_interrupt', hitlInterruptNode)
    .addNode('generate_seo', generateSeoNode)
    .addNode('generate_social', generateSocialNode)
    .addNode('finalize', finalizeNode)
    .addNode('finalize_rejected', finalizeRejectedNode)
    .addNode('handle_error', handleErrorNode)
    // Edges - Generation flow
    .addEdge('__start__', 'initialize')
    .addEdge('initialize', 'generate_blog_post')
    .addConditionalEdges('generate_blog_post', (state) => {
      if (state.error) return 'handle_error';
      return 'hitl_interrupt'; // Go to HITL right after blog post
    })
    // After HITL - route based on decision
    .addConditionalEdges('hitl_interrupt', routeAfterHitl, {
      generate_blog_post: 'generate_blog_post', // Regenerate if requested
      generate_seo: 'generate_seo', // Continue to SEO after approval
      finalize_rejected: 'finalize_rejected',
    })
    .addConditionalEdges('generate_seo', (state) => {
      if (state.error) return 'handle_error';
      return 'generate_social';
    })
    .addConditionalEdges('generate_social', (state) => {
      if (state.error) return 'handle_error';
      return 'finalize';
    })
    .addEdge('finalize', END)
    .addEdge('finalize_rejected', END)
    .addEdge('handle_error', END);

  // Compile with checkpointer.
  // Cast to ExtendedPostWriterGraph to avoid TS2589 type depth limit.
  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as ExtendedPostWriterGraph;
  return compiled;
}
