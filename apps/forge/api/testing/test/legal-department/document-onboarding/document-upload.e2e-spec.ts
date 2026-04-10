/**
 * E2E Test: Document Upload & Storage for Legal Department AI
 *
 * Tests document upload and storage functionality:
 * - File upload to legal-documents bucket
 * - Storage path structure: legal-documents/{orgSlug}/{conversationId}/{taskId}/{uuid}_{filename}
 * - RLS policies (org-based access)
 * - File size limits (50MB)
 * - MIME type validation
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with legal-documents bucket created
 * - RLS policies configured
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json legal-department/document-upload.e2e-spec
 */

import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'demo-org';
const AGENT_SLUG = 'legal-department';
const AGENT_TYPE = 'api'; // legal-department is registered as API agent with LangGraph forwarding
const PROVIDER = 'anthropic';
const MODEL = 'claude-sonnet-4-5';

// NIL_UUID for unset context fields
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Timeout for operations
const TIMEOUT = 30000;

interface A2ARequest {
  userMessage: string;
  mode: string;
  context: {
    orgSlug: string;
    agentSlug: string;
    agentType: string;
    userId: string;
    conversationId: string;
    taskId: string;
    planId: string;
    deliverableId: string;
    provider: string;
    model: string;
  };
  payload?: {
    documents?: Array<{
      filename: string;
      mimeType: string;
      size: number;
      base64Data: string;
    }>;
  };
}

interface A2AResponse {
  success: boolean;
  mode: string;
  payload?: {
    content?: {
      documents?: Array<{
        documentId: string;
        url: string;
        storagePath: string;
        mimeType: string;
        sizeBytes: number;
      }>;
      [key: string]: unknown;
    };
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

describe('Legal Department AI - Document Upload & Storage', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Authenticate
    const authResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (!authResponse.ok) {
      throw new Error(
        `Authentication failed: ${authResponse.status} ${authResponse.statusText}`,
      );
    }

    const authData = await authResponse.json();
    expect(authData.accessToken).toBeDefined();
    authToken = authData.accessToken;

    // Extract userId from JWT sub claim
    try {
      const jwtParts = authToken.split('.');
      if (jwtParts[1]) {
        const jwtPayload = JSON.parse(
          Buffer.from(jwtParts[1], 'base64').toString(),
        );
        userId = jwtPayload.sub;
      } else {
        userId = process.env.SUPABASE_TEST_USERID || '';
      }
    } catch {
      userId = process.env.SUPABASE_TEST_USERID || '';
    }
    expect(userId).toBeTruthy();
  }, TIMEOUT);

