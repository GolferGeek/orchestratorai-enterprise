/**
 * Legal Department Service
 *
 * Handles all async operations for the Legal Department AI feature:
 * - Document upload and management
 * - Starting legal document analysis through the A2A framework
 * - Fetching analysis status and results
 *
 * IMPORTANT: All executions go through the A2A tasks endpoint to ensure
 * proper conversation/task creation and LLM usage tracking.
 */

import { useExecutionContextStore } from '@/stores/executionContextStore';
import { SSEClient } from '@/services/agent2agent/sse/sseClient';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';
import { invokeStream as invokeStreamClient } from '@/services/invoke-client';
import type { StreamEvent } from '@orchestrator-ai/transport-types';
import type {
  DocumentType,
  UploadedDocument,
  CreateAnalysisRequest,
  AnalysisTaskResponse,
  AnalysisResults,
  SpecialistOutputs,
  LegalDocumentMetadata,
  LegalFinding,
  LegalRisk,
  LegalRecommendation,
} from './legalDepartmentTypes';

/**
 * Progress event callback for real-time updates
 */
export interface ProgressEvent {
  step: string;
  progress: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export type ProgressCallback = (event: ProgressEvent) => void;

/**
 * Completion callback for async task completion via SSE
 */
export type CompletionCallback = (result: {
  taskId: string;
  analysisResults?: AnalysisResults;
  error?: string;
}) => void;

// API Base URL for main API
const API_BASE_URL = getSecureApiBaseUrl();

/**
 * Get auth token from storage
 * TokenStorageService migrates tokens from localStorage to sessionStorage,
 * so we check sessionStorage first, then fall back to localStorage
 */
function getAuthToken(): string | null {
  return sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
}

class LegalDepartmentService {
  // SSE client for real-time progress updates
  private sseClient: SSEClient | null = null;
  private sseCleanup: Array<() => void> = [];
  private progressCallback: ProgressCallback | null = null;
  private completionCallback: CompletionCallback | null = null;
  // Captures the output from invoke/stream so completion handler can use it
  private pendingStreamOutput: Record<string, unknown> | null = null;

  /**
   * Upload document and start analysis through A2A tasks endpoint
   *
   * Sends file directly to the A2A tasks endpoint with multipart form data.
   * The backend processes the file, extracts text, stores it, and returns
   * the processed document info in the response.
   *
   * @param file - The file to upload and analyze
   * @param options - Analysis options
   * @returns AnalysisTaskResponse with document info and initial status
   */
  async uploadAndAnalyze(
    file: File,
    options?: {
      extractKeyTerms?: boolean;
      identifyRisks?: boolean;
      generateRecommendations?: boolean;
    }
  ): Promise<AnalysisTaskResponse & {
    documents?: Array<{ documentId: string; url: string; filename: string }>;
    analysisResults?: AnalysisResults;
  }> {
    // Verify ExecutionContext is initialized
    const executionContextStore = useExecutionContextStore();
    if (!executionContextStore.isInitialized) {
      throw new Error('ExecutionContext not initialized. Create conversation first.');
    }

    // Generate a new taskId for this execution
    const taskId = executionContextStore.newTaskId();
    const ctx = executionContextStore.current;

    console.log('[LegalDepartment] Uploading document via A2A framework', {
      conversationId: ctx.conversationId,
      taskId,
      agentSlug: ctx.agentSlug,
      filename: file.name,
    });

    const token = getAuthToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    try {
      // Convert file to base64 for JSON transport
      const base64Data = await this.fileToBase64(file);

      // Build JSON request with document embedded as base64
      // Backend supports documents array in payload for JSON-based upload
      const requestBody = {
        context: ctx,
        mode: 'converse',
        userMessage: `Analyze legal document: ${file.name}`,
        payload: {
          analysisType: 'legal-document-analysis',
          documentName: file.name,
          options: options || {
            extractKeyTerms: true,
            identifyRisks: true,
            generateRecommendations: true,
          },
          // Documents array for JSON-based upload (handled by backend)
          documents: [
            {
              filename: file.name,
              mimeType: file.type,
              size: file.size,
              base64Data,
            },
          ],
        },
      };

      console.log('[LegalDepartment] Sending invoke/stream request for:', file.name);

      // Use invoke/stream contract — keeps HTTP connection alive for long-running analysis.
      // Real-time progress is delivered via the separate observability SSE stream.
      // Map documents to the shape the capability handler expects: { name, content, type }
      const invokeContent = {
        type: 'legal-document-analysis',
        analysisType: requestBody.payload.analysisType,
        documentName: requestBody.payload.documentName,
        options: requestBody.payload.options,
        userMessage: requestBody.userMessage,
        documents: [
          {
            name: file.name,
            content: base64Data,
            type: file.type,
          },
        ],
      };

      this.pendingStreamOutput = null;

      invokeStreamClient(
        ctx,
        { content: invokeContent, contentType: 'json' },
        { baseUrl: API_BASE_URL, token },
        (event: StreamEvent) => {
          console.log('[LegalDepartment] Stream event:', event.event);
          if (event.event === 'output') {
            // Capture the output data for the completion handler
            this.pendingStreamOutput = event.data as Record<string, unknown>;
            console.log('[LegalDepartment] Stream output captured');
          }
          if (event.event === 'error') {
            const errorData = event.data as { message?: string } | undefined;
            console.error('[LegalDepartment] Stream error:', errorData?.message);
          }
          if (event.event === 'completed') {
            console.log('[LegalDepartment] Invoke stream completed');
          }
        },
      );

      console.log('[LegalDepartment] Execution started via invoke/stream, waiting for SSE updates...');

      // Return immediately — no analysisResults yet.
      // Results will arrive via SSE observability events → completionCallback
      const taskResponse: AnalysisTaskResponse & {
        documents?: Array<{ documentId: string; url: string; filename: string }>;
        analysisResults?: AnalysisResults;
      } = {
        taskId,
        status: 'running',
      };

      return taskResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload and analysis failed';
      console.error('[LegalDepartment] Upload failed:', error);
      throw new Error(message);
    }
  }

