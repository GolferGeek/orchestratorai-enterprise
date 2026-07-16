import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  OPENCLAW_BRIDGE_PERSISTENCE,
  OpenClawBridgePersistence,
} from './openclaw-bridge-persistence.interface';

const MAX_HISTORY_MESSAGES = 20;

interface GatewayChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

@Injectable()
export class OpenClawBridgeService {
  private readonly logger = new Logger(OpenClawBridgeService.name);
  private readonly gatewayUrl: string;
  private readonly authToken: string;
  private readonly model: string;
  private readonly defaultTeamId: string;
  private readonly defaultChannelId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @Inject(OPENCLAW_BRIDGE_PERSISTENCE)
    private readonly persistence: OpenClawBridgePersistence,
  ) {
    const host = this.configService.get<string>(
      'OPENCLAW_GATEWAY_HOST',
      'host.docker.internal',
    );
    const port = this.configService.get<string>(
      'OPENCLAW_GATEWAY_PORT',
      '7300',
    );
    this.gatewayUrl = `http://${host}:${port}/v1/chat/completions`;
    this.authToken = this.configService.get<string>('OPENCLAW_AUTH_TOKEN', '');
    this.model = this.configService.get<string>(
      'OPENCLAW_MODEL',
      'anthropic/claude-haiku-4-5-20251001',
    );
    this.defaultTeamId = this.configService.get<string>(
      'FLOW_DEFAULT_TEAM_ID',
      '',
    );
    this.defaultChannelId = this.configService.get<string>(
      'FLOW_DEFAULT_CHANNEL_ID',
      '',
    );
  }

  async processMessage(
    text: string,
    channelUser: { id: string; display_name: string | null },
  ): Promise<string> {
    const history = await this.getRecentHistory(channelUser.id);

    const systemPrompt = this.buildSystemPrompt(channelUser);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.direction === 'inbound' ? 'user' : ('assistant' as const),
        content: m.message_text,
      })),
      { role: 'user' as const, content: text },
    ];

    this.logger.log(
      `Forwarding message to OpenClaw gateway for ${channelUser.display_name || channelUser.id} (${messages.length} messages)`,
    );

    const response = await firstValueFrom(
      this.httpService.post<GatewayChatCompletionResponse>(
        this.gatewayUrl,
        {
          model: this.model,
          messages,
          max_tokens: 2000,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.authToken}`,
          },
          timeout: 120000,
        },
      ),
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error(
        `OpenClaw gateway returned empty response: ${JSON.stringify(response.data)}`,
      );
    }

    // Check for [TASK] blocks and create Flow tasks
    await this.extractAndCreateTasks(content, channelUser.id);

    return content;
  }

  /**
   * Create a Flow task programmatically (called when OpenClaw decides to create a task)
   */
  async createFlowTask(
    title: string,
    description: string,
    channelUserId: string,
  ): Promise<{ id: string; title: string }> {
    const data = await this.persistence.createFlowTask({
      title,
      description,
      channelUserId,
      teamId: this.defaultTeamId || null,
      channelId: this.defaultChannelId || null,
    });

    // Post to the linked channel if configured
    if (this.defaultChannelId) {
      await this.persistence.postChannelMessage({
        channelId: this.defaultChannelId,
        content: `New task created from mobile: **${title}**\n\n${description}`,
        guestName: 'OpenClaw',
      });
    }

    this.logger.log(`Created Flow task ${data.id}: ${title}`);
    return data;
  }

  private buildSystemPrompt(channelUser: {
    id: string;
    display_name: string | null;
  }): string {
    const userName = channelUser.display_name || 'the user';
    const taskContext =
      this.defaultTeamId && this.defaultChannelId
        ? `\n\nYou can create development tasks. When ${userName} describes a feature, bug fix, or development task clearly enough to act on, ask if they'd like you to create a task for Claude Code to work on. If they confirm, create the task by including a structured block in your response:

[TASK]
Title: <concise task title>
Description: <full specification from the conversation>
[/TASK]

The system will detect this block and assign it to Claude Code for implementation. After the block, confirm to the user that the task has been created.`
        : '';

    return `You are an AI assistant for Orchestrator AI, helping ${userName} via mobile messaging. You have access to the platform's data and tools including predictions, risk analysis, and market data.${taskContext}

Be concise — this is a mobile chat. Use short paragraphs and bullet points.`;
  }

  /**
   * Parse [TASK]...[/TASK] blocks from AI response and create Flow tasks.
   */
  private async extractAndCreateTasks(
    content: string,
    channelUserId: string,
  ): Promise<void> {
    const taskPattern =
      /\[TASK\]\s*\nTitle:\s*(.+)\nDescription:\s*([\s\S]*?)\n\[\/TASK\]/g;
    let match: RegExpExecArray | null;

    while ((match = taskPattern.exec(content)) !== null) {
      const title = (match[1] ?? '').trim();
      const description = (match[2] ?? '').trim();
      if (!title) continue;
      this.logger.log(`Detected task block in AI response: "${title}"`);
      await this.createFlowTask(title, description, channelUserId);
    }
  }

  private async getRecentHistory(
    channelUserId: string,
  ): Promise<Array<{ direction: string; message_text: string }>> {
    const data = await this.persistence.getRecentHistory(
      channelUserId,
      MAX_HISTORY_MESSAGES,
    );
    return data.reverse();
  }
}
