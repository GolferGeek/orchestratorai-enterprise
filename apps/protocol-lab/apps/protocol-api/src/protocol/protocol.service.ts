import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ProtocolConfig,
  ProtocolPreset,
  ProtocolLayer,
  PROTOCOL_PRESETS,
} from '@agent-communication/shared-types';
import {
  ProtocolFactory,
  registerAllProviders,
} from '@agent-communication/shared-protocols';
import { WsService } from '../ws/ws.service';

@Injectable()
export class ProtocolService implements OnModuleInit {
  private readonly logger = new Logger(ProtocolService.name);
  private factory = new ProtocolFactory();

  /** Tracks which providers failed to instantiate (e.g. missing API keys) */
  private registrationErrors: Map<string, string> = new Map();

  constructor(private readonly wsService: WsService) {}

  onModuleInit() {
    this.registrationErrors = registerAllProviders(this.factory);
    this.logger.log(
      `ProtocolFactory initialized: ${JSON.stringify(this.factory.listAllProviders())}`,
    );
    if (this.registrationErrors.size > 0) {
      this.logger.warn(
        `Some providers failed to register (missing keys): ${JSON.stringify(Object.fromEntries(this.registrationErrors))}`,
      );
    }
  }

  getConfig(): ProtocolConfig {
    return this.factory.getConfig();
  }

  updateConfig(update: Partial<ProtocolConfig>): ProtocolConfig {
    this.factory.setConfig(update);
    this.logger.log(`Protocol config updated: ${JSON.stringify(update)}`);

    const config = this.factory.getConfig();
    this.wsService.broadcastProtocolChange({
      config,
      updatedFields: Object.keys(update),
    });

    return config;
  }

  getPresets(): ProtocolPreset[] {
    return PROTOCOL_PRESETS;
  }

  /** Returns all registered provider IDs per layer */
  getProviders(): Record<string, string[]> {
    return this.factory.listAllProviders();
  }

  /** Returns providers that failed to register */
  getRegistrationErrors(): Record<string, string> {
    return Object.fromEntries(this.registrationErrors);
  }

