import { tasksService } from '@/services/tasksService';
import type { AgentChatMessage } from '@/types/conversation';

/**
 * Service for managing conversation messages
 * Handles message loading, reconstruction from tasks, and active task management
 */
export class ConversationMessageService {
  /**
   * Load conversation messages from backend by reconstructing from tasks
   */
  async loadConversationMessages(conversationId: string): Promise<AgentChatMessage[]> {
    try {
      // Load all tasks for this conversation
      const tasksResponse = await tasksService.listTasks({
        conversationId: conversationId,
        limit: 100 // Load up to 100 tasks for this conversation
      });

      const tasks = tasksResponse.tasks || [];

      if (tasks.length > 0) {
        // Tasks loaded successfully
      }

      // Load deliverables for this conversation to link them to messages
      const deliverables: Array<{
        id: string;
        message_id?: string;
        metadata?: { taskId?: string };
      }> = [];
      try {
        const { getDeliverablesService } = await import('@/services/deliverablesService.impl');
        const conversationDeliverables = await getDeliverablesService().getConversationDeliverables(conversationId);
        deliverables.push(...conversationDeliverables);
      } catch {
        // Failed to load conversation deliverables
      }

      // Create maps for linking deliverables to messages
      const messageDeliverableMap = new Map<string, string>(); // message_id -> deliverableId
      const taskDeliverableMap = new Map<string, string>(); // task_id -> deliverableId

      // First, extract deliverableId from task responses and create task->deliverable mapping
      tasks.forEach(task => {
        if (task.response && task.status === 'completed') {
          try {
            const parsedResponse = JSON.parse(task.response);
            if (parsedResponse.deliverableId) {
              taskDeliverableMap.set(task.id, parsedResponse.deliverableId);
            }
          } catch {
            // Could not parse task response to extract deliverableId
          }
        }
      });

      deliverables.forEach((deliverable: { id: string; message_id?: string; metadata?: { taskId?: string } }) => {
        // Keep the existing logic for backwards compatibility
        if (deliverable.message_id) {
          messageDeliverableMap.set(deliverable.message_id, deliverable.id);
        }
        if (deliverable.metadata?.taskId) {
          taskDeliverableMap.set(deliverable.metadata.taskId, deliverable.id);
        }
      });

      const messages: AgentChatMessage[] = [];

      // Convert each task to a pair of messages (user prompt + assistant response)
      for (const task of tasks) {
        // Create user message from task prompt
        if (task.prompt) {
          const userMessage: AgentChatMessage = {
            id: `user-${task.id}`,
            role: 'user',
            content: task.prompt,
            timestamp: new Date(task.createdAt),
            taskId: task.id,
            metadata: {
              taskId: task.id,
              extra: {
                originalTaskData: {
                  method: task.method,
                  params: task.params,
                  status: task.status
                }
              }
            }
          };
          messages.push(userMessage);
        }

        // Create assistant message based on task status
        if (task.status === 'completed' && task.response) {
          // Parse the JSON response to extract the actual content and metadata
          let responseContent = task.response;
          let mergedResponseMetadata: Record<string, unknown> = {};
          let planId: string | undefined;

          try {
            const parsedResponse = typeof task.response === 'string'
              ? JSON.parse(task.response)
              : task.response;

            // Detect if this is a plan task and extract planId
            const taskMode = task.params?.mode || task.method?.includes('plan') ? 'plan' : null;
            if (taskMode === 'plan' || parsedResponse?.planId || parsedResponse?.result?.planId) {
              planId = parsedResponse?.planId || parsedResponse?.result?.planId || parsedResponse?.payload?.planId;
            }

            // Extract content - try multiple paths for different response formats
            let extractedContent = null;
            let hasDeliverable = false;

            // Check if this response has a deliverable (check for both deliverableId and deliverable object)
            if (parsedResponse?.deliverableId ||
                parsedResponse?.result?.deliverableId ||
                parsedResponse?.payload?.deliverableId ||
                parsedResponse?.deliverable ||
                parsedResponse?.result?.deliverable ||
                parsedResponse?.payload?.content?.deliverable) {
              hasDeliverable = true;
            }

            // For plan tasks, use a simple message instead of the full plan content
            if (planId) {
              extractedContent = parsedResponse?.payload?.content?.message ||
                                parsedResponse?.result?.content?.message ||
                                parsedResponse?.content?.message ||
                                'Plan created successfully';
            }
            // For build tasks with deliverables, use a simple message
            else if (hasDeliverable) {
              extractedContent = parsedResponse?.payload?.content?.message ||
                                parsedResponse?.result?.content?.message ||
                                parsedResponse?.content?.message ||
                                'Deliverable created successfully';
            }
            // For other tasks, extract the message content
            else {
              // Try payload.content.message (new format from screenshot)
              if (parsedResponse?.payload?.content?.message) {
                extractedContent = parsedResponse.payload.content.message;
              }
              // Try result.content.message (agent2agent format)
              else if (parsedResponse?.result?.content?.message) {
                extractedContent = parsedResponse.result.content.message;
              }
              // Try content.message
              else if (parsedResponse?.content?.message) {
                extractedContent = parsedResponse.content.message;
              }
              // Try message field directly
              else if (parsedResponse?.message) {
                extractedContent = parsedResponse.message;
              }
              // Try response or content fields
              else if (parsedResponse?.response) {
                extractedContent = parsedResponse.response;
              }
              else if (parsedResponse?.content) {
                extractedContent = parsedResponse.content;
              }
            }

            // Use extracted content or fall back to full response
            responseContent = extractedContent || parsedResponse;

            // Only stringify if it's still an object (shouldn't be if we extracted correctly)
            if (typeof responseContent === 'object') {
              // If this is a deliverable or plan response without a message, use a simple fallback
              if (hasDeliverable) {
                responseContent = 'Deliverable created';
              } else if (planId) {
                responseContent = 'Plan created';
              } else {
                responseContent = JSON.stringify(responseContent, null, 2);
              }
            }

            // Merge backend-provided metadata (provider/model/usage, etc.)
            if (parsedResponse && typeof parsedResponse === 'object') {
              // Extract metadata from various locations
              // 1. Top-level provider/model/usage fields
              if (parsedResponse.provider || parsedResponse.model || parsedResponse.usage) {
                mergedResponseMetadata = {
                  ...mergedResponseMetadata,
                  provider: parsedResponse.provider,
                  model: parsedResponse.model,
                  usage: parsedResponse.usage
                };
              }

              // 2. result.metadata (agent2agent format)
              if (parsedResponse.result?.metadata) {
                mergedResponseMetadata = { ...mergedResponseMetadata, ...parsedResponse.result.metadata };
              }

              // 3. Top-level metadata object
              if (parsedResponse.metadata) {
                mergedResponseMetadata = { ...mergedResponseMetadata, ...parsedResponse.metadata };
              }

              // 4. payload.metadata
              if (parsedResponse.payload?.metadata) {
                mergedResponseMetadata = { ...mergedResponseMetadata, ...parsedResponse.payload.metadata };
              }
            }
          } catch {
            // Keep raw response
            responseContent = task.response;
          }

          // Completed task - create assistant message with parsed response and merged metadata
          const assistantMessageId = `assistant-${task.id}`;

          // For API agents that don't use LLMs, provide defaults
          const taskMode = (typeof task.params?.mode === 'string' ? task.params.mode : null) || (task.method?.includes('plan') ? 'plan' : task.method?.includes('build') ? 'build' : 'converse');

          // Check if we have LLM metadata from task storage
          const storedLlmSelection = task.llmMetadata?.originalLLMSelection;
          if (storedLlmSelection && !mergedResponseMetadata.provider && !mergedResponseMetadata.model) {
            // Use stored LLM selection if response didn't include it
            // LlmSelection uses 'provider' and 'model' fields
            mergedResponseMetadata.provider = storedLlmSelection.provider;
            mergedResponseMetadata.model = storedLlmSelection.model;
          }

          const hasLlmMetadata = mergedResponseMetadata.provider || mergedResponseMetadata.model || (task.llmMetadata && Object.keys(task.llmMetadata).length > 0);

          const assistantMessage: AgentChatMessage = {
            id: assistantMessageId,
            role: 'assistant',
            content: responseContent,
            timestamp: new Date(task.completedAt || task.updatedAt),
            taskId: task.id,
            metadata: {
              isCompleted: true,
              completedAt: task.completedAt,
              taskId: task.id,
              // Include mode information
              mode: taskMode,
              // Include LLM metadata stored with the task (contains original selection)
              ...(task.llmMetadata ? { llmMetadata: task.llmMetadata } : {}),
              // Include provider/model/usage from response metadata for accurate display
              ...mergedResponseMetadata,
              // For API agents without LLM metadata, provide defaults
              ...(!hasLlmMetadata && taskMode === 'build' ? {
                provider: 'n8n',
                model: 'workflow'
              } : {}),
              extra: {
                responseMetadata: task.responseMetadata,
                originalTaskData: {
                  method: task.method,
                  status: task.status,
                  progress: task.progress,
                },
              },
            },
          };

          // Check if this message has an associated deliverable
          // Try multiple sources: maps, response data
          let deliverableId = messageDeliverableMap.get(assistantMessageId);
          if (!deliverableId) {
            deliverableId = taskDeliverableMap.get(task.id);
          }
          // Also check if deliverableId is in the parsed response
          if (!deliverableId && task.response) {
            try {
              const parsedResponse = typeof task.response === 'string' ? JSON.parse(task.response) : task.response;
              deliverableId = parsedResponse?.deliverableId ||
                             parsedResponse?.result?.deliverableId ||
                             parsedResponse?.payload?.deliverableId;
            } catch {
              // Ignore parse errors
            }
          }

          if (deliverableId) {
            assistantMessage.deliverableId = deliverableId;
            // Also add to metadata for easier access
            if (!assistantMessage.metadata) {
              assistantMessage.metadata = {};
            }
            assistantMessage.metadata.deliverableId = deliverableId;
            
            // Enrich message metadata with deliverable version LLM info
            try {
              const { getDeliverablesService } = await import('@/services/deliverablesService.impl');
              const deliverable = await getDeliverablesService().getDeliverable(deliverableId);
              if (deliverable?.currentVersion?.metadata) {
                const versionMetadata = deliverable.currentVersion.metadata as Record<string, unknown>;
                
                // Extract LLM info from deliverable version metadata
                // Check metadata.llm (from context-agent-runner) or metadata.llmMetadata (from reruns)
                const llmInfo = versionMetadata.llm || versionMetadata.llmMetadata;
                if (llmInfo && typeof llmInfo === 'object') {
                  const llm = llmInfo as Record<string, unknown>;
                  
                  // Merge provider/model from deliverable version if not already in message metadata
                  if (!assistantMessage.metadata.provider && typeof llm.provider === 'string') {
                    assistantMessage.metadata.provider = llm.provider;
                  }
                  if (!assistantMessage.metadata.model && typeof llm.model === 'string') {
                    assistantMessage.metadata.model = llm.model;
                  }
                  
                  // Also add full llmMetadata for compatibility
                  if (!assistantMessage.metadata.llmMetadata) {
                    assistantMessage.metadata.llmMetadata = llm as import('@/types').JsonObject;
                  }
                }
                
                // Also check top-level provider/model in version metadata (for media agents)
                if (!assistantMessage.metadata.provider && typeof versionMetadata.provider === 'string') {
                  assistantMessage.metadata.provider = versionMetadata.provider;
                }
                if (!assistantMessage.metadata.model && typeof versionMetadata.model === 'string') {
                  assistantMessage.metadata.model = versionMetadata.model;
                }
              }
            } catch (error) {
              // Failed to load deliverable - continue without enriching metadata
              console.warn('Failed to enrich message metadata with deliverable LLM info:', error);
            }
          }

          // Check if this message has an associated plan
          if (planId) {
            assistantMessage.planId = planId;
          }

          messages.push(assistantMessage);

        } else if (['pending', 'running'].includes(task.status)) {
          // Active task - create placeholder message
          const placeholderMessage: AgentChatMessage = {
            id: `placeholder-${task.id}`,
            role: 'assistant',
            content: task.progressMessage || 'Processing your request...',
            timestamp: new Date(task.startedAt || task.createdAt),
            taskId: task.id,
            metadata: {
              isPlaceholder: true,
              processing_type: 'active_task',
              lastUpdated: task.updatedAt,
              taskId: task.id,
              extra: {
                originalTaskData: {
                  method: task.method,
                  status: task.status,
                  progress: task.progress,
                  progressMessage: task.progressMessage
                }
              }
            }
          };
          messages.push(placeholderMessage);

        } else if (task.status === 'failed') {
          // Failed task - create error message
          const errorMessage: AgentChatMessage = {
            id: `error-${task.id}`,
            role: 'assistant',
            content: `❌ Task failed: ${task.errorMessage || 'Unknown error occurred'}`,
            timestamp: new Date(task.completedAt || task.updatedAt),
            taskId: task.id,
            metadata: {
              isCompleted: true,
              errorDetails: task.errorMessage,
              taskId: task.id,
              extra: {
                isError: true,
                errorCode: task.errorCode,
                errorMessage: task.errorMessage,
                errorData: task.errorData,
                originalTaskData: {
                  method: task.method,
                  status: task.status,
                  progress: task.progress
                }
              }
            }
          };
          messages.push(errorMessage);
        }
      }

      // Sort messages by timestamp
      messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Log active tasks for restoration
      const activeTasks = tasks.filter(t => ['pending', 'running'].includes(t.status));
      if (activeTasks.length > 0) {
        // Log active tasks for debugging
      }

      return messages;

    } catch (error) {
      console.error(`Failed to load messages for conversation ${conversationId}:`, error);
      return [];
    }
  }

  /**
   * Get active tasks for a conversation that need WebSocket restoration
   */
  async getActiveTasksForConversation(conversationId: string): Promise<Array<{
    taskId: string;
    status: string;
    progress: number;
    progressMessage?: string;
  }>> {
    try {
      const tasksResponse = await tasksService.listTasks({
        conversationId: conversationId
        // Note: Filter for active tasks in the next step instead of using status parameter
      });

      const activeTasks = (tasksResponse.tasks || [])
        .filter(task => ['pending', 'running'].includes(task.status))
        .map(task => ({
          taskId: task.id,
          status: task.status,
          progress: task.progress,
          progressMessage: task.progressMessage
        }));

      return activeTasks;

    } catch (error) {
      console.error(`Failed to get active tasks for conversation ${conversationId}:`, error);
      return [];
    }
  }
}

// Export singleton instance
export const conversationMessageService = new ConversationMessageService();
