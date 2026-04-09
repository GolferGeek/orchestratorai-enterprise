/**
 * Re-export shim — InternalIdentityLinkService now lives in @orchestratorai/auth-client.
 *
 * Auth's AuthenticatedPrincipal is structurally identical to IdentityLinkPrincipal
 * (both have issuer, subject, email?, rawClaims), so TypeScript structural typing
 * means no call-site changes are required.
 */
export {
  InternalIdentityLinkService,
  IdentityLinkDatabaseProvider,
  IdentityLinkPrincipal,
  IDENTITY_LINK_DATABASE_PROVIDER,
} from '@orchestratorai/auth-client';