  /**
   * Tests the currently-active provider for a given layer.
   * Each provider type has different test logic:
   * - identity: generateIdentity + sign + verify
   * - payment: createPaymentGate
   * - wallet: createWallet
   * - encryption: encrypt + decrypt
   * - trust: evaluate
   * - etc.
   */
  async testLayer(layer: ProtocolLayer): Promise<{
    layer: string;
    provider: string;
    success: boolean;
    result: any;
    durationMs: number;
  }> {
    const start = Date.now();
    const config = this.factory.getConfig();
    const providerId = config[layer];

    try {
      const provider = this.factory.resolve(layer);
      let result: any;

      switch (layer) {
        case 'discovery': {
          const p = provider as any;
          await p.publishCard({
            agentId: 'test-agent-' + Date.now(),
            name: 'Test Agent',
            capabilities: ['echo', 'summarize'],
            endpoint: 'http://localhost:6402',
          });
          const agents = await p.listKnownAgents();
          result = { published: true, knownAgents: agents.length };
          break;
        }
        case 'transport': {
          const p = provider as any;
          // Test ping to a known endpoint (protocol-api itself)
          const ping = await p.ping('http://localhost:6402/health');
          result = { ping };
          break;
        }
        case 'negotiation': {
          const p = provider as any;
          // ACP provider needs local capabilities set for overlap detection
          if (typeof p.setLocalCapabilities === 'function') {
            p.setLocalCapabilities(['text-analysis', 'summarization', 'translation']);
          }
          if (typeof p.setLocalProtocols === 'function') {
            p.setLocalProtocols(['http-rest', 'a2a-jsonrpc']);
          }
          const negotiation = await p.proposeCapabilities({
            agentId: 'agent-a',
            capabilities: ['text-analysis', 'summarization'],
            protocols: ['http-rest'],
            pricing: {
              'text-analysis': { model: 'paid', amount: 0.01, currency: 'USD' },
              'summarization': { model: 'free' },
            },
          });
          result = { negotiation };
          break;
        }
        case 'identity': {
          const p = provider as any;
          const identity = await p.generateIdentity();
          const message = 'test-message-' + Date.now();
          const signature = await p.sign(message);
          const verified = await p.verify(message, signature, identity.publicKey);
          result = { identity, message, signaturePreview: signature.substring(0, 32) + '...', verified };
          break;
        }
        case 'payment': {
          const p = provider as any;
          const gate = await p.createPaymentGate(0.01, ['test-capability']);
          result = { gate };
          break;
        }
        case 'wallet': {
          const p = provider as any;
          const wallet = await p.createWallet();
          result = { wallet };
          break;
        }
        case 'trust': {
          const p = provider as any;
          const score = await p.evaluateTrust('test-agent-id');
          await p.recordInteraction('test-agent-id', 'success');
          const updated = await p.getTrustScore('test-agent-id');
          result = { initialScore: score, afterInteraction: updated };
          break;
        }
        case 'encryption': {
          const p = provider as any;
          const plaintext = 'Hello, encrypted world! ' + Date.now();
          const keys = await p.rotateKeys();
          const encrypted = await p.encrypt(plaintext, keys.publicKey);
          const decrypted = await p.decrypt(encrypted, keys.privateKey);
          result = {
            plaintext,
            encryptedPreview: typeof encrypted === 'string'
              ? encrypted.substring(0, 60) + '...'
              : JSON.stringify(encrypted).substring(0, 60) + '...',
            decrypted,
            roundTripSuccess: decrypted === plaintext,
            algorithm: providerId,
          };
          break;
        }
        case 'resilience': {
          const p = provider as any;
          let callCount = 0;
          const testResult = await p.withRetry(async () => {
            callCount++;
            return { executed: true, attempt: callCount };
          });
          result = { testResult, callCount };
          break;
        }
        case 'observability': {
          const p = provider as any;
          await p.emitEvent({
            type: 'test',
            layer: 'observability',
            message: 'Protocol test event',
            timestamp: new Date().toISOString(),
          });
          const metrics = await p.getProtocolMetrics();
          result = { eventEmitted: true, metrics };
          break;
        }
        case 'orchestration': {
          const p = provider as any;
          const workflow = await p.createWorkflow([
            { agentId: 'agent-a', action: 'analyze', params: { text: 'test data' } },
            { agentId: 'agent-b', action: 'summarize', params: { text: 'test data' } },
          ]);
          result = { workflow };
          break;
        }
        case 'audit': {
          const p = provider as any;
          // Append test entries and verify chain integrity
          const entry1 = p.append({
            timestamp: new Date().toISOString(),
            eventType: 'message_sent',
            agentId: 'test-agent',
            messageId: 'msg-' + Date.now(),
            layer: 'audit',
            provider: providerId,
            data: { test: true, action: 'protocol-test' },
          });
          const entry2 = p.append({
            timestamp: new Date().toISOString(),
            eventType: 'identity_verified',
            agentId: 'test-agent',
            layer: 'audit',
            provider: providerId,
            data: { verified: true },
          });
          const chainStatus = p.verifyChain();
          result = {
            entriesAppended: 2,
            chainLength: chainStatus.length,
            chainVerified: chainStatus.verified,
            headHash: chainStatus.headHash,
            entry1Hash: entry1.entryHash.substring(0, 16) + '...',
            entry2PreviousHash: entry2.previousHash.substring(0, 16) + '...',
            hashChainIntact: entry1.entryHash === entry2.previousHash,
          };
          break;
        }
        default:
          result = { message: `No test implemented for layer: ${layer}` };
      }

      return {
        layer,
        provider: providerId,
        success: true,
        result,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        layer,
        provider: providerId,
        success: false,
        result: { error: err instanceof Error ? err.message : String(err) },
        durationMs: Date.now() - start,
      };
    }
  }
}
