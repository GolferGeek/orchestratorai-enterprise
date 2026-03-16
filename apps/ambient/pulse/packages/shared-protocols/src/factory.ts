import { ProtocolLayer, ProtocolConfig } from '@agent-communication/shared-types';
import { IDiscoveryProvider } from './discovery/discovery.interface';
import { ITransportProvider } from './transport/transport.interface';
import { INegotiationProvider } from './negotiation/negotiation.interface';
import { IIdentityProvider } from './identity/identity.interface';
import { IPaymentProvider } from './payment/payment.interface';
import { IWalletProvider } from './wallet/wallet.interface';
import { ITrustProvider } from './trust/trust.interface';
import { IResilienceProvider } from './resilience/resilience.interface';
import { IEncryptionProvider } from './encryption/encryption.interface';
import { IObservabilityProvider } from './observability/observability.interface';
import { IOrchestrationProvider } from './orchestration/orchestration.interface';
import { IAuditProvider } from './audit/audit.interface';

export type ProtocolProvider =
  | IDiscoveryProvider
  | ITransportProvider
  | INegotiationProvider
  | IIdentityProvider
  | IPaymentProvider
  | IWalletProvider
  | ITrustProvider
  | IResilienceProvider
  | IEncryptionProvider
  | IObservabilityProvider
  | IOrchestrationProvider
  | IAuditProvider;

type ProviderMap = {
  discovery: Map<string, IDiscoveryProvider>;
  transport: Map<string, ITransportProvider>;
  negotiation: Map<string, INegotiationProvider>;
  identity: Map<string, IIdentityProvider>;
  payment: Map<string, IPaymentProvider>;
  wallet: Map<string, IWalletProvider>;
  trust: Map<string, ITrustProvider>;
  resilience: Map<string, IResilienceProvider>;
  encryption: Map<string, IEncryptionProvider>;
  observability: Map<string, IObservabilityProvider>;
  orchestration: Map<string, IOrchestrationProvider>;
  audit: Map<string, IAuditProvider>;
};

type LayerProviderType = {
  discovery: IDiscoveryProvider;
  transport: ITransportProvider;
  negotiation: INegotiationProvider;
  identity: IIdentityProvider;
  payment: IPaymentProvider;
  wallet: IWalletProvider;
  trust: ITrustProvider;
  resilience: IResilienceProvider;
  encryption: IEncryptionProvider;
  observability: IObservabilityProvider;
  orchestration: IOrchestrationProvider;
  audit: IAuditProvider;
};

export class ProtocolFactory {
  private providers: ProviderMap = {
    discovery: new Map(),
    transport: new Map(),
    negotiation: new Map(),
    identity: new Map(),
    payment: new Map(),
    wallet: new Map(),
    trust: new Map(),
    resilience: new Map(),
    encryption: new Map(),
    observability: new Map(),
    orchestration: new Map(),
    audit: new Map(),
  };

  private activeConfig: ProtocolConfig = {
    discovery: 'well-known',
    transport: 'http-rest',
    negotiation: 'capability-card',
    identity: 'local-keys',
    payment: 'mock',
    wallet: 'local-keypair',
    trust: 'allowlist',
    encryption: 'none',
    resilience: 'retry',
    observability: 'file-log',
    orchestration: 'pipeline',
    audit: 'hash-chain',
  };

  register<L extends ProtocolLayer>(layer: L, provider: LayerProviderType[L]): void {
    const map = this.providers[layer] as Map<string, LayerProviderType[L]>;
    map.set(provider.providerId, provider);
  }

  resolve<L extends ProtocolLayer>(layer: L): LayerProviderType[L] {
    const providerId = this.activeConfig[layer];
    const map = this.providers[layer] as Map<string, LayerProviderType[L]>;
    const provider = map.get(providerId);
    if (!provider) {
      throw new Error(
        `No provider registered for layer "${layer}" with id "${providerId}". ` +
        `Available: [${Array.from(map.keys()).join(', ')}]`
      );
    }
    return provider;
  }

  /**
   * Resolve a provider for the given layer using a one-shot config.
   * Does NOT mutate activeConfig.
   */
  resolveWith<L extends ProtocolLayer>(layer: L, config: ProtocolConfig): LayerProviderType[L] {
    const providerId = config[layer];
    const map = this.providers[layer] as Map<string, LayerProviderType[L]>;
    const provider = map.get(providerId);
    if (!provider) {
      throw new Error(
        `No provider registered for layer "${layer}" with id "${providerId}". ` +
        `Available: [${Array.from(map.keys()).join(', ')}]`
      );
    }
    return provider;
  }

  /**
   * Resolve a specific provider by ID from a specific layer.
   * Used by progressive scenarios that explicitly walk through providers.
   */
  resolveById<L extends ProtocolLayer>(layer: L, providerId: string): LayerProviderType[L] {
    const map = this.providers[layer] as Map<string, LayerProviderType[L]>;
    const provider = map.get(providerId);
    if (!provider) {
      throw new Error(
        `No provider registered for layer "${layer}" with id "${providerId}". ` +
        `Available: [${Array.from(map.keys()).join(', ')}]`
      );
    }
    return provider;
  }

  /**
   * Merge base config with overrides to produce an effective config.
   * Does NOT mutate activeConfig.
   */
  mergeConfig(overrides: Partial<ProtocolConfig>): ProtocolConfig {
    return { ...this.activeConfig, ...overrides };
  }

  setConfig(config: Partial<ProtocolConfig>): void {
    Object.assign(this.activeConfig, config);
  }

  getConfig(): ProtocolConfig {
    return { ...this.activeConfig };
  }

  listProviders(layer: ProtocolLayer): string[] {
    return Array.from(this.providers[layer].keys());
  }

  listAllProviders(): Record<ProtocolLayer, string[]> {
    const result = {} as Record<ProtocolLayer, string[]>;
    for (const layer of Object.keys(this.providers) as ProtocolLayer[]) {
      result[layer] = this.listProviders(layer);
    }
    return result;
  }
}
