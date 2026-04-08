import { StateGraph, END, CompiledStateGraph } from '@langchain/langgraph';
import {
  BusinessAutomationAdvisorStateAnnotation,
  BusinessAutomationAdvisorState,
  AgentRecommendation,
} from './business-automation-advisor.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const AGENT_SLUG = 'business-automation-advisor';

/**
 * Fallback recommendations when LLM generation fails
 * Ported from N8N workflow fallback data
 */
const FALLBACK_RECOMMENDATIONS: AgentRecommendation[] = [
  {
    name: 'Smart Appointment Scheduler',
    tagline: 'Automate booking, reminders, and calendar management',
    description:
      'Handles appointment scheduling across multiple calendars, sends automated reminders via email and SMS, and manages rescheduling requests without manual intervention.',
    use_case_example:
      'When a client requests an appointment via email or web form, this agent checks availability, books the slot, sends confirmation, and sets up automated reminders.',
    time_saved: '3-5 hours per week',
    wow_factor:
      'Learns optimal scheduling patterns based on your historical booking data',
    category: 'Admin',
  },
  {
    name: 'Invoice Chaser Pro',
    tagline: 'Never manually follow up on unpaid invoices again',
    description:
      'Automatically tracks invoice payment status and sends personalized, progressively urgent follow-up messages to clients with outstanding balances.',
    use_case_example:
      'When an invoice is 7 days overdue, sends a friendly reminder. At 14 days, escalates tone. At 30 days, alerts you for personal intervention.',
    time_saved: '4-6 hours per week',
    wow_factor:
      'Adjusts communication style based on client payment history and relationship',
    category: 'Finance',
  },
  {
    name: 'Lead Response Lightning',
    tagline: 'Engage new leads within 60 seconds automatically',
    description:
      'Instantly responds to new lead inquiries with personalized messages, qualifies prospects with intelligent questions, and routes hot leads to your sales team immediately.',
    use_case_example:
      "When someone fills out your contact form, instantly sends a personalized email, asks qualifying questions, and alerts your team if they're a high-value prospect.",
    time_saved: '10+ hours per week',
    wow_factor:
      'Increases conversion rates by 30-40% through instant response times',
    category: 'Sales',
  },
  {
    name: 'Meeting Notes & Action Tracker',
    tagline: 'Turn every meeting into actionable next steps automatically',
    description:
      'Records meetings, generates summaries, extracts action items, assigns tasks to team members, and sends follow-up reminders to ensure nothing falls through the cracks.',
    use_case_example:
      'After each client call, automatically sends a summary email with key points discussed, action items with owners and due dates, and schedules follow-up reminders.',
    time_saved: '2-3 hours per week',
    wow_factor:
      'Integrates with your project management tools to create tasks automatically',
    category: 'Operations',
  },
  {
    name: 'Social Media Content Recycler',
    tagline: 'Keep your social presence active without daily effort',
    description:
      'Analyzes your best-performing content, repurposes it for different platforms, and schedules posts automatically to maintain consistent social media presence.',
    use_case_example:
      'When you publish a blog post, creates 10 social media variations optimized for LinkedIn, Twitter, and Instagram, and schedules them over the next month.',
    time_saved: '5-8 hours per week',
    wow_factor:
      'Learns which content types perform best and optimizes posting times',
    category: 'Marketing',
  },
  {
    name: 'Customer Onboarding Autopilot',
    tagline: 'Welcome new customers with a flawless automated experience',
    description:
      'Guides new customers through setup, sends helpful resources at the right time, checks in on progress, and escalates to your team only when needed.',
    use_case_example:
      'When someone signs up, sends welcome email immediately, setup guide after 1 day, tips after 3 days, and checks in after 1 week with personalized help.',
    time_saved: '6-10 hours per week',
    wow_factor:
      'Personalizes the journey based on customer type and engagement level',
    category: 'Customer Service',
  },
  {
    name: 'Expense Report Auto-Processor',
    tagline: 'Turn receipt photos into categorized expense reports instantly',
    description:
      'Scans receipts via photo or email, extracts data using OCR, categorizes expenses, checks policy compliance, and submits reports for approval automatically.',
    use_case_example:
      'When you snap a photo of a receipt, agent extracts amount, vendor, date, categorizes it (meals, travel, etc.), and adds it to your monthly expense report.',
    time_saved: '2-4 hours per week',
    wow_factor:
      'Flags policy violations before submission to prevent approval delays',
    category: 'Finance',
  },
  {
    name: 'Email Newsletter Auto-Curator',
    tagline:
      'Generate engaging newsletters from your content library automatically',
    description:
      'Analyzes your blog posts, social media, and industry news, curates the most relevant content, writes compelling copy, and schedules newsletter distribution.',
    use_case_example:
      'Each month, scans your content, picks top 5 articles, writes summaries with your brand voice, designs layout, and sends to your email list.',
    time_saved: '4-6 hours per month',
    wow_factor: 'A/B tests subject lines and content to maximize open rates',
    category: 'Marketing',
  },
];

