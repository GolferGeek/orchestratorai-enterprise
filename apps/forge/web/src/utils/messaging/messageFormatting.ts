import type { AgentChatMessage, ConversationPlanRecord, OrchestrationRunRecord, AgentOrchestrationRecord } from '@/types/conversation';
import type { Task } from '@/types/task';
import type { JsonObject } from '@orchestrator-ai/transport-types';

/**
 * Extract content from various response formats
 */
function extractContent(
  parsedResult: Record<string, unknown>,
  fallback: string,
): string {
  // A2A format: { success: true, payload: { content: { message: "..." } } }
  if (parsedResult.success && parsedResult.payload) {
    const payload = parsedResult.payload as Record<string, unknown>;
    if (payload.content) {
      const content = payload.content as Record<string, unknown>;
      if (content.message && typeof content.message === 'string') {
        return content.message;
      }
    }
  }

  // Try payload.content.message without success flag
  if (parsedResult.payload) {
    const payload = parsedResult.payload as Record<string, unknown>;
    if (payload.content) {
      const content = payload.content as Record<string, unknown>;
      if (content.message && typeof content.message === 'string') {
        return content.message;
      }
    }
  }

  // Try result.content.message (agent2agent format)
  if (parsedResult.result) {
    const result = parsedResult.result as Record<string, unknown>;
    if (result.content) {
      const content = result.content as Record<string, unknown>;
      if (content.message && typeof content.message === 'string') {
        return content.message;
      }
    }
  }

  // Try content.message
  if (parsedResult.content) {
    const content = parsedResult.content as Record<string, unknown>;
    if (content.message && typeof content.message === 'string') {
      return content.message;
    }
    // If content is a string directly
    if (typeof content === 'string') {
      return content;
    }
  }

  // Try message field directly
  if (parsedResult.message && typeof parsedResult.message === 'string') {
    return parsedResult.message;
  }

  // Try response field
  if (parsedResult.response && typeof parsedResult.response === 'string') {
    return parsedResult.response;
  }

  // If we still have an object, try to stringify it (shouldn't happen, but handle gracefully)
  if (typeof parsedResult === 'object' && parsedResult !== null) {
    // Check if it's a TaskResponseDto-like structure that wasn't extracted
    const asRecord = parsedResult as Record<string, unknown>;
    if (asRecord.success && asRecord.payload) {
      const payload = asRecord.payload as Record<string, unknown>;
      if (payload.content) {
        const content = payload.content as Record<string, unknown>;
        if (content.message && typeof content.message === 'string') {
          return content.message;
        }
      }
    }
  }

  // Fallback
  return fallback;
}

/**
 * Service for formatting and processing agent response messages
 */
export class MessageFormattingService {
  
  /**
   * Create a response message from a completed task
   */
  createResponseMessage(conversationId: string, task: Task): AgentChatMessage | null {
    
    let responseContent = 'Task completed successfully.';
    let responseMetadata: Record<string, unknown> = {};
    
    // Check both task.response (database field) and task.result (immediate mode field)
    const responseData = task.response || task.result;
    
    // Also check for deliverable ID directly on the task
    const taskWithDeliverable = task as Task & { deliverableId?: string };
    if (taskWithDeliverable.deliverableId) {
      responseMetadata.deliverableId = taskWithDeliverable.deliverableId;
    }
    
    if (responseData) {
      try {
        // Try to parse JSON if it's a string
        let parsedResult;
        if (typeof responseData === 'string') {
          try {
            parsedResult = JSON.parse(responseData);
          } catch {
            // Not JSON, use as plain text
            responseContent = responseData;
            parsedResult = null;
          }
        } else {
          parsedResult = responseData;
        }
        
        // Extract content from various possible formats
        if (parsedResult) {
          if (typeof parsedResult === 'string') {
            responseContent = parsedResult;
          } else {
            responseContent = extractContent(parsedResult, responseContent);
            responseMetadata = parsedResult.metadata || {};

            if (parsedResult.deliverableId) {
              responseMetadata.deliverableId = parsedResult.deliverableId;
            }
            if (parsedResult.planId) {
              responseMetadata.planId = parsedResult.planId;
            }
          }
        }
        
        
        // Check if this is a completed workflow response with embedded progress steps
        if (responseContent.includes('**📋 Requirements Document:**')) {
          const docSectionMatch = responseContent.match(/\*\*📋 Requirements Document:\*\*\n\n([\s\S]*)/);
          if (docSectionMatch && docSectionMatch[1]) {
            responseContent = docSectionMatch[1].trim();
          }
        }

      } catch {
        // If parsing fails, use the raw response
        responseContent = String(responseData);
        
        // Also check raw content for embedded document
        if (responseContent.includes('**📋 Requirements Document:**')) {
          const docSectionMatch = responseContent.match(/\*\*📋 Requirements Document:\*\*\n\n([\s\S]*)/);
          if (docSectionMatch && docSectionMatch[1]) {
            responseContent = docSectionMatch[1].trim();
          }
        }
        
        // Also check if raw content has JSON data with the document
        if (responseContent.includes('"response":') && (responseContent.includes('# Technical Requirements Document') || responseContent.includes('# '))) {
          try {
            // Try to extract the response field from JSON string
            const jsonMatch = responseContent.match(/"response":\s*"([^"]+)"/);
            if (jsonMatch && jsonMatch[1]) {
              responseContent = jsonMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
            }
          } catch {
            // Keep original content
          }
        }
      }
    }

