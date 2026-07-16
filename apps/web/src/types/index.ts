// Command shell type definitions
// Only exports types needed for the navigation shell

export * from './api';
export * from './auth';

export type Primitive = string | number | boolean | null;
export type JsonValue = Primitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}
