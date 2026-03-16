import { MemorySaver, Command } from '@langchain/langgraph';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { ExtendedPostWriterState } from './extended-post-writer.state';
import { createExtendedPostWriterGraph } from './extended-post-writer.graph';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

/**
 * Unit tests for createExtendedPostWriterGraph
 *
 * Tests the Extended Post Writer graph by actually invoking it via graph.invoke().
 * Uses MemorySaver for test checkpointing and Command for HITL resume.
 *
 * CRITICAL: This agent relies heavily on HITL (Human-In-The-Loop) functionality.
 * Tests validate:
 * - HITL interruption at the correct point (after blog post generation)
 * - HITL resume with different decisions (approve, regenerate, reject, replace)
 * - Content flow through HITL (blog post only at interrupt, SEO/social after approval)
 * - ExecutionContext preservation through HITL workflow
 * - Error handling and routing to handle_error node
 * - Social posts JSON parsing (valid JSON, fallbacks)
 */
describe('createExtendedPostWriterGraph', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let mockCheckpointer: jest.Mocked<PostgresCheckpointerService>;
  let mockExecutionContext: ReturnType<typeof createMockExecutionContext>;
  let memorySaver: MemorySaver;

  async function buildGraph() {
    return createExtendedPostWriterGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );
  }

  function initialState(): Partial<ExtendedPostWriterState> {
    return {
      executionContext: mockExecutionContext,
      userMessage: 'AI and the future of work',
      tone: 'professional',
      keywords: ['AI', 'automation', 'future'],
      generationCount: 0,
    };
  }

  beforeEach(() => {
    memorySaver = new MemorySaver();

    mockExecutionContext = createMockExecutionContext({
      conversationId: 'conv-123',
      userId: 'user-456',
      conversationId: 'conv-789',
      orgSlug: 'org-abc',
      agentSlug: 'extended-post-writer',
      agentType: 'langgraph',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });

    // Default: blog post LLM call succeeds
    mockLLMClient = {
      callLLM: jest.fn().mockResolvedValue({
        text: '## AI and the Future of Work\n\nBlog post content here...',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      }),
    } as any;

    mockObservability = {
      emit: jest.fn().mockResolvedValue(undefined),
      emitStarted: jest.fn().mockResolvedValue(undefined),
      emitProgress: jest.fn().mockResolvedValue(undefined),
      emitHitlWaiting: jest.fn().mockResolvedValue(undefined),
      emitCompleted: jest.fn().mockResolvedValue(undefined),
      emitFailed: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockCheckpointer = {
      getSaver: jest.fn().mockResolvedValue(memorySaver),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Graph creation
  // ---------------------------------------------------------------------------

  describe('Graph Creation', () => {
    it('should create a compiled graph with checkpointer', async () => {
      const graph = await buildGraph();
      expect(graph).toBeDefined();
      expect(mockCheckpointer.getSaver).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Happy path: initialize → generate_blog_post → hitl_interrupt (pause)
  // ---------------------------------------------------------------------------

  describe('Initial invocation pauses at HITL interrupt', () => {
    it('should pause at hitl_interrupt with blog post already generated', async () => {
      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-approve' } };

      const result = (await graph.invoke(
        initialState(),
        config,
      )) as unknown as ExtendedPostWriterState;

      // When interrupt() is called, LangGraph internally throws NodeInterrupt and
      // returns the state as checkpointed BEFORE hitlInterruptNode returned.
      // The status is "generating" (set by generate_blog_post node).
      // Blog post must have been generated before the interrupt.
      expect(result.blogPost).toBeTruthy();
      expect(result.blogPost).toContain('AI and the Future of Work');
      // generationCount was incremented by generate_blog_post
      expect(result.generationCount).toBe(1);
    });

    it('should call emitStarted and emitProgress during initial invocation', async () => {
      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-observability' } };

      await graph.invoke(initialState(), config);

      expect(mockObservability.emitStarted).toHaveBeenCalledTimes(1);
      expect(mockObservability.emitProgress).toHaveBeenCalled();
      expect(mockObservability.emitHitlWaiting).toHaveBeenCalledTimes(1);
    });

    it('should preserve ExecutionContext through initial invocation', async () => {
      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-ctx' } };

      const result = (await graph.invoke(
        initialState(),
        config,
      )) as unknown as ExtendedPostWriterState;

      expect(result.executionContext).toBeDefined();
      expect(result.executionContext.conversationId).toBe('task-123');
      expect(result.executionContext.userId).toBe('user-456');
      expect(result.executionContext.agentSlug).toBe('extended-post-writer');
    });

    it('should call LLM once for blog post generation before HITL', async () => {
      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-llm-count' } };

      await graph.invoke(initialState(), config);

      // Only the blog post LLM call should have happened before HITL pause
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(1);
    });

    it('should set generationCount to 1 after first blog post generation', async () => {
      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-gen-count' } };

      const result = (await graph.invoke(
        initialState(),
        config,
      )) as unknown as ExtendedPostWriterState;

      expect(result.generationCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Happy path: approve decision → SEO → social → finalize
  // ---------------------------------------------------------------------------

  describe('Approve decision path', () => {
    it('should complete successfully with approve decision', async () => {
      // Blog (1st call), SEO (2nd call), Social (3rd call)
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '## Blog Post\nContent here...',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        })
        .mockResolvedValueOnce({
          text: 'Discover how AI is reshaping work as we know it.',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        })
        .mockResolvedValueOnce({
          text: '{"posts": ["Tweet content", "LinkedIn content", "Instagram content"]}',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        });

      const graph = await buildGraph();
      const threadId = 'thread-approve-full';
      const config = { configurable: { thread_id: threadId } };

      // First invoke — pauses at HITL
      // (status is "generating" from generate_blog_post; hitlInterruptNode hasn't returned yet)
      const pausedResult = (await graph.invoke(
        initialState(),
        config,
      )) as unknown as ExtendedPostWriterState;
      expect(pausedResult.blogPost).toBeTruthy();

      // Resume with approve
      const finalResult = (await graph.invoke(
        new Command({ resume: { decision: 'approve' } }),
        config,
      )) as unknown as ExtendedPostWriterState;

      expect(finalResult.status).toBe('completed');
      expect(finalResult.finalContent).toBeDefined();
      expect(finalResult.finalContent!.blogPost).toContain('Blog Post');
      expect(finalResult.finalContent!.seoDescription).toBe(
        'Discover how AI is reshaping work as we know it.',
      );
      expect(finalResult.finalContent!.socialPosts).toHaveLength(3);
      expect(finalResult.finalContent!.socialPosts[0]).toBe('Tweet content');
    });

    it('should call emitCompleted on approve path', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: 'Blog post content',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        })
        .mockResolvedValueOnce({
          text: 'SEO description',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        })
        .mockResolvedValueOnce({
          text: '{"posts": ["Post 1", "Post 2", "Post 3"]}',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        });

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-emit-completed' } };

      await graph.invoke(initialState(), config);
      await graph.invoke(
        new Command({ resume: { decision: 'approve' } }),
        config,
      );

      expect(mockObservability.emitCompleted).toHaveBeenCalledTimes(1);
    });

    it('should call LLM three times total for approve path (blog + SEO + social)', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: 'Blog post',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        })
        .mockResolvedValueOnce({
          text: 'SEO',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        })
        .mockResolvedValueOnce({
          text: '{"posts": ["T", "L", "I"]}',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        });

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-3-calls' } };

      await graph.invoke(initialState(), config);
      await graph.invoke(
        new Command({ resume: { decision: 'approve' } }),
        config,
      );

      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Skip decision (same routing as approve → generate_seo)
  // ---------------------------------------------------------------------------

  describe('Skip decision path', () => {
    it('should complete successfully with skip decision', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: 'Blog content',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        })
        .mockResolvedValueOnce({
          text: 'SEO description',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        })
        .mockResolvedValueOnce({
          text: '{"posts": ["T", "L", "I"]}',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        });

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-skip' } };

      await graph.invoke(initialState(), config);
      const result = (await graph.invoke(
        new Command({ resume: { decision: 'skip' } }),
        config,
      )) as unknown as ExtendedPostWriterState;

      expect(result.status).toBe('completed');
      expect(result.finalContent).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Reject decision → finalize_rejected
  // ---------------------------------------------------------------------------

  describe('Reject decision path', () => {
    it('should finalize as rejected with reject decision', async () => {
      // Only blog post LLM call needed before HITL
      mockLLMClient.callLLM.mockResolvedValueOnce({
        text: 'Blog post content',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      });

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-reject' } };

      await graph.invoke(initialState(), config);
      const result = (await graph.invoke(
        new Command({
          resume: { decision: 'reject', feedback: 'Not good enough' },
        }),
        config,
      )) as unknown as ExtendedPostWriterState;

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Content rejected by user');
    });

    it('should call emitFailed on reject path', async () => {
      mockLLMClient.callLLM.mockResolvedValueOnce({
        text: 'Blog post content',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      });

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-reject-emit' } };

      await graph.invoke(initialState(), config);
      await graph.invoke(
        new Command({ resume: { decision: 'reject' } }),
        config,
      );

      expect(mockObservability.emitFailed).toHaveBeenCalled();
    });

    it('should NOT call LLM for SEO or social on reject path', async () => {
      mockLLMClient.callLLM.mockResolvedValueOnce({
        text: 'Blog post content',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      });

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-reject-no-llm' } };

      await graph.invoke(initialState(), config);
      await graph.invoke(
        new Command({ resume: { decision: 'reject' } }),
        config,
      );

      // Only 1 LLM call for the blog post
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Replace decision → uses edited content → SEO → social → finalize
  // ---------------------------------------------------------------------------

  describe('Replace decision path', () => {
    it('should use edited content from replace decision', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: 'Original blog post',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        })
        .mockResolvedValueOnce({
          text: 'SEO for edited content',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        })
        .mockResolvedValueOnce({
          text: '{"posts": ["T", "L", "I"]}',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        });

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-replace' } };

      await graph.invoke(initialState(), config);
      const result = (await graph.invoke(
        new Command({
          resume: {
            decision: 'replace',
            editedContent: {
              blogPost: '## Edited Blog Post\nUser-edited content here.',
              seoDescription: '',
              socialPosts: [],
            },
          },
        }),
        config,
      )) as unknown as ExtendedPostWriterState;

      expect(result.status).toBe('completed');
      // The blog post in finalContent should be the user-edited version
      expect(result.finalContent!.blogPost).toContain('Edited Blog Post');
    });
  });

  // ---------------------------------------------------------------------------
  // Regenerate decision → back to generate_blog_post with feedback → HITL again
  // ---------------------------------------------------------------------------

  describe('Regenerate decision path', () => {
    it('should regenerate blog post with feedback and pause at HITL again', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: '## First Blog Post\nOriginal content.',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        })
        .mockResolvedValueOnce({
          text: '## Improved Blog Post\nImproved content based on feedback.',
          usage: { promptTokens: 120, completionTokens: 250, totalTokens: 370 },
        });

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-regen' } };

      // First invoke — generates first blog post, pauses at HITL
      // (status is "generating" from generate_blog_post; hitlInterruptNode hasn't returned yet)
      const firstPause = await graph.invoke(initialState(), config);
      expect(firstPause.blogPost).toContain('First Blog Post');
      expect(firstPause.generationCount).toBe(1);

      // Resume with regenerate + feedback
      const secondPause = await graph.invoke(
        new Command({
          resume: {
            decision: 'regenerate',
            feedback: 'Make it more concise and add examples.',
          },
        }),
        config,
      );

      // Should pause at HITL again with the new blog post
      // (status is "generating" from second generate_blog_post call)
      expect(secondPause.blogPost).toContain('Improved Blog Post');
      expect(secondPause.generationCount).toBe(2);
    });

    it('should clear hitlFeedback after regeneration', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: 'First blog post',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        })
        .mockResolvedValueOnce({
          text: 'Regenerated blog post',
          usage: { promptTokens: 120, completionTokens: 250, totalTokens: 370 },
        });

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-regen-clear' } };

      await graph.invoke(initialState(), config);
      const result = (await graph.invoke(
        new Command({
          resume: { decision: 'regenerate', feedback: 'Improve the tone' },
        }),
        config,
      )) as unknown as ExtendedPostWriterState;

      // After regeneration, hitlFeedback should be cleared
      expect(result.hitlFeedback).toBeNull();
      expect(result.hitlDecision).toBeNull();
    });

    it('should call LLM with feedback in regenerate prompt', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: 'First blog post',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        })
        .mockResolvedValueOnce({
          text: 'Regenerated blog post',
          usage: { promptTokens: 120, completionTokens: 250, totalTokens: 370 },
        });

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-regen-prompt' } };

      await graph.invoke(initialState(), config);
      await graph.invoke(
        new Command({
          resume: { decision: 'regenerate', feedback: 'Add more examples' },
        }),
        config,
      );

      // Second LLM call should include the feedback in the prompt
      const secondCallArgs = (mockLLMClient.callLLM as jest.Mock).mock.calls[1];
      expect(secondCallArgs[0].userMessage).toContain('Add more examples');
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling: blog post generation fails
  // ---------------------------------------------------------------------------

  describe('Blog post generation error', () => {
    it('should route to handle_error when blog post LLM fails', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM timeout'));

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-blog-error' } };

      const result = (await graph.invoke(
        initialState(),
        config,
      )) as unknown as ExtendedPostWriterState;

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Failed to generate blog post');
      expect(result.error).toContain('LLM timeout');
    });

    it('should call emitFailed when blog post generation fails', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('Network error'));

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-blog-emit-fail' } };

      await graph.invoke(initialState(), config);

      expect(mockObservability.emitFailed).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling: SEO generation fails
  // ---------------------------------------------------------------------------

  describe('SEO generation error', () => {
    it('should route to handle_error when SEO LLM fails', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: 'Blog post content',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        })
        .mockRejectedValueOnce(new Error('SEO LLM error'));

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-seo-error' } };

      await graph.invoke(initialState(), config);
      const result = (await graph.invoke(
        new Command({ resume: { decision: 'approve' } }),
        config,
      )) as unknown as ExtendedPostWriterState;

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Failed to generate SEO description');
    });
  });

  // ---------------------------------------------------------------------------
  // Social posts JSON parsing
  // ---------------------------------------------------------------------------

  describe('Social posts JSON parsing', () => {
    async function runToSocialPosts(
      llmResponses: Array<{ text: string }>,
    ): Promise<ExtendedPostWriterState> {
      const defaultUsage = {
        promptTokens: 50,
        completionTokens: 30,
        totalTokens: 80,
      };
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: 'Blog post content',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        })
        .mockResolvedValueOnce({
          text: 'SEO description',
          usage: defaultUsage,
        });

      for (const resp of llmResponses) {
        mockLLMClient.callLLM.mockResolvedValueOnce({
          text: resp.text,
          usage: defaultUsage,
        });
      }

      const graph = await buildGraph();
      const config = {
        configurable: {
          thread_id: `thread-social-${Date.now()}-${Math.random()}`,
        },
      };

      await graph.invoke(initialState(), config);
      return graph.invoke(
        new Command({ resume: { decision: 'approve' } }),
        config,
      ) as Promise<ExtendedPostWriterState>;
    }

    it('should parse valid JSON social posts response', async () => {
      const result = await runToSocialPosts([
        {
          text: '{"posts": ["Tweet post", "LinkedIn post", "Instagram post"]}',
        },
      ]);

      expect(result.status).toBe('completed');
      expect(result.finalContent!.socialPosts).toHaveLength(3);
      expect(result.finalContent!.socialPosts[0]).toBe('Tweet post');
    });

    it('should parse numbered list when JSON block is malformed', async () => {
      // The fallback (numbered/bullet/raw) only runs when JSON.parse THROWS.
      // To trigger this: response must contain a `{...}` block (so jsonMatch is non-null)
      // but the content must be invalid JSON so JSON.parse throws.
      const result = await runToSocialPosts([
        {
          text: '{ 1. First social post\n2. Second social post\n3. Third social post }',
        },
      ]);

      expect(result.status).toBe('completed');
      expect(result.finalContent!.socialPosts.length).toBeGreaterThan(0);
    });

    it('should parse bullet list when JSON block is malformed', async () => {
      // Has a {..} block that fails JSON.parse, triggering the bullet list fallback
      const result = await runToSocialPosts([
        {
          text: '{ - First bullet post\n- Second bullet post\n- Third bullet post }',
        },
      ]);

      expect(result.status).toBe('completed');
      expect(result.finalContent!.socialPosts.length).toBeGreaterThan(0);
    });

    it('should return empty array when social posts LLM throws', async () => {
      // Override: blog (success), SEO (success), social (throw)
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: 'Blog post',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        })
        .mockResolvedValueOnce({
          text: 'SEO description',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        })
        .mockRejectedValueOnce(new Error('Social LLM error'));

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-social-error' } };

      await graph.invoke(initialState(), config);
      const result = (await graph.invoke(
        new Command({ resume: { decision: 'approve' } }),
        config,
      )) as unknown as ExtendedPostWriterState;

      // Social failure should not fail the workflow — returns empty array
      expect(result.status).toBe('completed');
      expect(result.finalContent!.socialPosts).toEqual([]);
    });

    it('should return empty array when response has no extractable content', async () => {
      // Very short response that cannot be parsed as JSON, numbered list, or bullets
      const result = await runToSocialPosts([{ text: 'ok' }]);

      expect(result.status).toBe('completed');
      expect(result.finalContent!.socialPosts).toEqual([]);
    });

    it('should use raw response as single post when JSON block is malformed and no list structure', async () => {
      // Has a {..} block that fails JSON.parse, no numbered/bullet list → falls through to raw
      // The raw response stored in socialPosts is the full responseText (not just the content inside {})
      const wrappedResponse =
        '{ This is a long social media post content that is definitely more than 20 chars total }';
      const result = await runToSocialPosts([{ text: wrappedResponse }]);

      expect(result.status).toBe('completed');
      // Should have been captured as a single post from raw response
      expect(result.finalContent!.socialPosts.length).toBe(1);
      expect(result.finalContent!.socialPosts[0]).toBe(wrappedResponse);
    });
  });

  // ---------------------------------------------------------------------------
  // Input parameter handling
  // ---------------------------------------------------------------------------

  describe('Input parameter handling', () => {
    it('should use userMessage as topic when topic is not set', async () => {
      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-user-msg' } };

      const state: Partial<ExtendedPostWriterState> = {
        executionContext: mockExecutionContext,
        userMessage: 'Topic from userMessage',
        generationCount: 0,
      };

      const result = (await graph.invoke(
        state,
        config,
      )) as unknown as ExtendedPostWriterState;

      expect(result.topic).toBe('Topic from userMessage');
    });

    it('should include keywords in blog post prompt', async () => {
      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-keywords' } };

      await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Test topic',
          keywords: ['keyword1', 'keyword2'],
          generationCount: 0,
        },
        config,
      );

      const callArgs = (mockLLMClient.callLLM as jest.Mock).mock.calls[0];
      expect(callArgs[0].userMessage).toContain('keyword1');
      expect(callArgs[0].userMessage).toContain('keyword2');
    });

    it('should include tone in blog post prompt', async () => {
      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-tone' } };

      await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Test topic',
          tone: 'casual',
          generationCount: 0,
        },
        config,
      );

      const callArgs = (mockLLMClient.callLLM as jest.Mock).mock.calls[0];
      expect(callArgs[0].userMessage).toContain('casual');
    });

    it('should include additional context in blog post prompt', async () => {
      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-context' } };

      await graph.invoke(
        {
          executionContext: mockExecutionContext,
          userMessage: 'Test topic',
          context: 'Background information for the blog',
          generationCount: 0,
        },
        config,
      );

      const callArgs = (mockLLMClient.callLLM as jest.Mock).mock.calls[0];
      expect(callArgs[0].userMessage).toContain(
        'Background information for the blog',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Observability integration
  // ---------------------------------------------------------------------------

  describe('Observability integration', () => {
    it('should pass ExecutionContext to all observability calls', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({
          text: 'Blog post',
          usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        })
        .mockResolvedValueOnce({
          text: 'SEO',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        })
        .mockResolvedValueOnce({
          text: '{"posts": ["T", "L", "I"]}',
          usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        });

      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-obs-ctx' } };

      await graph.invoke(initialState(), config);
      await graph.invoke(
        new Command({ resume: { decision: 'approve' } }),
        config,
      );

      // emitStarted should be called with the ExecutionContext
      const startedCall = (mockObservability.emitStarted as jest.Mock).mock
        .calls[0];
      expect(startedCall[0]).toMatchObject({ conversationId: 'conv-123' });
    });

    it('should emit emitHitlWaiting with blog post content at interrupt', async () => {
      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-hitl-content' } };

      await graph.invoke(initialState(), config);

      const hitlCall = (mockObservability.emitHitlWaiting as jest.Mock).mock
        .calls[0];
      // The content argument (3rd param) should contain the blogPost
      const content = hitlCall[2];
      expect(content.blogPost).toBeTruthy();
      // SEO and social should be empty at interrupt time
      expect(content.seoDescription).toBe('');
      expect(content.socialPosts).toEqual([]);
    });

    it('should emit emitProgress events during generation steps', async () => {
      const graph = await buildGraph();
      const config = { configurable: { thread_id: 'thread-progress' } };

      await graph.invoke(initialState(), config);

      // emitProgress should be called at least once for blog post generation step
      expect(mockObservability.emitProgress).toHaveBeenCalled();
      const progressCalls = (mockObservability.emitProgress as jest.Mock).mock
        .calls;
      // Verify progress data includes step info
      const blogProgressCall = progressCalls.find(
        (call) => call[3]?.step === 'generate_blog_post',
      );
      expect(blogProgressCall).toBeDefined();
    });
  });
});