    const taskWithTaskId = task as Task & { taskId?: string };
    const message: AgentChatMessage = {
      id: `response-${Date.now()}`,
      role: 'assistant' as const,
      content: responseContent,
      timestamp: new Date(),
      taskId: taskWithTaskId.taskId,
      metadata: {
        isPlaceholder: false,
        isCompleted: true,
        completedAt: new Date().toISOString(),
        ...responseMetadata,
      },
    };

    // Set deliverableId and planId directly on the message if present in metadata
    if (responseMetadata.deliverableId && typeof responseMetadata.deliverableId === 'string') {
      message.deliverableId = responseMetadata.deliverableId;
    }
    if (responseMetadata.planId && typeof responseMetadata.planId === 'string') {
      message.planId = responseMetadata.planId;
    }

    return message;
  }

  /**
   * Create a user message
   */
  createUserMessage(content: string): AgentChatMessage {
    return {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
      metadata: {}
    };
  }

  /**
   * Create a placeholder message for ongoing tasks
   */
  createPlaceholderMessage(taskId: string, mode?: string): AgentChatMessage {
    // Friendlier, mode-aware placeholder bubble text
    let content = 'Processing your request...';
    // Ensure mode is a string before calling toLowerCase
    const m = typeof mode === 'string' ? mode.toLowerCase() : '';
    if (m === 'converse') {
      content = 'One sec — thinking it through…';
    } else if (m === 'plan') {
      content = 'Sketching a quick plan…';
    }

    return {
      id: `placeholder-${Date.now()}`,
      role: 'assistant' as const,
      content,
      timestamp: new Date(),
      taskId,
      metadata: {
        isPlaceholder: true,
        isCompleted: false,
        completedSteps: [],
        mode: m || undefined,
      },
    };
  }

  /**
   * Extract and format deliverable content from task response
   */
  extractDeliverableContent(task: Task): string {
    
    let finalContent = '';
    
    // Check both task.response (database field) and task.result (immediate mode field)
    const responseData = task.response || task.result;
    
    if (responseData) {
      try {
        // Try to parse JSON if it's a string
        let parsedResult;
        if (typeof responseData === 'string') {
          try {
            parsedResult = JSON.parse(responseData);
          } catch {
            // Not JSON, use as plain text
            finalContent = responseData;
            parsedResult = null;
          }
        } else {
          parsedResult = responseData;
        }
        
        // Extract content from various possible formats
        if (parsedResult) {
          // New A2A format: { success: true, payload: { content: { message: "..." } } }
          if (parsedResult.success && parsedResult.payload?.content?.message) {
            finalContent = String(parsedResult.payload.content.message);
          } else if (parsedResult.success && parsedResult.message) {
            // Format: { success: true, message: "content", metadata: {...} } (orchestrator format)
            finalContent = String(parsedResult.message);
          } else if (parsedResult.success && parsedResult.response) {
            // Format: { success: true, response: "content", metadata: {...} }
            finalContent = String(parsedResult.response);
          } else if (parsedResult.payload?.content?.message) {
            // A2A format without success flag
            finalContent = String(parsedResult.payload.content.message);
          } else if (parsedResult.message) {
            // Format: { message: "content" }
            finalContent = String(parsedResult.message);
          } else if (parsedResult.response) {
            // Format: { response: "content" }
            finalContent = String(parsedResult.response);
          } else if (parsedResult.content) {
            // Format: { content: "content" }
            finalContent = String(parsedResult.content);
          } else if (parsedResult.result) {
            // Format: { result: "content" }
            finalContent = String(parsedResult.result);
          } else if (typeof parsedResult === 'string') {
            // Format: "content"
            finalContent = parsedResult;
          } else {
            // Fallback: stringify the whole object
            finalContent = JSON.stringify(parsedResult, null, 2);
          }
        }
      } catch (error) {
        console.error('🔄 Error parsing completion response:', error);
        finalContent = String(responseData);
      }
    }
    
    if (!finalContent || finalContent.trim() === '') {
      finalContent = 'No content was generated. Please check the logs for more details.';
    }

    return finalContent;
  }

  /**
   * Format progress messages for display
   */
  formatProgressContent(messages: AgentChatMessage[]): string {
    const progressMessages = messages.filter(msg => {
      const msgWithType = msg as AgentChatMessage & { messageType?: string };
      return msgWithType.messageType === 'progress';
    });
    let progressContent = 'Processing your request...\n\n';
    
    progressMessages.forEach(msg => {
      // Parse message content to extract step information
      try {
        const messageData = JSON.parse(msg.content);
        if (messageData.stepName && messageData.message) {
          const stepEmoji = messageData.status === 'completed' ? '✅' : '🔄';
          progressContent += `${stepEmoji} ${messageData.message}\n`;
        }
      } catch {
        // If not JSON, treat as plain text
        progressContent += `🔄 ${msg.content}\n`;
      }
    });
    
    return progressContent.trim();
  }

  createPlanMessage(plan: ConversationPlanRecord): AgentChatMessage {
    const summary = plan.summary || 'Plan draft generated.';
    const planDetails = JSON.stringify(plan.plan_json, null, 2);
    const content = `📋 Plan Draft (v${plan.version ?? 1})\n\n${summary}\n\n\uD83D\uDCCB Plan JSON:\n${planDetails}`;

    return {
      id: `plan-${plan.id}`,
      role: 'assistant',
      content,
      timestamp: new Date(plan.updated_at ?? plan.created_at ?? Date.now()),
      metadata: {
        planId: plan.id,
        extra: {
          plan: plan as unknown as JsonObject,
        },
      },
    };
  }

  createOrchestrationRunMessage(run: OrchestrationRunRecord): AgentChatMessage {
    const status = run.status ?? 'running';
    const planRef = run.plan_id ? `Plan: ${run.plan_id}` : 'Ad hoc execution';
    const content = `▶️ Orchestration Run Started\nStatus: ${status}\n${planRef}`;

    return {
      id: `run-${run.id}`,
      role: 'assistant',
      content,
      timestamp: new Date(run.started_at ?? Date.now()),
      metadata: {
        planId: run.plan_id ?? undefined,
        extra: {
          runId: run.id,
          run: run as unknown as JsonObject,
          status,
        },
      },
    };
  }

  createStreamMessage(streamId: string, label: string): AgentChatMessage {
    const now = new Date();
    return {
      id: `stream-${streamId}`,
      role: 'assistant',
      content: label,
      timestamp: now,
      metadata: {
        lastUpdated: now.toISOString(),
        extra: {
          streamId,
          isStreaming: true,
        },
      },
    };
  }

  updateStreamMessageFromRun(
    message: AgentChatMessage,
    run: OrchestrationRunRecord,
    statusLabel?: string,
  ): AgentChatMessage {
    const status = statusLabel ?? run.status ?? 'running';
    const planRef = run.plan_id ? `Plan: ${run.plan_id}` : 'Ad hoc execution';
    message.content = `▶️ Orchestration Run ${run.id}\nStatus: ${status}\n${planRef}`;
    const now = new Date();
    message.timestamp = now;
    message.metadata = {
      ...(message.metadata ?? {}),
      planId: run.plan_id ?? undefined,
      lastUpdated: now.toISOString(),
      extra: {
        ...(message.metadata?.extra ?? {}),
        isStreaming: true,
        runId: run.id,
        status,
        run: run as unknown as JsonObject,
      },
    };
    return message;
  }

  updateStreamMessageWithText(
    message: AgentChatMessage,
    text: string,
  ): AgentChatMessage {
    message.content = text;
    const now = new Date();
    message.timestamp = now;
    message.metadata = {
      ...(message.metadata ?? {}),
      lastUpdated: now.toISOString(),
      extra: {
        ...(message.metadata?.extra ?? {}),
        isStreaming: true,
      },
    };
    return message;
  }

  markStreamComplete(message: AgentChatMessage): AgentChatMessage {
    const now = new Date();
    message.metadata = {
      ...(message.metadata ?? {}),
      completedAt: now.toISOString(),
      extra: {
        ...(message.metadata?.extra ?? {}),
        isStreaming: false,
      },
    };
    return message;
  }

  markStreamError(message: AgentChatMessage, error: string): AgentChatMessage {
    const now = new Date();
    message.content = `⚠️ Stream error: ${error}`;
    message.metadata = {
      ...(message.metadata ?? {}),
      lastUpdated: now.toISOString(),
      errorDetails: error,
      extra: {
        ...(message.metadata?.extra ?? {}),
        isStreaming: false,
      },
    };
    message.timestamp = now;
    return message;
  }

  createSavedOrchestrationMessage(orchestration: AgentOrchestrationRecord): AgentChatMessage {
    const content = `✅ Saved orchestration recipe “${orchestration.display_name}” (slug: ${orchestration.slug}).`;

    return {
      id: `orch-${orchestration.id}`,
      role: 'assistant',
      content,
      timestamp: new Date(orchestration.updated_at ?? orchestration.created_at ?? Date.now()),
      metadata: {
        extra: {
          orchestrationId: orchestration.id,
          orchestration: orchestration as unknown as JsonObject,
        },
      },
    };
  }
}

// Export singleton instance
export const messageFormatting = new MessageFormattingService();
