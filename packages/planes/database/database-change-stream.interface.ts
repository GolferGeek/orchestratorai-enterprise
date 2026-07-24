export const DATABASE_CHANGE_STREAM_SERVICE = Symbol(
  'DATABASE_CHANGE_STREAM_SERVICE',
);

export type DatabaseChangeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface DatabaseChangeSubscription {
  schema: string;
  table: string;
  events: DatabaseChangeEventType[];
}

export interface DatabaseChangeEvent {
  schema: string;
  table: string;
  eventType: DatabaseChangeEventType;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

export type DatabaseChangeHandler = (event: DatabaseChangeEvent) => void;

export interface DatabaseChangeStreamService {
  subscribe(
    subscription: DatabaseChangeSubscription,
    handler: DatabaseChangeHandler,
  ): Promise<() => Promise<void>>;
  close(): Promise<void>;
}
