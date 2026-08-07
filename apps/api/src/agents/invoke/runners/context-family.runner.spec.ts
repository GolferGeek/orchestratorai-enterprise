import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { AgentDefinition } from '../agent-definition.types';

jest.mock('@orchestratorai/planes/llm', () => ({
  LLM_SERVICE: Symbol('LLM_SERVICE'),
}));

import { ContextFamilyRunner } from './context-family.runner';

const definition: AgentDefinition = {
  id: 'context-agent',
  slug: 'context-agent',
  name: 'Context Agent',
  agentType: 'context',
  status: 'active',
  outputType: 'markdown',
  context: 'Answer precisely.',
};

describe('ContextFamilyRunner attachment hardening', () => {
  const llm = {
    generateUnifiedResponse: jest.fn(),
    generateResponse: jest.fn(),
  };
  const pdf = { extractText: jest.fn() };
  const docx = { extractText: jest.fn() };
  const text = { extractText: jest.fn() };
  let runner: ContextFamilyRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    llm.generateUnifiedResponse.mockResolvedValue('answer');
    llm.generateResponse.mockResolvedValue('vision answer');
    pdf.extractText.mockResolvedValue('pdf text');
    docx.extractText.mockResolvedValue('docx text');
    text.extractText.mockResolvedValue('text body');
    runner = new ContextFamilyRunner(
      llm as never,
      pdf as never,
      docx as never,
      text as never,
    );
  });

  it('passes the ExecutionContext whole to the LLM', async () => {
    const context = Object.freeze(createMockExecutionContext());

    await runner.invoke(definition, context, { content: 'hello' });

    expect(llm.generateUnifiedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ executionContext: context }),
      }),
    );
  });

  it('routes a validated image attachment to the vision call', async () => {
    const base64 = Buffer.from('image bytes').toString('base64');

    await runner.invoke(definition, createMockExecutionContext(), {
      content: {
        message: 'describe this',
        attachments: [
          { base64, mimeType: 'image/png', filename: 'chart.png' },
        ],
      },
    });

    expect(llm.generateResponse).toHaveBeenCalledWith(
      'Answer precisely.',
      'describe this',
      expect.objectContaining({
        images: [{ base64, mimeType: 'image/png' }],
      }),
    );
  });

  it('rejects more than four attachments', async () => {
    const attachment = {
      base64: Buffer.from('x').toString('base64'),
      mimeType: 'text/plain',
      filename: 'note.txt',
    };

    await expect(
      runner.invoke(definition, createMockExecutionContext(), {
        content: {
          message: 'read these',
          attachments: Array.from({ length: 5 }, () => ({ ...attachment })),
        },
      }),
    ).rejects.toThrow('Maximum 4 attachments');
    expect(text.extractText).not.toHaveBeenCalled();
  });

  it('rejects malformed base64 before extraction or LLM use', async () => {
    await expect(
      runner.invoke(definition, createMockExecutionContext(), {
        content: {
          message: 'read this',
          attachments: [
            {
              base64: '%%%not-base64%%%',
              mimeType: 'application/pdf',
              filename: 'brief.pdf',
            },
          ],
        },
      }),
    ).rejects.toThrow('valid base64');
    expect(pdf.extractText).not.toHaveBeenCalled();
  });

  it('rejects SVG and other MIME types outside the allowlist', async () => {
    await expect(
      runner.invoke(definition, createMockExecutionContext(), {
        content: {
          message: 'describe this',
          attachments: [
            {
              base64: Buffer.from('<svg/>').toString('base64'),
              mimeType: 'image/svg+xml',
              filename: 'active.svg',
            },
          ],
        },
      }),
    ).rejects.toThrow('Unsupported attachment MIME type');
  });

  it('rejects path-like or control-character filenames', async () => {
    await expect(
      runner.invoke(definition, createMockExecutionContext(), {
        content: {
          message: 'read this',
          attachments: [
            {
              base64: Buffer.from('text').toString('base64'),
              mimeType: 'text/plain',
              filename: '../../audit\nlog.txt',
            },
          ],
        },
      }),
    ).rejects.toThrow('filename');
  });
});
