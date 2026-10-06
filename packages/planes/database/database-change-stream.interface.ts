/** Changes in the platform database. */
export const DATABASE_CHANGE_STREAM_SERVICE = Symbol(
  'DATABASE_CHANGE_STREAM_SERVICE',
);

/**
 * Changes in the company database (BUSINESS_DATABASE_SERVICE), from the
 * stream BUSINESS_CHANGE_STREAM_PROVIDER names.
 */
export const BUSINESS_DATABASE_CHANGE_STREAM_SERVICE = Symbol(
  'BUSINESS_DATABASE_CHANGE_STREAM_SERVICE',
);

/** Which database a watch is on: the platform's or the company's. */
export type DatabaseConnectionName = 'platform' | 'business';
export const DATABASE_CONNECTION_NAMES: readonly DatabaseConnectionName[] = ['platform', 'business'];

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