  /**
   * Transform LangGraph output to frontend AnalysisResults format
   */
  private transformToAnalysisResults(
    taskId: string,
    documentId: string,
    documentName: string,
    specialistOutputs?: SpecialistOutputs,
    legalMetadata?: LegalDocumentMetadata,
    finalReport?: string,
    _routingDecision?: { specialist?: string; multiAgent?: boolean; reasoning?: string }
  ): AnalysisResults {
    const findings: LegalFinding[] = [];
    const risks: LegalRisk[] = [];
    const recommendations: LegalRecommendation[] = [];
    let overallConfidence = 0.85;

    // Extract findings, risks, recommendations from specialist outputs
    if (specialistOutputs) {
      let findingId = 1;
      let riskId = 1;
      let recId = 1;

      for (const [specialist, output] of Object.entries(specialistOutputs)) {
        if (!output) continue;

        // Extract summary as a finding
        if (output.summary) {
          findings.push({
            id: String(findingId++),
            type: 'clause',
            category: this.capitalizeFirst(specialist),
            summary: `${this.capitalizeFirst(specialist)} Analysis Summary`,
            details: output.summary,
            location: { section: specialist },
            severity: 'medium',
            confidence: output.confidence || 0.85,
          });
        }

        // Extract risk flags from specialist
        if (output.riskFlags && Array.isArray(output.riskFlags)) {
          for (const riskFlag of output.riskFlags) {
            risks.push({
              id: String(riskId++),
              category: this.capitalizeFirst(specialist),
              title: riskFlag.flag,
              description: riskFlag.description,
              severity: riskFlag.severity || 'medium',
              likelihood: 'medium',
              impact: riskFlag.description,
              mitigation: riskFlag.recommendation || 'Review and address this issue.',
              relatedFindings: [],
              confidence: output.confidence || 0.85,
            });

            // Add corresponding recommendation
            if (riskFlag.recommendation) {
              recommendations.push({
                id: String(recId++),
                category: this.capitalizeFirst(specialist),
                priority: riskFlag.severity || 'medium',
                title: `Address: ${riskFlag.flag}`,
                description: riskFlag.recommendation,
                rationale: riskFlag.description,
                suggestedAction: riskFlag.recommendation,
                relatedRisks: [String(riskId - 1)],
              });
            }
          }
        }

        // Extract contract-specific findings
        if (specialist === 'contract' && 'clauses' in output) {
          const contractOutput = output as SpecialistOutputs['contract'];
          if (contractOutput?.clauses) {
            // Add key clause findings
            if (contractOutput.clauses.term) {
              findings.push({
                id: String(findingId++),
                type: 'term',
                category: 'Contract Terms',
                summary: 'Contract Duration',
                details: `Duration: ${contractOutput.clauses.term.duration}${contractOutput.clauses.term.renewalTerms ? `. Renewal: ${contractOutput.clauses.term.renewalTerms}` : ''}`,
                location: { section: 'Term' },
                severity: 'low',
                confidence: contractOutput.confidence || 0.85,
              });
            }
            if (contractOutput.clauses.confidentiality) {
              findings.push({
                id: String(findingId++),
                type: 'obligation',
                category: 'Confidentiality',
                summary: 'Confidentiality Period',
                details: `Period: ${contractOutput.clauses.confidentiality.period}. Scope: ${contractOutput.clauses.confidentiality.scope}`,
                location: { section: 'Confidentiality' },
                severity: 'medium',
                confidence: contractOutput.confidence || 0.85,
              });
            }
            if (contractOutput.clauses.governingLaw) {
              findings.push({
                id: String(findingId++),
                type: 'clause',
                category: 'Governing Law',
                summary: 'Jurisdiction',
                details: `Jurisdiction: ${contractOutput.clauses.governingLaw.jurisdiction}${contractOutput.clauses.governingLaw.disputeResolution ? `. Dispute Resolution: ${contractOutput.clauses.governingLaw.disputeResolution}` : ''}`,
                location: { section: 'Governing Law' },
                severity: 'low',
                confidence: contractOutput.confidence || 0.85,
              });
            }
            if (contractOutput.clauses.liabilityLimitation) {
              findings.push({
                id: String(findingId++),
                type: 'clause',
                category: 'Liability',
                summary: 'Limitation of Liability',
                details: `Cap: ${contractOutput.clauses.liabilityLimitation.cap || 'Not specified'}${contractOutput.clauses.liabilityLimitation.exclusions?.length ? `. Exclusions: ${contractOutput.clauses.liabilityLimitation.exclusions.join(', ')}` : ''}`,
                location: { section: 'Liability' },
                severity: 'high',
                confidence: contractOutput.confidence || 0.85,
              });
            }
          }

          // Add contract type info
          if (contractOutput?.contractType) {
            findings.push({
              id: String(findingId++),
              type: 'clause',
              category: 'Document Type',
              summary: `${contractOutput.contractType.type.toUpperCase()} - ${contractOutput.contractType.isMutual ? 'Mutual' : 'One-sided'}`,
              details: `This is a ${contractOutput.contractType.isMutual ? 'mutual' : 'one-sided'} ${contractOutput.contractType.type.toUpperCase()}${contractOutput.contractType.subtype ? ` (${contractOutput.contractType.subtype})` : ''}`,
              location: { section: 'Overview' },
              severity: 'low',
              confidence: contractOutput.confidence || 0.85,
            });
          }
        }

        // Update overall confidence
        if (output.confidence) {
          overallConfidence = Math.min(overallConfidence, output.confidence);
        }
      }
    }

    // Extract findings from legal metadata if no specialist outputs
    if (legalMetadata && findings.length === 0) {
      let findingId = 1;

      // Document type
      if (legalMetadata.documentType) {
        findings.push({
          id: String(findingId++),
          type: 'clause',
          category: 'Document Classification',
          summary: `Document Type: ${legalMetadata.documentType.type}`,
          details: legalMetadata.documentType.reasoning || `Classified as ${legalMetadata.documentType.type} with ${(legalMetadata.documentType.confidence * 100).toFixed(0)}% confidence`,
          location: { section: 'Overview' },
          severity: 'low',
          confidence: legalMetadata.documentType.confidence,
        });
      }

      // Parties
      if (legalMetadata.parties?.parties?.length > 0) {
        const partyNames = legalMetadata.parties.parties.map(p => p.name).join(', ');
        findings.push({
          id: String(findingId++),
          type: 'clause',
          category: 'Parties',
          summary: 'Contracting Parties',
          details: `Identified parties: ${partyNames}`,
          location: { section: 'Parties' },
          severity: 'low',
          confidence: legalMetadata.parties.confidence,
        });
      }

      // Key dates
      if (legalMetadata.dates?.dates?.length > 0) {
        for (const date of legalMetadata.dates.dates) {
          findings.push({
            id: String(findingId++),
            type: 'term',
            category: 'Dates',
            summary: `${date.dateType.replace(/_/g, ' ')}`,
            details: `${date.originalText} (${date.normalizedDate})`,
            location: { section: 'Dates' },
            severity: 'low',
            confidence: date.confidence,
          });
        }
      }

      overallConfidence = legalMetadata.confidence?.overall || 0.85;
    }

    // Generate summary
    let summary = finalReport || '';
    if (!summary && specialistOutputs) {
      const specialists = Object.keys(specialistOutputs);
      const summaries = Object.values(specialistOutputs)
        .filter(o => o?.summary)
        .map(o => o!.summary);
      summary = summaries.length > 0
        ? summaries.join(' ')
        : `Analysis completed by ${specialists.join(', ')} specialist${specialists.length > 1 ? 's' : ''}.`;
    }
    if (!summary && legalMetadata) {
      summary = `Document analyzed: ${legalMetadata.documentType?.type || 'Unknown type'}. ${findings.length} findings identified.`;
    }

    return {
      taskId,
      documentId,
      documentName,
      summary,
      findings,
      risks,
      recommendations,
      metadata: {
        analyzedAt: new Date().toISOString(),
        confidence: overallConfidence,
        model: 'claude-sonnet-4-20250514',
      },
      legalMetadata,
      specialistOutputs,
    };
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Convert a File to base64 data URL
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Start a legal document analysis through the A2A framework
   *
   * This uses the same flow as normal conversations:
   * 1. ExecutionContext must be initialized (via createAnalysisConversation)
   * 2. Makes direct fetch POST to /api/v1/tasks (A2A endpoint)
   * 3. Backend creates task record, then hands to API runner which processes the analysis
   *
   * This ensures proper conversation/task creation and LLM usage tracking.
   *
   * @param request - Analysis request parameters
   * @returns AnalysisTaskResponse with taskId and initial status
   */
  async startAnalysis(request: CreateAnalysisRequest): Promise<AnalysisTaskResponse> {
    try {
      // Verify ExecutionContext is initialized
      const executionContextStore = useExecutionContextStore();
      if (!executionContextStore.isInitialized) {
        throw new Error('ExecutionContext not initialized. Create conversation first.');
      }

      // Generate a new taskId for this execution
      const taskId = executionContextStore.newTaskId();
      const ctx = executionContextStore.current;

      console.log('[LegalDepartment] Starting analysis via A2A framework', {
        conversationId: ctx.conversationId,
        taskId,
        agentSlug: ctx.agentSlug,
        documentId: request.documentId,
      });

      const token = getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Build A2A request payload
      // The Legal Department agent supports 'build' mode for document analysis
      const a2aPayload = {
        context: ctx, // Full ExecutionContext capsule
        mode: 'build',
        payload: {
          action: 'create',
          data: {
            analysisType: 'legal-document-analysis',
            documentId: request.documentId,
            documentName: request.documentName,
            documentType: request.documentType,
            options: request.options || {
              extractKeyTerms: true,
              identifyRisks: true,
              generateRecommendations: true,
            },
          },
        },
        userMessage: `Analyze legal document: ${request.documentName}`,
      };

      // POST to A2A endpoint
      const response = await fetch(`${API_BASE_URL}/api/v1/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(a2aPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Analysis request failed');
      }

      const result = await response.json();
      console.log('[LegalDepartment] A2A execution result:', result);

      // Handle A2A result
      if (result.error) {
        throw new Error(result.error.message || 'Analysis execution failed');
      }

      // Extract analysis response from A2A result
      const taskResponse: AnalysisTaskResponse = {
        taskId,
        status: 'running',
      };

      // Handle deliverable response (BUILD mode returns deliverable)
      if (result.result?.payload?.content) {
        try {
          const content = result.result.payload.content;
          const parsed = typeof content === 'string' ? JSON.parse(content) : content;

          // Extract analysis results
          if (parsed.results) {
            taskResponse.results = parsed.results as AnalysisResults;
          }

          // Update status based on response
          if (parsed.status === 'completed') {
            taskResponse.status = 'completed';
          } else if (parsed.status === 'failed') {
            taskResponse.status = 'failed';
            taskResponse.error = parsed.error;
          }
        } catch (parseError) {
          console.error('[LegalDepartment] Failed to parse analysis response:', parseError);
        }
      }

      // Update ExecutionContext if backend returned updated context
      if (result.result?.context) {
        executionContextStore.update(result.result.context);
      }

      return taskResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis execution failed';
      console.error('[LegalDepartment] Analysis failed:', error);
      throw new Error(message);
    }
  }

  /**
   * Get analysis status
   *
   * Polls for the current status of a running analysis.
   * This is a non-A2A endpoint for status checking.
   *
   * @param taskId - The task ID
   * @returns AnalysisTaskResponse with current status
   */
  async getAnalysisStatus(taskId: string): Promise<AnalysisTaskResponse> {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/legal/analysis/${taskId}/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get analysis status');
      }

      const result = await response.json();
      return result.data as AnalysisTaskResponse;
    } catch (error) {
      console.error('Failed to get analysis status:', error);
      throw error;
    }
  }

  /**
   * Get analysis results
   *
   * Fetches the complete analysis results for a completed task.
   * This is a non-A2A endpoint for result retrieval.
   *
   * @param taskId - The task ID
   * @returns AnalysisResults
   */
  async getAnalysisResults(taskId: string): Promise<AnalysisResults> {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/legal/analysis/${taskId}/results`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get analysis results');
      }

      const result = await response.json();
      return result.data as AnalysisResults;
    } catch (error) {
      console.error('Failed to get analysis results:', error);
      throw error;
    }
  }

  /**
   * Get document by ID
   *
   * Fetches document metadata for display.
   * This is a non-A2A endpoint for document retrieval.
   *
   * @param documentId - The document ID
   * @returns UploadedDocument
   */
  async getDocument(documentId: string): Promise<UploadedDocument> {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/legal/documents/${documentId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get document');
      }

      const result = await response.json();
      return result.data as UploadedDocument;
    } catch (error) {
      console.error('Failed to get document:', error);
      throw error;
    }
  }