/**
 * Create the Business Automation Advisor graph
 *
 * Flow:
 * 1. Start → Normalize Industry (LLM call with gpt-4o-mini)
 * 2. Normalize → Generate Ideas (LLM call with gpt-4o)
 * 3. Generate → End
 */
// Using CompiledStateGraph with broad generics to avoid TS2589 type
// instantiation depth limit caused by deeply nested LangGraph generic types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BusinessAutomationAdvisorGraph = CompiledStateGraph<any, any, any>;

export async function createBusinessAutomationAdvisorGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
): Promise<BusinessAutomationAdvisorGraph> {
  // Node: Start and normalize industry
  async function normalizeIndustryNode(
    state: BusinessAutomationAdvisorState,
  ): Promise<Partial<BusinessAutomationAdvisorState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Analyzing industry: ${state.industryInput}`,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Normalizing industry name',
      {
        step: 'normalize_industry',
        progress: 20,
      },
    );

    // Prompt from N8N workflow (normalize industry)
    const prompt = `You are a business industry classifier. Return ONLY valid JSON (no markdown, no code blocks):
{
  "normalized_industry": "Professional industry name (2-5 words)",
  "description": "Brief description (1 sentence)",
  "common_business_types": "Related business types"
}

Examples:
Input: "dentist"
Output: {"normalized_industry": "Dental Practice", "description": "Healthcare providers specializing in oral health and dental care", "common_business_types": "general dentistry, orthodontics, periodontics"}

Input: "I sell stuff online"
Output: {"normalized_industry": "E-commerce Business", "description": "Online retail business selling products to consumers", "common_business_types": "online stores, dropshipping, marketplace sellers"}

Now process: ${state.industryInput}`;

    try {
      // Use claude-haiku for normalization (fast, cheap)
      const normalizeContext: ExecutionContext = {
        ...ctx,
        model: 'claude-haiku-4-5-20251001',
      };

      const response = await llmClient.callLLM({
        context: normalizeContext,
        userMessage: prompt,
        temperature: 0.3,
        maxTokens: 200,
        callerName: `${AGENT_SLUG}:normalize-industry`,
      });

      // Parse the JSON response
      const cleaned = response.text
        .replace(/```json\n?/g, '')
        .replace(/```/g, '')
        .trim();

      try {
        const data = JSON.parse(cleaned) as Record<string, unknown>;
        return {
          normalizedIndustry:
            (data.normalized_industry as string) || state.industryInput,
          industryDescription:
            (data.description as string) || 'Business industry',
          commonBusinessTypes: (data.common_business_types as string) || '',
          status: 'generating',
        };
      } catch {
        // Fallback if JSON parsing fails
        return {
          normalizedIndustry: state.industryInput,
          industryDescription: `Business in the ${state.industryInput} industry`,
          commonBusinessTypes: '',
          status: 'generating',
        };
      }
    } catch {
      // If normalization fails, continue with raw input
      return {
        normalizedIndustry: state.industryInput,
        industryDescription: `Business in the ${state.industryInput} industry`,
        commonBusinessTypes: '',
        status: 'generating',
      };
    }
  }

  // Node: Generate agent ideas
  async function generateIdeasNode(
    state: BusinessAutomationAdvisorState,
  ): Promise<Partial<BusinessAutomationAdvisorState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Generating agent recommendations',
      {
        step: 'generate_ideas',
        progress: 60,
      },
    );

    // Prompt from N8N workflow (generate ideas)
    const prompt = `You are an elite automation consultant and expert in ${state.normalizedIndustry}. You understand their daily workflows, bottlenecks, and automation opportunities.

Industry: ${state.normalizedIndustry}
Description: ${state.industryDescription}
Business Types: ${state.commonBusinessTypes}

Generate EXACTLY 8-10 AI agent ideas that are:
- HYPER-SPECIFIC to this industry (use industry terminology)
- Save 5-20+ hours per week
- Solve real, expensive problems
- Inspiring yet practical
- Cover Sales, Operations, Customer Service, Marketing, Finance, Admin

Return ONLY a JSON array (no markdown, no code blocks, no explanation):
[
  {
    "name": "Benefit-focused name (4-8 words)",
    "tagline": "One powerful sentence of value",
    "description": "2-3 sentences with concrete details and industry-specific language",
    "use_case_example": "When [trigger], this agent automatically [action and result]",
    "time_saved": "5-8 hours per week",
    "wow_factor": "Most impressive or surprising capability",
    "category": "Sales|Operations|Customer Service|Marketing|Finance|Admin"
  }
]

Make 70%+ highly industry-specific. Return the raw JSON array only, starting with [ and ending with ].`;

    try {
      // Use claude-sonnet for idea generation (higher quality)
      const generateContext: ExecutionContext = {
        ...ctx,
        model: 'claude-sonnet-4-6',
      };

      const response = await llmClient.callLLM({
        context: generateContext,
        userMessage: prompt,
        temperature: 0.8,
        maxTokens: 4000,
        callerName: `${AGENT_SLUG}:generate-ideas`,
      });

      // Parse the JSON response
      let raw = response.text
        .replace(/```json\n?/g, '')
        .replace(/```/g, '')
        .trim();

      // Extract JSON array if embedded in text
      const match = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        raw = match[0];
      }

      try {
        const ideas = JSON.parse(raw) as AgentRecommendation[];

        // Validate structure
        if (!Array.isArray(ideas)) {
          throw new Error('Response is not an array');
        }

        if (ideas.length < 8 || ideas.length > 10) {
          throw new Error(`Expected 8-10 ideas, got ${ideas.length}`);
        }

        // Check required fields
        const required = [
          'name',
          'tagline',
          'description',
          'use_case_example',
          'time_saved',
          'wow_factor',
          'category',
        ];
        for (const idea of ideas) {
          for (const field of required) {
            if (!idea[field as keyof AgentRecommendation]) {
              throw new Error(`Missing field: ${field}`);
            }
          }
        }

        await observability.emitCompleted(
          ctx,
          ctx.conversationId,
          { recommendationCount: ideas.length },
          Date.now() - state.startedAt,
        );

        return {
          recommendations: ideas,
          isFallback: false,
          status: 'completed',
          completedAt: Date.now(),
        };
      } catch {
        // Use fallback recommendations
        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          'Using fallback recommendations',
          {
            step: 'fallback',
            progress: 80,
          },
        );

        await observability.emitCompleted(
          ctx,
          ctx.conversationId,
          {
            recommendationCount: FALLBACK_RECOMMENDATIONS.length,
            isFallback: true,
          },
          Date.now() - state.startedAt,
        );

        return {
          recommendations: FALLBACK_RECOMMENDATIONS,
          isFallback: true,
          status: 'completed',
          completedAt: Date.now(),
        };
      }
    } catch {
      // Use fallback recommendations on any error
      await observability.emitCompleted(
        ctx,
        ctx.conversationId,
        {
          recommendationCount: FALLBACK_RECOMMENDATIONS.length,
          isFallback: true,
        },
        Date.now() - state.startedAt,
      );

      return {
        recommendations: FALLBACK_RECOMMENDATIONS,
        isFallback: true,
        status: 'completed',
        completedAt: Date.now(),
      };
    }
  }

  // Node: Handle errors
  async function handleErrorNode(
    state: BusinessAutomationAdvisorState,
  ): Promise<Partial<BusinessAutomationAdvisorState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error || 'Unknown error',
      Date.now() - state.startedAt,
    );

    return {
      status: 'failed',
      completedAt: Date.now(),
    };
  }

  // Build the graph
  const graph = new StateGraph(BusinessAutomationAdvisorStateAnnotation)
    .addNode('normalize_industry', normalizeIndustryNode)
    .addNode('generate_ideas', generateIdeasNode)
    .addNode('handle_error', handleErrorNode)
    // Edges
    .addEdge('__start__', 'normalize_industry')
    .addConditionalEdges('normalize_industry', (state) => {
      if (state.error) return 'handle_error';
      return 'generate_ideas';
    })
    .addEdge('generate_ideas', END)
    .addEdge('handle_error', END);

  // Compile with checkpointer.
  // Cast to BusinessAutomationAdvisorGraph to avoid TS2589 type depth limit.
  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as BusinessAutomationAdvisorGraph;
  return compiled;
}
