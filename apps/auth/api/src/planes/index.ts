/**
 * Provider Planes — infrastructure abstractions selected by env var at deploy time.
 *
 * Auth API only uses: database, config, and auth planes.
 * LLM, RAG, storage, and work-routing planes have been removed from Auth.
 */
export { DatabaseModule } from './database';
export { ConfigProviderModule } from './config';
// AuthModule stays in auth/ (has app-specific imports: SupabaseModule, RbacModule)
