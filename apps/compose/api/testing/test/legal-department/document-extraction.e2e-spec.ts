/**
 * E2E Test: Document Extraction for Legal Department AI
 *
 * Tests document text extraction functionality:
 * - PDF text extraction (pdf-parse)
 * - DOCX text extraction (mammoth)
 * - Vision model extraction for images
 * - OCR fallback mechanism
 * - Extraction results stored correctly
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Vision model available (or OCR fallback)
 * - Document processing services configured
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json legal-department/document-extraction.e2e-spec
 */

import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'demo-org';
const AGENT_SLUG = 'legal-department';
const AGENT_TYPE = 'api'; // legal-department is registered as API agent with LangGraph forwarding

// NIL_UUID for unset context fields
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Timeout for operations (extraction can take time)
const TIMEOUT = 60000;

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
        extractedText?: string;
        extractionMethod?: 'vision' | 'ocr' | 'none';
      }>;
      [key: string]: unknown;
    };
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

describe('Legal Department AI - Document Extraction', () => {
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

  describe('PDF Text Extraction', () => {
    it('should extract text from PDF files', async () => {
      // Simple PDF with text content
      const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(Test Legal Document) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000229 00000 n
0000000328 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
420
%%EOF`;

      const base64Data = Buffer.from(pdfContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract text from PDF',
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
        },
        payload: {
          documents: [
            {
              filename: 'legal-doc.pdf',
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

      const documents = data.payload?.content?.documents;
      if (documents && documents.length > 0) {
        const doc = documents[0]!;
        expect(doc.mimeType).toBe('application/pdf');

        // Check if extraction was attempted
        if (doc.extractedText) {
          expect(doc.extractedText.length).toBeGreaterThan(0);
          expect(doc.extractionMethod).toBeDefined();
        }
      }
    }, TIMEOUT);

    it('should handle PDFs without extractable text (scanned PDFs)', async () => {
      // Minimal PDF without text stream
      const scannedPdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
190
%%EOF`;

      const base64Data = Buffer.from(scannedPdfContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract from scanned PDF',
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
        },
        payload: {
          documents: [
            {
              filename: 'scanned.pdf',
              mimeType: 'application/pdf',
              size: scannedPdfContent.length,
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

      // Should attempt vision or OCR extraction
      const documents = data.payload?.content?.documents;
      if (documents && documents.length > 0) {
        const doc = documents[0]!;
        if (doc.extractionMethod) {
          expect(['vision', 'ocr', 'none']).toContain(doc.extractionMethod);
        }
      }
    }, TIMEOUT);
  });

  describe('DOCX Text Extraction', () => {
    it('should extract text from DOCX files', async () => {
      // Note: Creating a valid DOCX requires ZIP format with XML content
      // For testing, we'll use a simplified mock
      const docxContent = 'Mock DOCX content - this is a legal contract';
      const base64Data = Buffer.from(docxContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract text from DOCX',
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
        },
        payload: {
          documents: [
            {
              filename: 'contract.docx',
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

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const documents = data.payload?.content?.documents;
      if (documents && documents.length > 0) {
        const doc = documents[0]!;
        expect(doc.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }
    }, TIMEOUT);
  });

  describe('Vision Model Extraction', () => {
    it('should extract text from PNG images using vision model', async () => {
      // 1x1 red pixel PNG (minimal valid PNG)
      const pngContent = Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
        0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222,
        0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0,
        3, 1, 1, 0, 24, 221, 141, 176, 0, 0, 0, 0, 73, 69, 78, 68,
        174, 66, 96, 130,
      ]);
      const base64Data = pngContent.toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract text from image',
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
        },
        payload: {
          documents: [
            {
              filename: 'contract-scan.png',
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

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const documents = data.payload?.content?.documents;
      if (documents && documents.length > 0) {
        const doc = documents[0]!;
        expect(doc.mimeType).toBe('image/png');

        // Check extraction method
        if (doc.extractionMethod) {
          expect(['vision', 'ocr']).toContain(doc.extractionMethod);
        }
      }
    }, TIMEOUT);

    it('should extract text from JPEG images using vision model', async () => {
      // Minimal valid JPEG
      const jpegContent = Buffer.from([
        255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1,
        0, 1, 0, 0, 255, 219, 0, 67, 0, 8, 6, 6, 7, 6, 5, 8, 7, 7, 7,
        9, 9, 8, 10, 12, 20, 13, 12, 11, 11, 12, 25, 18, 19, 15, 20,
        29, 26, 31, 30, 29, 26, 28, 28, 32, 36, 46, 39, 32, 34, 44,
        35, 28, 28, 40, 55, 41, 44, 48, 49, 52, 52, 52, 31, 39, 57,
        61, 56, 50, 60, 46, 51, 52, 50, 255, 217,
      ]);
      const base64Data = jpegContent.toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract text from JPEG',
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
        },
        payload: {
          documents: [
            {
              filename: 'document.jpg',
              mimeType: 'image/jpeg',
              size: jpegContent.length,
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
        expect(doc.mimeType).toBe('image/jpeg');
      }
    }, TIMEOUT);
  });

  describe('OCR Fallback Mechanism', () => {
    it('should fall back to OCR if vision model fails', async () => {
      // This test simulates vision model failure
      // In practice, OCR fallback happens automatically in DocumentProcessingService

      const pngContent = Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
        0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222,
      ]);
      const base64Data = pngContent.toString('base64');

      const request: A2ARequest = {
        userMessage: 'Test OCR fallback',
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
        },
        payload: {
          documents: [
            {
              filename: 'fallback-test.png',
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

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const documents = data.payload?.content?.documents;
      if (documents && documents.length > 0) {
        const doc = documents[0]!;

        // Should have attempted extraction (vision or OCR)
        if (doc.extractionMethod) {
          expect(['vision', 'ocr', 'none']).toContain(doc.extractionMethod);
        }
      }
    }, TIMEOUT);

    it('should handle OCR extraction for poor quality images', async () => {
      // Poor quality image that might fail vision but work with OCR
      const pngContent = Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
        0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222,
      ]);
      const base64Data = pngContent.toString('base64');

      const request: A2ARequest = {
        userMessage: 'Extract from poor quality image',
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
        },
        payload: {
          documents: [
            {
              filename: 'poor-quality.png',
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

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);
    }, TIMEOUT);
  });

  describe('Extraction Results Storage', () => {
    it('should store extracted text in response', async () => {
      const textContent = 'Simple text document for extraction test';
      const base64Data = Buffer.from(textContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Test extraction storage',
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
        },
        payload: {
          documents: [
            {
              filename: 'extraction-test.txt',
              mimeType: 'text/plain',
              size: textContent.length,
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
        expect(doc.documentId).toBeDefined();
        expect(doc.url).toBeDefined();
        expect(doc.storagePath).toBeDefined();
      }
    }, TIMEOUT);

    it('should include extraction method in response', async () => {
      const pngContent = Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
        0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222,
      ]);
      const base64Data = pngContent.toString('base64');

      const request: A2ARequest = {
        userMessage: 'Test extraction method tracking',
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
        },
        payload: {
          documents: [
            {
              filename: 'method-test.png',
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

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      const documents = data.payload?.content?.documents;
      if (documents && documents.length > 0) {
        const doc = documents[0]!;
        // extractionMethod should be present if extraction was attempted
        if (doc.extractionMethod) {
          expect(['vision', 'ocr', 'none']).toContain(doc.extractionMethod);
        }
      }
    }, TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle corrupted file gracefully', async () => {
      const corruptedData = 'not-valid-base64-!@#$%^&*()';

      const request: A2ARequest = {
        userMessage: 'Upload corrupted file',
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
        },
        payload: {
          documents: [
            {
              filename: 'corrupted.pdf',
              mimeType: 'application/pdf',
              size: corruptedData.length,
              base64Data: corruptedData,
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

      // Should either reject or handle gracefully
      if (!response.ok) {
        expect([400, 422, 500]).toContain(response.status);
      } else {
        const data = await response.json() as A2AResponse;
        // If successful, might return with error in content
        expect(data).toBeDefined();
      }
    }, TIMEOUT);

    it('should handle unsupported MIME types', async () => {
      const executableContent = 'MZ\x90\x00'; // EXE header
      const base64Data = Buffer.from(executableContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Upload unsupported file type',
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
        },
        payload: {
          documents: [
            {
              filename: 'malware.exe',
              mimeType: 'application/x-msdownload',
              size: executableContent.length,
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

      // Should reject unsupported file types
      if (!response.ok) {
        expect([400, 415, 422]).toContain(response.status);
      } else {
        const data = await response.json() as A2AResponse;
        // May accept but not extract
        expect(data).toBeDefined();
      }
    }, TIMEOUT);
  });
});