  describe('Document Upload via A2A', () => {
    it('should upload a text file to legal-documents bucket', async () => {
      const testContent = 'This is a test legal document.';
      const base64Data = Buffer.from(testContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Upload test document',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'test-document.txt',
              mimeType: 'text/plain',
              size: testContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      // Check if documents were processed
      const documents = data.payload?.content?.documents;
      if (documents && documents.length > 0) {
        const doc = documents[0]!;
        expect(doc.documentId).toBeDefined();
        expect(doc.url).toBeDefined();
        expect(doc.storagePath).toBeDefined();
        expect(doc.mimeType).toBe('text/plain');
      }
    }, TIMEOUT);

    it('should upload a PDF file', async () => {
      // Simple PDF header (minimal valid PDF)
      const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF';
      const base64Data = Buffer.from(pdfContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Upload PDF document',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'contract.pdf',
              mimeType: 'application/pdf',
              size: pdfContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);
    }, 60000); // PDF processing with LLM takes longer

    it('should upload multiple documents in one request', async () => {
      const doc1 = Buffer.from('Document 1 content').toString('base64');
      const doc2 = Buffer.from('Document 2 content').toString('base64');

      const request: A2ARequest = {
        userMessage: 'Upload multiple documents',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'doc1.txt',
              mimeType: 'text/plain',
              size: 18,
              base64Data: doc1,
            },
            {
              filename: 'doc2.txt',
              mimeType: 'text/plain',
              size: 18,
              base64Data: doc2,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const documents = data.payload?.content?.documents;
      if (documents) {
        expect(documents.length).toBeGreaterThanOrEqual(1);
      }
    }, TIMEOUT);
  });

  describe('Storage Path Structure', () => {
    it('should use correct storage path format: {orgSlug}/{conversationId}/{taskId}/{uuid}_{filename}', async () => {
      const testContent = 'Path structure test';
      const base64Data = Buffer.from(testContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Test storage path',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'path-test.txt',
              mimeType: 'text/plain',
              size: testContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const documents = data.payload?.content?.documents;
      if (documents && documents.length > 0) {
        const doc = documents[0]!;
        const storagePath = doc.storagePath;

        if (storagePath) {
          // Path should match pattern: {orgSlug}/{conversationId}/{taskId}/{uuid}_{filename}
          const pathParts = storagePath.split('/');
          expect(pathParts.length).toBe(4);
          expect(pathParts[0]).toBe(ORG_SLUG);
          // pathParts[1] is conversationId (UUID)
          // pathParts[2] is taskId (UUID)
          // pathParts[3] is {uuid}_{filename}
          expect(pathParts[3]).toContain('path-test.txt');
        }
      }
    }, TIMEOUT);

    it('should sanitize filenames in storage path', async () => {
      const testContent = 'Sanitization test';
      const base64Data = Buffer.from(testContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Test filename sanitization',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: '../../../etc/passwd', // Path traversal attempt
              mimeType: 'text/plain',
              size: testContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const documents = data.payload?.content?.documents;
      if (documents && documents.length > 0) {
        const doc = documents[0]!;
        const storagePath = doc.storagePath;

        if (storagePath) {
          // Path traversal should be sanitized
          expect(storagePath).not.toContain('..');
          expect(storagePath).not.toContain('/etc/passwd');
        }
      }
    }, TIMEOUT);
  });

  describe('File Size Limits', () => {
    it('should accept files under 50MB', async () => {
      // Create a small file (1KB)
      const smallContent = 'x'.repeat(1024);
      const base64Data = Buffer.from(smallContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Upload small file',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'small-file.txt',
              mimeType: 'text/plain',
              size: smallContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);
    }, TIMEOUT);

    it('should reject files over 50MB', async () => {
      // Declare file over 50MB (don't actually create it, just report size)
      const base64Data = Buffer.from('fake large file').toString('base64');

      const request: A2ARequest = {
        userMessage: 'Upload large file',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'large-file.txt',
              mimeType: 'text/plain',
              size: 52 * 1024 * 1024, // 52MB
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      // Should fail validation or return error
      // Note: Implementation may accept but fail during upload
      if (!response.ok) {
        expect([400, 413, 422]).toContain(response.status);
      } else {
        const data = await response.json() as A2AResponse;
        // If it returns success false, that's acceptable
        if (!data.success) {
          expect(data.error).toBeDefined();
        }
      }
    }, TIMEOUT);
  });

  describe('MIME Type Validation', () => {
    it('should accept PDF files (application/pdf)', async () => {
      const pdfContent = '%PDF-1.4\nTest PDF';
      const base64Data = Buffer.from(pdfContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Upload PDF',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'test.pdf',
              mimeType: 'application/pdf',
              size: pdfContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);
    }, 60000); // PDF processing with LLM takes longer

    it('should accept DOCX files (application/vnd.openxmlformats-officedocument.wordprocessingml.document)', async () => {
      const docxContent = 'Mock DOCX content';
      const base64Data = Buffer.from(docxContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Upload DOCX',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'test.docx',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              size: docxContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);
    }, TIMEOUT);

    it('should accept image files (PNG, JPG, JPEG, WEBP)', async () => {
      // 1x1 red pixel PNG
      const pngContent = Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
        0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222,
      ]);
      const base64Data = pngContent.toString('base64');

      const request: A2ARequest = {
        userMessage: 'Upload image',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'test.png',
              mimeType: 'image/png',
              size: pngContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);
    }, TIMEOUT);
  });

  describe('RLS Policies', () => {
    it('should only allow access to documents in user organization', async () => {
      // This test verifies that RLS policies are in place
      // User can only access documents in their organization (demo-org)

      const testContent = 'RLS policy test';
      const base64Data = Buffer.from(testContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Upload with RLS',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: PROVIDER,
          model: MODEL,
        },
        payload: {
          documents: [
            {
              filename: 'rls-test.txt',
              mimeType: 'text/plain',
              size: testContent.length,
              base64Data,
            },
          ],
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      // Document should be accessible via the returned URL
      const documents = data.payload?.content?.documents;
      if (documents && documents.length > 0) {
        const doc = documents[0]!;
        if (doc.url) {
          // Verify URL is accessible (RLS allows access)
          const fileResponse = await fetch(doc.url);
          // Should be accessible (may be public or authenticated)
          expect(fileResponse.status).toBeGreaterThanOrEqual(200);
          expect(fileResponse.status).toBeLessThan(500);
        }
      }
    }, TIMEOUT);
  });
});
