/**
 * Injectable NestJS service that holds a ProtocolFactory with all providers registered.
 * Each agent app gets its own instance. Config is initialized from defaults
 * and can be overridden per-scenario via mergeConfig().
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ProtocolFactory } from '../factory';
import { ProtocolConfig, ProtocolLayer } from '@agent-communication/shared-types';
import { registerAllProviders } from './factory-registration';
import { join } from 'path';

@Injectable()
export class ProtocolFactoryService implements OnModuleInit {
  private readonly logger = new Logger(ProtocolFactoryService.name);
  private readonly factory = new ProtocolFactory();
  private registrationErrors = new Map<string, string>();

  onModuleInit() {
    const dataDir = join(process.cwd(), 'data');
    this.registrationErrors = registerAllProviders(this.factory, { dataDir });

    this.logger.log(
      `ProtocolFactory initialized: ${JSON.stringify(this.factory.listAllProviders())}`,
    );
    if (this.registrationErrors.size > 0) {
      this.logger.warn(
        `Some providers failed to register: ${JSON.stringify(Object.fromEntries(this.registrationErrors))}`,
      );
    }
  }

  /** Resolve a provider using the active global config */
  resolve<L extends ProtocolLayer>(layer: L) {
    return this.factory.resolve(layer);
  }

  /** Resolve a provider using a per-scenario effective config (does NOT mutate global state) */
  resolveWith<L extends ProtocolLayer>(layer: L, config: ProtocolConfig) {
    return this.factory.resolveWith(layer, config);
  }

  /** Resolve a specific provider by ID (for progressive scenarios) */
  resolveById<L extends ProtocolLayer>(layer: L, providerId: string) {
    return this.factory.resolveById(layer, providerId);
  }

  /** Merge base config with overrides to produce an effective config */
  mergeConfig(overrides: Partial<ProtocolConfig>): ProtocolConfig {
    return this.factory.mergeConfig(overrides);
  }

  /** Get the current base config */
  getConfig(): ProtocolConfig {
    return this.factory.getConfig();
  }

  /** List all registered providers per layer */
  listAllProviders(): Record<ProtocolLayer, string[]> {
    return this.factory.listAllProviders();
  }

  /** Get providers that failed to register */
  getRegistrationErrors(): Record<string, string> {
    return Object.fromEntries(this.registrationErrors);
  }
}
