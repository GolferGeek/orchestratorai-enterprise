import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { OutboundUrlValidatorService } from '../secure-conversations/security/outbound-url-validator.service';
import { readBoundedJsonResponse } from '../secure-conversations/security/bounded-json-response';
import { buildOutboundHeaders } from '../agents/invoke/runners/outbound-auth-headers';
import type { OutboundAuth } from '../agents/invoke/agent-definition.types';
import { A2A_VERSION, A2AAgentCard, A2APart, A2AReply, parseAgentCard, parseSendMessageResponse } from './a2a-v1';

const MAXIMUM_CARD_BYTES = 262_144;
const MAXIMUM_RESPONSE_BYTES = 1_048_576;
const CARD_TTL_MS = 5 * 60_000;
const CALL_TIMEOUT_MS = 60_000;

export interface A2ARemote {
  cardUrl: string;
  auth?: OutboundAuth;
}

/**
 * The Gatehouse's outbound side: every call from the platform to another A2A
 * agent goes through here. A2A v1.0 only. Every URL (the card and the
 * interface it names) is checked against private networks right before it is
 * used; no redirects; responses are size-capped.
 */
@Injectable()
export class A2AClientService {
  private readonly logger = new Logger(A2AClientService.name);
  private readonly cards = new Map<string, { card: A2AAgentCard; fetchedAt: number }>();

  constructor(
    private readonly outboundUrls: OutboundUrlValidatorService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
  ) {}

  async card(cardUrl: string): Promise<A2AAgentCard> {
    const cached = this.cards.get(cardUrl);
    if (cached && Date.now() - cached.fetchedAt < CARD_TTL_MS) return cached.card;

    const url = await this.outboundUrls.assertSafe(cardUrl);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' } });
    if (response.status !== 200) throw new Error(`The agent card at ${cardUrl} returned HTTP ${response.status}`);
    const card = parseAgentCard(await readBoundedJsonResponse(response, MAXIMUM_CARD_BYTES, `The agent card at ${cardUrl}`), cardUrl);
    this.cards.set(cardUrl, { card, fetchedAt: Date.now() });
    return card;
  }

  /** SendMessage to the remote agent; resolves with its answer as sent. */
  async sendMessage(owner: string, remote: A2ARemote, parts: A2APart[]): Promise<{ card: A2AAgentCard; reply: A2AReply }> {
    const card = await this.card(remote.cardUrl);
    const url = await this.outboundUrls.assertSafe(card.url);
    const requestId = randomUUID();
    const body = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'SendMessage',
      params: { message: { role: 'ROLE_USER', messageId: randomUUID(), parts } },
    };
    const started = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      headers: { ...buildOutboundHeaders(owner, remote.auth, this.config), 'A2A-Version': A2A_VERSION },
      body: JSON.stringify(body),
    });
    if (response.status !== 200) throw new Error(`${card.name} returned HTTP ${response.status}`);
    const reply = parseSendMessageResponse(
      await readBoundedJsonResponse(response, MAXIMUM_RESPONSE_BYTES, `${card.name}'s response`),
      requestId,
      card.name,
    );
    this.logger.log(`${owner} → ${card.name}: ${reply.state} in ${Date.now() - started}ms`);
    return { card, reply };
  }
}
