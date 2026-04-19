/**
 * ContextFamilyRunner unit tests
 *
 * Tests LLM call construction, content extraction from LLMResponse,
 * system prompt building, InvokeOutput shape, multimodal image attachment
 * path (generateResponse), document extraction (PDF/DOCX/TXT), and
 * unsupported MIME type error.
 */

import { ContextFamilyRunner } from './context-family.runner';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { AgentDefinition } from '../agent-definition.types';

const mockDefinition: AgentDefinition = {
  id: 'def-1',
  slug: 'blog-writer',
  name: 'Blog Writer',
  agentType: 'context',
  status: 'active',
  context: 'You are a professional blog writer.',
  outputType: 'markdown',
  llmConfig: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
};

describe('ContextFamilyRunner', () => {
  let runner: ContextFamilyRunner;
  let mockLlmService: { generateUnifiedResponse: jest.Mock; generateResponse: jest.Mock };
  let mockPdfExtractor: { extractText: jest.Mock };
  let mockDocxExtractor: { extractText: jest.Mock };
  let mockTextExtractor: { extractText: jest.Mock };

  beforeEach(() => {
    mockLlmService = {
      generateUnifiedResponse: jest.fn().mockResolvedValue({
        content: 'Generated blog content here.',
        metadata: { tokensUsed: 120 },
      }),
      generateResponse: jest.fn().mockResolvedValue({
        content: 'Vision response.',
        metadata: { tokensUsed: 200 },
      }),
    };

    mockPdfExtractor = { extractText: jest.fn().mockResolvedValue('extracted pdf text') };
    mockDocxExtractor = { extractText: jest.fn().mockResolvedValue('extracted docx text') };
    mockTextExtractor = { extractText: jest.fn().mockResolvedValue('extracted plain text') };

    runner = new ContextFamilyRunner(
      mockLlmService as never,
      mockPdfExtractor as never,
      mockDocxExtractor as never,
      mockTextExtractor as never,
    );
  });

  describe('invoke — happy path', () => {
    it('calls LLM with system prompt and user message, returns InvokeOutput', async () => {
      const context = createMockExecutionContext({ agentSlug: 'blog-writer' });
      const data = { content: 'Write about AI trends' };

      const output = await runner.invoke(mockDefinition, context, data);

      expect(mockLlmService.generateUnifiedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          systemPrompt: 'You are a professional blog writer.',
          userMessage: 'Write about AI trends',
        }),
      );

      expect(output.content).toBe('Generated blog content here.');
      expect(output.outputType).toBe('markdown');
      expect(output.metadata?.agentSlug).toBe('blog-writer');
    });

    it('passes ExecutionContext whole to LLM options for observability', async () => {
      const context = createMockExecutionContext({
        agentSlug: 'blog-writer',
        orgSlug: 'acme',
      });

      await runner.invoke(mockDefinition, context, { content: 'test' });

      const call = mockLlmService.generateUnifiedResponse.mock.calls[0]?.[0];
      expect(call?.options?.executionContext).toEqual(context);
      expect(call?.options?.organizationSlug).toBe('acme');
    });
  });

  describe('invoke — system prompt fallback', () => {
    it('uses default system prompt when definition.context is empty', async () => {
      const defNoContext: AgentDefinition = { ...mockDefinition, context: '' };
      const context = createMockExecutionContext();

      await runner.invoke(defNoContext, context, { content: 'hello' });

      const call = mockLlmService.generateUnifiedResponse.mock.calls[0]?.[0];
      expect(call?.systemPrompt).toContain('Blog Writer');
    });
  });

  describe('invoke — string LLM response', () => {
    it('handles a plain string response from LLM service', async () => {
      mockLlmService.generateUnifiedResponse.mockResolvedValueOnce(
        'plain string response',
      );
      const context = createMockExecutionContext();

      const output = await runner.invoke(mockDefinition, context, {
        content: 'test',
      });

      expect(output.content).toBe('plain string response');
    });
  });

  describe('invoke — image attachments (vision path)', () => {
    it('calls generateResponse (not generateUnifiedResponse) when image attachments present', async () => {
      const context = createMockExecutionContext({ agentSlug: 'blog-writer' });
      const data = {
        content: {
          message: 'What is in this image?',
          attachments: [
            { base64: 'abc123', mimeType: 'image/png', filename: 'chart.png' },
          ],
        },
      };

      const output = await runner.invoke(mockDefinition, context, data);

      expect(mockLlmService.generateResponse).toHaveBeenCalledWith(
        expect.any(String),
        'What is in this image?',
        expect.objectContaining({
          images: [{ base64: 'abc123', mimeType: 'image/png' }],
        }),
      );
      expect(mockLlmService.generateUnifiedResponse).not.toHaveBeenCalled();
      expect(output.content).toBe('Vision response.');
    });

    it('passes provider and model from llmConfig to generateResponse', async () => {
      const context = createMockExecutionContext({ agentSlug: 'blog-writer' });
      const data = {
        content: {
          message: 'describe this',
          attachments: [{ base64: 'xyz', mimeType: 'image/jpeg', filename: 'photo.jpg' }],
        },
      };

      await runner.invoke(mockDefinition, context, data);

      const call = mockLlmService.generateResponse.mock.calls[0];
      expect(call?.[2]).toMatchObject({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });
    });

    it('includes executionContext whole in generateResponse options', async () => {
      const context = createMockExecutionContext({ agentSlug: 'blog-writer', orgSlug: 'acme' });
      const data = {
        content: {
          message: 'check this',
          attachments: [{ base64: 'data', mimeType: 'image/webp', filename: 'img.webp' }],
        },
      };

      await runner.invoke(mockDefinition, context, data);

      const callOpts = mockLlmService.generateResponse.mock.calls[0]?.[2];
      expect(callOpts?.executionContext).toEqual(context);
      expect(callOpts?.organizationSlug).toBe('acme');
    });

    it('metadata includes imageCount and attachmentCount', async () => {
      const context = createMockExecutionContext();
      const data = {
        content: {
          message: 'two images',
          attachments: [
            { base64: 'a', mimeType: 'image/png', filename: 'a.png' },
            { base64: 'b', mimeType: 'image/gif', filename: 'b.gif' },
          ],
        },
      };

      const output = await runner.invoke(mockDefinition, context, data);

      expect(output.metadata?.imageCount).toBe(2);
      expect(output.metadata?.attachmentCount).toBe(2);
      expect(output.metadata?.documentCount).toBe(0);
    });
  });

  describe('invoke — document attachments (extraction path)', () => {
    it('calls pdfExtractor for application/pdf and prepends text to user message', async () => {
      const context = createMockExecutionContext();
      const data = {
        content: {
          message: 'summarize this doc',
          attachments: [
            { base64: Buffer.from('PDF content').toString('base64'), mimeType: 'application/pdf', filename: 'report.pdf' },
          ],
        },
      };

      await runner.invoke(mockDefinition, context, data);

      expect(mockPdfExtractor.extractText).toHaveBeenCalled();
      const call = mockLlmService.generateUnifiedResponse.mock.calls[0]?.[0];
      expect(call?.userMessage).toContain('[Document: report.pdf]');
      expect(call?.userMessage).toContain('extracted pdf text');
      expect(call?.userMessage).toContain('summarize this doc');
    });

    it('calls docxExtractor for application/vnd.openxmlformats-officedocument.wordprocessingml.document', async () => {
      const context = createMockExecutionContext();
      const data = {
        content: {
          message: 'review this',
          attachments: [
            {
              base64: 'data',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              filename: 'contract.docx',
            },
          ],
        },
      };

      await runner.invoke(mockDefinition, context, data);

      expect(mockDocxExtractor.extractText).toHaveBeenCalled();
      const call = mockLlmService.generateUnifiedResponse.mock.calls[0]?.[0];
      expect(call?.userMessage).toContain('[Document: contract.docx]');
      expect(call?.userMessage).toContain('extracted docx text');
    });

    it('calls textExtractor for text/plain', async () => {
      const context = createMockExecutionContext();
      const data = {
        content: {
          message: 'translate this',
          attachments: [
            { base64: Buffer.from('plain text').toString('base64'), mimeType: 'text/plain', filename: 'notes.txt' },
          ],
        },
      };

      await runner.invoke(mockDefinition, context, data);

      expect(mockTextExtractor.extractText).toHaveBeenCalled();
    });

    it('calls textExtractor for text/markdown', async () => {
      const context = createMockExecutionContext();
      const data = {
        content: {
          message: 'explain this',
          attachments: [
            { base64: Buffer.from('# heading').toString('base64'), mimeType: 'text/markdown', filename: 'readme.md' },
          ],
        },
      };

      await runner.invoke(mockDefinition, context, data);

      expect(mockTextExtractor.extractText).toHaveBeenCalled();
    });

    it('throws on unsupported MIME type — no silent fallback', async () => {
      const context = createMockExecutionContext();
      const data = {
        content: {
          message: 'read this',
          attachments: [
            { base64: 'data', mimeType: 'application/zip', filename: 'archive.zip' },
          ],
        },
      };

      await expect(runner.invoke(mockDefinition, context, data)).rejects.toThrow(
        'Unsupported document MIME type for text extraction: application/zip',
      );
    });

    it('metadata includes documentCount when document attachments present', async () => {
      const context = createMockExecutionContext();
      const data = {
        content: {
          message: 'read these',
          attachments: [
            { base64: 'a', mimeType: 'application/pdf', filename: 'a.pdf' },
            { base64: 'b', mimeType: 'application/pdf', filename: 'b.pdf' },
          ],
        },
      };

      const output = await runner.invoke(mockDefinition, context, data);

      expect(output.metadata?.documentCount).toBe(2);
      expect(output.metadata?.imageCount).toBe(0);
    });
  });

  describe('invoke — no attachments', () => {
    it('returns empty array for attachments when data.content is a plain string', async () => {
      const context = createMockExecutionContext();
      const output = await runner.invoke(mockDefinition, context, { content: 'just text' });

      expect(output.metadata?.attachmentCount).toBe(0);
      expect(output.metadata?.imageCount).toBe(0);
      expect(output.metadata?.documentCount).toBe(0);
    });
  });
});
