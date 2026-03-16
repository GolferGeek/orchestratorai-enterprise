/**
 * Maps every provider ID to its protocol layer.
 * Source of truth: PROVIDER_DEFINITIONS in help/provider-definitions.ts
 *
 * Used by providersToConfig() to convert a scenario's providers[] array
 * into a Partial<ProtocolConfig>.
 */
import { ProtocolLayer, ProtocolConfig } from '@agent-communication/shared-types';

export const PROVIDER_LAYER_MAP: Record<string, ProtocolLayer> = {
  // Discovery
  'well-known': 'discovery',
  'a2a-agent-card': 'discovery',
  'agntcy-oasf': 'discovery',

  // Transport
  'a2a-jsonrpc': 'transport',
  'http-rest': 'transport',
  'websocket': 'transport',
  'grpc': 'transport',
  'mcp': 'transport',

  // Identity
  'oauth-jwt': 'identity',
  'local-keys': 'identity',
  'did': 'identity',
  'x509': 'identity',
  'first-contact': 'identity',
  'agntcy-crypto-identity': 'identity',

  // Encryption
  'envelope': 'encryption',
  'tls-mutual': 'encryption',
  'agntcy-slim': 'encryption',
  'none': 'encryption',

  // Trust
  'reputation': 'trust',
  'allowlist': 'trust',
  'first-contact-trust': 'trust',
  'a2a-jws-trust': 'trust',

  // Payment
  'lightning-l402': 'payment',
  'stripe-fiat': 'payment',
  'x402-usdc': 'payment',
  'commerce-checkout': 'payment',
  'mock': 'payment',

  // Wallet
  'local-keypair': 'wallet',
  'coinbase-cdp': 'wallet',

  // Negotiation
  'capability-card': 'negotiation',
  'acp': 'negotiation',
  'auction': 'negotiation',
  'a2a-skill-negotiation': 'negotiation',
  'commerce-cart-negotiation': 'negotiation',

  // Audit
  'hash-chain': 'audit',

  // Resilience
  'circuit-breaker': 'resilience',
  'bulkhead': 'resilience',
  'retry': 'resilience',

  // Observability
  'opentelemetry': 'observability',
  'file-log': 'observability',

  // Orchestration
  'pipeline': 'orchestration',
  'a2a-task-lifecycle': 'orchestration',
  'commerce-checkout-fsm': 'orchestration',
};

/**
 * Convert a scenario's providers[] array into a Partial<ProtocolConfig>.
 * For layers with multiple providers in the array, the FIRST one encountered
 * becomes the default (the "primary" for that layer).
 */
export function providersToConfig(providerIds: string[]): Partial<ProtocolConfig> {
  const config: Partial<ProtocolConfig> = {};

  for (const providerId of providerIds) {
    const layer = PROVIDER_LAYER_MAP[providerId];
    if (!layer) continue;

    // First provider per layer wins as the default
    if (!(layer in config)) {
      (config as Record<string, string>)[layer] = providerId;
    }
  }

  return config;
}

/**
 * Look up which layer a provider belongs to.
 * Returns undefined if the provider ID is not recognized.
 */
export function getLayerForProviderId(providerId: string): ProtocolLayer | undefined {
  return PROVIDER_LAYER_MAP[providerId];
}