  /**
   * Delete a document
   *
   * Removes a document from storage.
   * This is a non-A2A endpoint for document deletion.
   *
   * @param documentId - The document ID
   */
  async deleteDocument(documentId: string): Promise<void> {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/legal/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      throw error;
    }
  }

  /**
   * Upload a document (without starting analysis)
   *
   * Uploads the file to storage and returns document metadata.
   * This is a separate step from analysis, allowing users to configure
   * analysis options before starting.
   *
   * @param file - The file to upload
   * @param orgSlug - Organization slug for storage path
   * @returns UploadedDocument with id, name, size, type, and url
   */
  async uploadDocument(file: File, orgSlug: string): Promise<UploadedDocument> {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    console.log('[LegalDepartment] Uploading document', {
      filename: file.name,
      size: file.size,
      type: file.type,
      orgSlug,
    });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('orgSlug', orgSlug);

      const response = await fetch(`${API_BASE_URL}/api/v1/legal/documents/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // Don't set Content-Type - browser will set it with boundary for multipart/form-data
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Upload failed');
      }

      const result = await response.json();
      console.log('[LegalDepartment] Document uploaded:', result);

      // Return uploaded document info
      const uploadedDoc: UploadedDocument = {
        id: result.data?.id || result.id || crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type as DocumentType,
        uploadedAt: new Date().toISOString(),
        url: result.data?.url || result.url,
      };

      return uploadedDoc;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      console.error('[LegalDepartment] Upload failed:', error);
      throw new Error(message);
    }
  }

  /**
   * Send a text-only query to the Legal Department AI
   *
   * Handles legal questions without document attachments.
   * The backend routes these to appropriate specialists based on the query content.
   *
   * @param message - The legal question or request
   * @returns AnalysisTaskResponse with results
   */
  async sendTextQuery(
    message: string
  ): Promise<AnalysisTaskResponse & {
    analysisResults?: AnalysisResults;
  }> {
    // Verify ExecutionContext is initialized
    const executionContextStore = useExecutionContextStore();
    if (!executionContextStore.isInitialized) {
      throw new Error('ExecutionContext not initialized. Create conversation first.');
    }

    // Generate a new taskId for this execution
    const taskId = executionContextStore.newTaskId();
    const ctx = executionContextStore.current;

    console.log('[LegalDepartment] Sending text query via A2A framework', {
      conversationId: ctx.conversationId,
      taskId,
      agentSlug: ctx.agentSlug,
      message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
    });

    const token = getAuthToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    try {
      // Build JSON request for text-only query (no documents)
      const requestBody = {
        context: ctx,
        mode: 'converse',
        userMessage: message,
        payload: {
          analysisType: 'legal-question',
          // No documents - text-only query
        },
      };

      console.log('[LegalDepartment] Sending invoke/stream text query');

      // Use invoke/stream contract for text queries
      const invokeContent = {
        type: 'legal-question',
        ...requestBody.payload,
        userMessage: requestBody.userMessage,
      };

      this.pendingStreamOutput = null;

      invokeStreamClient(
        ctx,
        { content: invokeContent, contentType: 'json' },
        { baseUrl: API_BASE_URL, token },
        (event: StreamEvent) => {
          console.log('[LegalDepartment] Stream event:', event.event);
          if (event.event === 'output') {
            this.pendingStreamOutput = event.data as Record<string, unknown>;
            console.log('[LegalDepartment] Stream output captured');
          }
          if (event.event === 'error') {
            const errorData = event.data as { message?: string } | undefined;
            console.error('[LegalDepartment] Stream error:', errorData?.message);
          }
          if (event.event === 'completed') {
            console.log('[LegalDepartment] Invoke stream completed');
          }
        },
      );

      console.log('[LegalDepartment] Text query started via invoke/stream, waiting for SSE updates...');

      // Return immediately — no analysisResults yet.
      // Results will arrive via SSE observability events → completionCallback
      const taskResponse: AnalysisTaskResponse & {
        analysisResults?: AnalysisResults;
      } = {
        taskId,
        status: 'running',
      };

      return taskResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Query failed';
      console.error('[LegalDepartment] Text query failed:', error);
      throw new Error(message);
    }
  }

  /**
   * Record an HITL (Human-in-the-Loop) decision from attorney review
   *
   * Records the attorney's decision (approve, reject, request_reanalysis)
   * for the analysis results. This creates an audit trail and may trigger
   * follow-up actions depending on the decision.
   *
   * @param taskId - The task/analysis ID being reviewed
   * @param action - The attorney's decision
   * @param comment - Optional comment explaining the decision
   * @returns Success status
   */
  async recordHITLDecision(
    taskId: string,
    action: 'approve' | 'reject' | 'request_reanalysis',
    comment?: string
  ): Promise<{ success: boolean; message?: string }> {
    const executionContextStore = useExecutionContextStore();
    if (!executionContextStore.isInitialized) {
      throw new Error('ExecutionContext not initialized.');
    }

    const ctx = executionContextStore.current;
    const token = getAuthToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    console.log('[LegalDepartment] Recording HITL decision', {
      taskId,
      action,
      comment,
      conversationId: ctx.conversationId,
    });

    try {
      // Send HITL decision to the A2A endpoint
      // This records the decision and may trigger follow-up workflows
      const requestBody = {
        context: ctx,
        mode: 'hitl',
        payload: {
          action: 'resume',  // Required by DTO validation for HITL mode
          hitlMethod: 'hitl.resume',  // Routes to correct handler
          taskId,
          decision: action,
          feedback: comment,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
        userMessage: `Attorney ${action}${comment ? `: ${comment}` : ''}`,
      };

      // Use invoke contract for HITL resume
      const invokeContent = {
        type: 'legal-hitl-resume',
        ...requestBody.payload,
        userMessage: requestBody.userMessage,
      };

      const response = await fetch(`${API_BASE_URL}/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          method: 'invoke',
          params: {
            context: ctx,
            data: { content: invokeContent, contentType: 'json' },
          },
        }),
      });

      if (!response.ok) {
        // Non-critical error - the decision was already taken in the UI
        console.warn('[LegalDepartment] Failed to record HITL decision to backend:', response.status);
        return { success: true, message: 'Decision recorded locally (backend sync pending)' };
      }

      const result = await response.json();
      console.log('[LegalDepartment] HITL decision recorded:', result);

      return { success: true, message: 'Decision recorded successfully' };
    } catch (error) {
      // Non-critical error - allow the UI to proceed
      console.warn('[LegalDepartment] Error recording HITL decision:', error);
      return { success: true, message: 'Decision recorded locally' };
    }
  }

  /**
   * Connect to SSE stream for real-time progress updates
   *
   * Uses the observability stream endpoint to receive progress events
   * emitted by LangGraph nodes during document analysis.
   *
   * @param conversationId - The conversation ID to filter events
   * @param onProgress - Callback for progress updates
   */
  connectToSSEStream(conversationId: string, onProgress: ProgressCallback, onComplete?: CompletionCallback): void {
    // Disconnect any existing connection
    this.disconnectSSEStream();

    this.progressCallback = onProgress;
    this.completionCallback = onComplete || null;

    // Create SSE client with reconnection config
    this.sseClient = new SSEClient({
      maxReconnectAttempts: 5,
      reconnectDelay: 2000,
      debug: false, // Set to true for debugging
    });

    // Get auth token for SSE
    const token = getAuthToken();
    if (!token) {
      console.warn('[LegalDepartment] No auth token for SSE connection');
      return;
    }

    // Build SSE URL with conversationId filter
    const sseUrl = `${API_BASE_URL}/observability/stream?conversationId=${conversationId}&token=${encodeURIComponent(token)}`;

    console.log('[LegalDepartment] Connecting to SSE stream for conversation:', conversationId);

    // Listen for connection state changes
    const stateCleanup = this.sseClient.onStateChange((sseState) => {
      console.log('[LegalDepartment] SSE state:', sseState);
    });
    this.sseCleanup.push(stateCleanup);

    // Listen for errors
    const errorCleanup = this.sseClient.onError((error) => {
      console.error('[LegalDepartment] SSE error:', error);
    });
    this.sseCleanup.push(errorCleanup);

    // Listen for data events
    const messageCleanup = this.sseClient.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);

        // Skip connection confirmation events
        if (data.event_type === 'connected') {
          console.log('[LegalDepartment] SSE connection confirmed');
          return;
        }

        // Handle observability event
        this.handleObservabilityEvent(data);
      } catch (err) {
        console.error('[LegalDepartment] Failed to parse SSE event:', err);
      }
    });
    this.sseCleanup.push(messageCleanup);

    // Connect to stream
    this.sseClient.connect(sseUrl);
  }

  /**
   * Handle observability events from SSE stream
   *
   * Parses progress events emitted by LangGraph nodes and calls
   * the progress callback with normalized event data.
   *
   * Event structure from ObservabilityEventsService:
   * - hook_event_type: 'langgraph.processing', 'langgraph.started', etc.
   * - status: 'processing', 'started', 'completed', etc.
   * - progress: number (0-100) at top level
   * - step: string at top level
   * - message: string at top level
   * - context: { conversationId, taskId, userId, etc. }
   */
  private handleObservabilityEvent(event: Record<string, unknown>): void {
    const hookEventType = event?.hook_event_type as string;
    const status = event?.status as string;

    // Handle task completion events (from async background execution or LangGraph)
    if (hookEventType === 'agent.completed' || hookEventType === 'task.completed' || hookEventType === 'langgraph.completed') {
      this.handleAsyncCompletion(event);
      return;
    }

    // Handle task failure events
    if (hookEventType === 'agent.failed' || hookEventType === 'task.failed' || hookEventType === 'langgraph.failed') {
      this.handleAsyncFailure(event);
      return;
    }

    // Filter for progress-related events
    const isProgressEvent =
      hookEventType?.startsWith('langgraph.') ||
      status === 'processing' ||
      status === 'started' ||
      typeof event?.progress === 'number';

    if (!isProgressEvent) {
      return;
    }

    // Extract progress information directly from top-level fields
    const step = (event?.step as string) || status || 'processing';
    const progress = (event?.progress as number) || 0;
    const message = (event?.message as string) || '';

    console.log('[LegalDepartment] Progress event:', { hookEventType, step, progress, message });

    // Call progress callback
    if (this.progressCallback) {
      this.progressCallback({
        step,
        progress,
        message,
        metadata: event as Record<string, unknown>,
      });
    }
  }

  /**
   * Handle async task completion from SSE stream.
   * Fetches the full task result and calls the completion callback.
   */
  private async handleAsyncCompletion(event: Record<string, unknown>): Promise<void> {
    const context = event?.context as Record<string, unknown> | undefined;
    const taskId = (context?.conversationId as string) || '';

    console.log('[LegalDepartment] Task completed via SSE:', taskId);

    // Capture callback before async work — disconnectSSEStream may null it during await
    const callback = this.completionCallback;
    if (!callback) {
      console.warn('[LegalDepartment] No completion callback registered');
      return;
    }

    // Use the output captured from the invoke/stream response
    if (this.pendingStreamOutput) {
      console.log('[LegalDepartment] Using captured stream output');
      const analysisResults = this.transformStreamOutput(this.pendingStreamOutput);
      this.pendingStreamOutput = null;
      callback({ taskId, analysisResults });
      return;
    }

    // Stream output may arrive slightly after SSE completion — wait briefly
    console.log('[LegalDepartment] Waiting for stream output...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (this.pendingStreamOutput) {
      console.log('[LegalDepartment] Stream output arrived after wait');
      const analysisResults = this.transformStreamOutput(this.pendingStreamOutput);
      this.pendingStreamOutput = null;
      callback({ taskId, analysisResults });
      return;
    }

    // No stream output available — call completion with no results
    console.warn('[LegalDepartment] No stream output available, completing without results');
    callback({ taskId });
  }

  /**
   * Transform invoke/stream output into AnalysisResults.
   * The stream output contains the invoke contract response with output.content.
   */
  private transformStreamOutput(streamOutput: Record<string, unknown>): AnalysisResults | undefined {
    try {
      // The stream output event data is the invoke result output
      // It may be { content, outputType, metadata } or the raw content
      const content = (streamOutput as { content?: unknown })?.content || streamOutput;

      // Parse content if it's a string
      const parsed = typeof content === 'string' ? JSON.parse(content) : content;

      console.log('[LegalDepartment] Transforming stream output:', {
        type: typeof parsed,
        keys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : [],
      });

      // Handle plain text response
      if (typeof parsed === 'string') {
        return {
          taskId: '',
          documentId: '',
          documentName: 'Analysis',
          summary: parsed,
          findings: [],
          risks: [],
          recommendations: [],
          metadata: {
            analyzedAt: new Date().toISOString(),
            confidence: 0.85,
            model: 'claude-sonnet-4-20250514',
          },
        };
      }

      // Handle structured response
      const specialistOutputs = parsed.specialistOutputs || parsed.data?.specialistOutputs;
      const finalReport = parsed.response || parsed.data?.response;
      const legalMetadata = parsed.legalMetadata || parsed.data?.legalMetadata;

      if (!specialistOutputs && !legalMetadata && !finalReport) {
        // Plain text in the response field
        const plainResponse = parsed.response || parsed.summary || parsed.text || JSON.stringify(parsed);
        return {
          taskId: '',
          documentId: '',
          documentName: 'Analysis',
          summary: plainResponse,
          findings: [],
          risks: [],
          recommendations: [],
          metadata: {
            analyzedAt: new Date().toISOString(),
            confidence: 0.85,
            model: 'claude-sonnet-4-20250514',
          },
        };
      }

      return this.transformToAnalysisResults(
        '', '', 'Analysis',
        specialistOutputs, legalMetadata, finalReport, undefined,
      );
    } catch (err) {
      console.error('[LegalDepartment] Failed to transform stream output:', err);
      return undefined;
    }
  }

  /**
   * Handle async task failure from SSE stream.
   */
  private handleAsyncFailure(event: Record<string, unknown>): void {
    const context = event?.context as Record<string, unknown> | undefined;
    const taskId = (context?.taskId as string) || '';
    const message = (event?.message as string) || 'Analysis failed';

    console.error('[LegalDepartment] Task failed via SSE:', taskId, message);

    if (this.completionCallback) {
      this.completionCallback({ taskId, error: message });
    }
  }

  /**
   * Fetch completed task result from API and transform to AnalysisResults.
   */
  private async fetchAndTransformResult(taskId: string): Promise<AnalysisResults | undefined> {
    const token = getAuthToken();
    if (!token || !taskId) return undefined;

    try {
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        console.error('[LegalDepartment] Failed to fetch task result:', response.status);
        return undefined;
      }

      const task = await response.json();
      const taskResponse = typeof task.response === 'string'
        ? JSON.parse(task.response)
        : task.response;

      if (!taskResponse) {
        console.warn('[LegalDepartment] Task has no response data');
        return undefined;
      }

      // Extract data from various possible response paths (same paths as sync handler)
      const content = taskResponse.result?.payload?.content
        || taskResponse.payload?.content
        || taskResponse.result
        || taskResponse;

      const specialistOutputs = content.specialistOutputs || content.data?.specialistOutputs;
      const finalReport = content.response || content.data?.response;
      const legalMetadata = content.legalMetadata || content.data?.legalMetadata;
      const routingDecision = content.routingDecision || content.data?.routingDecision;

      console.log('[LegalDepartment] Fetched task result:', {
        hasSpecialistOutputs: !!specialistOutputs,
        hasFinalReport: !!finalReport,
        hasLegalMetadata: !!legalMetadata,
        hasRoutingDecision: !!routingDecision,
      });

      if (!specialistOutputs && !legalMetadata && !finalReport) {
        // If no structured data, check if there's a plain text response
        const plainResponse = typeof content === 'string' ? content : content.response;
        if (plainResponse) {
          return {
            taskId,
            documentId: taskId,
            documentName: 'Analysis',
            summary: plainResponse,
            findings: [],
            risks: [],
            recommendations: [],
            metadata: {
              analyzedAt: new Date().toISOString(),
              confidence: 0.85,
              model: 'claude-sonnet-4-20250514',
            },
          };
        }
        return undefined;
      }

      return this.transformToAnalysisResults(
        taskId,
        taskId,
        'Analysis',
        specialistOutputs,
        legalMetadata,
        finalReport,
        routingDecision
      );
    } catch (error) {
      console.error('[LegalDepartment] Error fetching task result:', error);
      return undefined;
    }
  }

  /**
   * Disconnect from SSE stream
   *
   * Cleans up event listeners and closes the connection.
   * Safe to call multiple times.
   */
  disconnectSSEStream(): void {
    // Clean up all event listeners
    this.sseCleanup.forEach((cleanup) => cleanup());
    this.sseCleanup = [];

    // Disconnect SSE client
    if (this.sseClient) {
      this.sseClient.disconnect();
      this.sseClient = null;
    }

    this.progressCallback = null;
    this.completionCallback = null;
    console.log('[LegalDepartment] SSE stream disconnected');
  }
}

// Export singleton instance
export const legalDepartmentService = new LegalDepartmentService();
