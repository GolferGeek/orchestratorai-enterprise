const eventTypeToEmoji: Record<string, string> = {
  // LLM Events (critical for cost/performance monitoring)
  'agent.llm.started': '🤖',
  'agent.llm.completed': '✨',
  'agent.llm.failed': '💥',

  // PII Events (critical for compliance)
  'agent.pii.detected': '🔒',
  'agent.pii.sanitized': '🧹',
  'agent.pii.check.started': '🔍',
  'agent.pii.check.completed': '✅',

  // Agent-specific events
  'agent.rag.search': '🔎',
  'agent.rag.documents_found': '📄',
  'agent.api.call_started': '🌐',
  'agent.api.call_completed': '✅',
  'agent.context.loaded': '📚',

  // Streaming events
  'agent.stream.chunk': '📊',
  'agent.stream.complete': '🏁',
  'agent.stream.error': '⚠️',

  // HITL events
  'human_input.required': '🙋',
  'human_input.response': '💭',
  'human_input.timeout': '⏱️',

  // Workflow events (from n8n)
  'workflow.step.progress': '🔀',
  'workflow.status.update': '📋',

  // Legacy events (deprecated but kept for compatibility)
  'task.created': '📝',
  'task.started': '▶️',
  'task.progress': '⚡',
  'task.completed': '✅',
  'task.failed': '❌',
  'task.cancelled': '🚫',
  'task.message': '💬',
  'agent.started': '🚀',
  'agent.progress': '🔄',
  'agent.completed': '🏁',
  'agent.failed': '💥',

  // Tool events (from Claude Code observability)
  'PreToolUse': '🔧',
  'PostToolUse': '✅',
  'Notification': '🔔',
  'Stop': '🛑',
  'SubagentStop': '👥',
  'PreCompact': '📦',
  'UserPromptSubmit': '💬',
  'SessionStart': '🚀',
  'SessionEnd': '🏁',

  // Default
  'default': '❓'
};

export function useEventEmojis() {
  const getEmojiForEventType = (eventType: string): string => {
    return eventTypeToEmoji[eventType] || eventTypeToEmoji.default;
  };
  
  const formatEventTypeLabel = (eventTypes: Record<string, number>): string => {
    const entries = Object.entries(eventTypes)
      .sort((a, b) => b[1] - a[1]); // Sort by count descending
    
    if (entries.length === 0) return '';
    
    // Show up to 3 most frequent event types
    const topEntries = entries.slice(0, 3);
    
    return topEntries
      .map(([type, count]) => {
        const emoji = getEmojiForEventType(type);
        return count > 1 ? `${emoji}×${count}` : emoji;
      })
      .join('');
  };
  
  return {
    getEmojiForEventType,
    formatEventTypeLabel
  };
}


















