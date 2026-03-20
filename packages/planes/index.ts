/**
 * Provider Planes — infrastructure abstractions selected by env var at deploy time.
 *
 * Each plane is a @Global() NestJS module providing a Symbol-based injection token.
 * Import from the specific plane directory for full type access,
 * or import the module from here for AppModule registration.
 */
export { DatabaseModule } from './database';
export { ConfigProviderModule } from './config';
export { StorageModule } from './storage';
export { RagStorageModule } from './rag';
// AuthModule stays in auth/ (has app-specific imports: SupabaseModule, RbacModule)
// FlowModule stays in flow/ (has app-specific imports: AuthModule, MessagingModule)
export { LLMPlaneModule } from './llm';
export { ObservabilityPlaneModule } from './observability';
