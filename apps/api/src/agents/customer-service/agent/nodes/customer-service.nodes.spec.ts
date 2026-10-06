import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { CompanyProfile } from '../company-profile';
import type { CustomerServiceState } from '../customer-service.state';
import { createAnswerQuestionNode } from './answer-question.node';
import { createClassifyIntentNode } from './classify-intent.node';
import { createExplainPricingNode } from './explain-pricing.node';
import { createOfferDemoNode } from './offer-demo.node';
import { createProvideContactNode } from './provide-contact.node';
import { createRedirectNode } from './redirect.node';
import { buildRetrievalQuery } from './grounded-answer';

const context = Object.freeze(
  createMockExecutionContext({
    orgSlug: 'acme',
    agentSlug: 'customer-service',
    agentType: 'langgraph',
  }),
);

const emailOnly: CompanyProfile = {
  orgSlug: 'acme',
  name: 'Acme Labs',
  contact: { email: 'help@acme.test' },
};
const full: CompanyProfile = {
  orgSlug: 'acme',
  name: 'Acme Labs',
  contact: {
    email: 'help@acme.test',
    phone: '+1 555 0100',
    bookingUrl: 'https://acme.test/book',
  },
};

function makeState(
  overrides: Partial<CustomerServiceState> = {},
): CustomerServiceState {
  return {
    messages: [],
    executionContext: context,
    profile: emailOnly,
    userMessage: 'How much is the GFAP antibody?',
    conversationHistory: [],
    interactionMode: 'text',
    intent: undefined,
    nodeResponse: undefined,
    response: undefined,
    status: 'processing',
    error: undefined,
    startedAt: 0,
    completedAt: undefined,
    ...overrides,
  };
}

function llmReturning(text: string) {
  return {
    callLLM: jest.fn().mockResolvedValue({
      text,
      requestId: 'r',
      provider: 'p',
      model: 'm',
    }),
  };
}

const observability = { emitProgress: jest.fn().mockResolvedValue(undefined) };

describe('explain_pricing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('answers from the retrieved excerpts with the document name in the prompt', async () => {
    const llm = llmReturning('Per price-list.md, the GFAP antibody is $250.');
    const retriever = {
      retrieve: jest.fn().mockResolvedValue([
        { documentName: 'price-list.md', content: 'Anti-GFAP antibody: $250' },
      ]),
    };
    const node = createExplainPricingNode(llm, observability, retriever);

    const result = await node(makeState());

    expect(retriever.retrieve).toHaveBeenCalledWith(
      context,
      'How much is the GFAP antibody?',
    );
    const request = llm.callLLM.mock.calls[0][0];
    expect(request.context).toBe(context);
    expect(request.systemMessage).toContain('document: price-list.md');
    expect(request.systemMessage).toContain('Anti-GFAP antibody: $250');
    expect(request.systemMessage).toContain('Answer ONLY from the excerpts');
    expect(request.systemMessage).toContain('asking about prices');
    expect(result.nodeResponse).toBe(
      'Per price-list.md, the GFAP antibody is $250.',
    );
  });

  it('says it could not find it and gives the email when nothing is retrieved, without calling the LLM', async () => {
    const llm = llmReturning('should not be used');
    const retriever = { retrieve: jest.fn().mockResolvedValue([]) };
    const node = createExplainPricingNode(llm, observability, retriever);

    const result = await node(makeState());

    expect(llm.callLLM).not.toHaveBeenCalled();
    expect(result.nodeResponse).toContain("couldn't find that");
    expect(result.nodeResponse).toContain('Acme Labs');
    expect(result.nodeResponse).toContain('help@acme.test');
  });

  it('propagates a missing-collection error instead of answering', async () => {
    const llm = llmReturning('x');
    const retriever = {
      retrieve: jest.fn().mockRejectedValue(new Error('no collection')),
    };
    const node = createExplainPricingNode(llm, observability, retriever);

    await expect(node(makeState())).rejects.toThrow('no collection');
  });
});

