export interface AmbientEvent {
  sourceType: 'database' | 'filesystem' | 'cron' | 'internal-a2a';
  triggerId?: string;
  triggerName?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}
