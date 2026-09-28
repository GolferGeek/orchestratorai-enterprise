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
}