describe('answer_question', () => {
  beforeEach(() => jest.clearAllMocks());

  it('answers from the company documents', async () => {
    const llm = llmReturning('We are open 9 to 5 (hours.md).');
    const retriever = {
      retrieve: jest
        .fn()
        .mockResolvedValue([{ documentName: 'hours.md', content: 'Mon-Fri 9-5' }]),
    };
    const node = createAnswerQuestionNode(llm, observability, retriever);

    const result = await node(makeState({ userMessage: 'When are you open?' }));

    expect(llm.callLLM.mock.calls[0][0].systemMessage).toContain('Mon-Fri 9-5');
    expect(result.nodeResponse).toBe('We are open 9 to 5 (hours.md).');
  });

  it('answers honestly when nothing is found', async () => {
    const llm = llmReturning('x');
    const node = createAnswerQuestionNode(llm, observability, {
      retrieve: jest.fn().mockResolvedValue([]),
    });

    const result = await node(makeState({ userMessage: 'Do you ship to Mars?' }));

    expect(llm.callLLM).not.toHaveBeenCalled();
    expect(result.nodeResponse).toContain('help@acme.test');
  });

  it('searches with the previous user message so follow-ups find their subject', () => {
    expect(
      buildRetrievalQuery(
        makeState({
          userMessage: 'how much is it?',
          conversationHistory: [
            { role: 'user', content: 'Tell me about the GFAP kit' },
            { role: 'assistant', content: 'It is a kit.' },
          ],
        }),
      ),
    ).toBe('Tell me about the GFAP kit\nhow much is it?');
  });
});

describe('offer_demo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('gives the booking link, email and phone when all are set', async () => {
    const result = await createOfferDemoNode(observability)(
      makeState({ profile: full }),
    );
    expect(result.nodeResponse).toContain('https://acme.test/book');
    expect(result.nodeResponse).toContain('help@acme.test');
    expect(result.nodeResponse).toContain('+1 555 0100');
  });

  it('gives the email (and no booking link) when there is no bookingUrl', async () => {
    const result = await createOfferDemoNode(observability)(makeState());
    expect(result.nodeResponse).toContain('help@acme.test');
    expect(result.nodeResponse).toContain('Acme Labs');
    expect(result.nodeResponse).not.toContain('http');
    expect(result.nodeResponse).not.toContain('call');
  });

  it('throws when the profile was never loaded', async () => {
    await expect(
      createOfferDemoNode(observability)(makeState({ profile: undefined })),
    ).rejects.toThrow('no company profile');
  });
});

describe('provide_contact', () => {
  beforeEach(() => jest.clearAllMocks());

  it('says it is an AI and gives every contact detail from the profile', async () => {
    const result = await createProvideContactNode(observability)(
      makeState({ profile: full }),
    );
    expect(result.nodeResponse).toContain("I'm an AI assistant");
    expect(result.nodeResponse).toContain('Acme Labs');
    expect(result.nodeResponse).toContain('Email: help@acme.test');
    expect(result.nodeResponse).toContain('Phone: +1 555 0100');
    expect(result.nodeResponse).toContain('Book a time: https://acme.test/book');
  });

  it('gives only the email when that is all the company set', async () => {
    const result = await createProvideContactNode(observability)(makeState());
    expect(result.nodeResponse).toContain('Email: help@acme.test');
    expect(result.nodeResponse).not.toContain('Phone:');
    expect(result.nodeResponse).not.toContain('Book a time:');
  });
});

describe('redirect and classify_intent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('redirects to questions about the company by name', async () => {
    const llm = llmReturning('I can only help with Acme Labs questions.');
    const result = await createRedirectNode(llm, observability)(
      makeState({ userMessage: 'Who won the game?' }),
    );
    const request = llm.callLLM.mock.calls[0][0];
    expect(request.systemMessage).toContain('not about Acme Labs');
    expect(request.context).toBe(context);
    expect(result.nodeResponse).toBe('I can only help with Acme Labs questions.');
  });

  it('classifies with a prompt about this company', async () => {
    const llm = llmReturning('pricing_inquiry');
    const result = await createClassifyIntentNode(llm, observability)(
      makeState(),
    );
    expect(llm.callLLM.mock.calls[0][0].systemMessage).toContain(
      'conversation with Acme Labs',
    );
    expect(result.intent).toBe('pricing_inquiry');
  });
});
