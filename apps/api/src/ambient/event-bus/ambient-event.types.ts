/**
 * Something ambient reacts to. Watch sources (database, filesystem, cron)
 * observe and emit; a pushed event ('event') is handed to ambient by a caller,
 * stored in ambient.events first, and carries its id and name.
 */
export interface AmbientEvent {
  orgSlug: string;
  sourceType: 'database' | 'filesystem' | 'cron' | 'event';
  triggerId?: string;
  triggerName?: string;
  /** Set for pushed events: the stored row, matched by triggers on its name. */
  pushed?: PushedEventRef;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface PushedEventRef {
  id: string;
  name: string;
  source: string;
  /** Set when a Gatehouse caller's call to an A2A agent pushed it. */
  origin?: EventOrigin;
}

/**
 * Where a pushed event came from outside: the A2A agent it came in on (via),
 * the registered caller, the caller's contextId and our A2A task. A trigger
 * can reply to it through the via agent.
 */
export interface EventOrigin {
  via: string;
  callerId: string;
  contextId: string;
  taskId: string;
}
