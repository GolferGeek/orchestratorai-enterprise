/**
 * Provider Planes — infrastructure abstractions selected by env var at deploy time.
 *
 * Flow API uses only: database, config, supabase-core, auth, work-routing.
 * LLM, RAG, and Storage planes are not used by Flow.
 */
export { DatabaseModule } from './database';
export { ConfigProviderModule } from './config';
// AuthModule stays in auth/ (has app-specific imports: SupabaseModule, RbacModule)
// FlowModule stays in flow/ (has app-specific imports: AuthModule)
