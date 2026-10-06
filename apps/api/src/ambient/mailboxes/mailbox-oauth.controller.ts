import { Controller, Get, Header, Logger, Query } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import { MailboxConnectError, MailboxOAuthService } from './mailbox-oauth.service';

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function page(title: string, text: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;line-height:1.5;color:#222}h1{font-size:1.4rem}</style></head>
<body><h1>${escape(title)}</h1><p>${escape(text)}</p></body></html>`;
}

/** Where Google sends the browser back after "Connect mailbox". Public: the signed state is the proof. */
@Controller('ambient/mailbox-oauth')
export class MailboxOAuthController {
  private readonly logger = new Logger(MailboxOAuthController.name);

  constructor(private readonly oauth: MailboxOAuthService) {}

  @Public()
  @Get('callback')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  async callback(@Query('code') code?: string, @Query('state') state?: string, @Query('error') error?: string): Promise<string> {
    if (error) return page('Mailbox not connected', `Google said: ${error}. Start again from the mailbox watch.`);
    if (!code || !state) return page('Mailbox not connected', 'Google sent no code back. Start again from the mailbox watch.');
    try {
      const address = await this.oauth.complete(code, state);
      return page('Mailbox connected', `${address} is connected, read-only. You can close this tab; new mail is read on the watch's schedule.`);
    } catch (err) {
      if (err instanceof MailboxConnectError) return page('Mailbox not connected', err.message);
      this.logger.error(`Mailbox connect failed: ${(err as Error).message}`);
      return page('Mailbox not connected', 'Something went wrong on our side; the details are in the server log.');
    }
  }
}
