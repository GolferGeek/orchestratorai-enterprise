import { Module } from '@nestjs/common';
import { AmbientDatabaseModule } from '../ambient-database/database.module';
import { AmbientEventsModule } from '../events/events.module';
import { ListenersModule } from '../listeners/listeners.module';
import { MailboxOAuthController } from './mailbox-oauth.controller';
import { MailboxOAuthService } from './mailbox-oauth.service';
import { MailboxClientFactory, MailboxWatcherService } from './mailbox-watcher.service';
import { MailboxWatchesController } from './mailbox-watches.controller';
import { MailboxWatchesRepository } from './mailbox-watches.repository';

/** Watched mailboxes: a new message pushes the watch's named event (Gmail, read-only). */
@Module({
  imports: [AmbientDatabaseModule, AmbientEventsModule, ListenersModule],
  controllers: [MailboxWatchesController, MailboxOAuthController],
  providers: [MailboxWatchesRepository, MailboxClientFactory, MailboxWatcherService, MailboxOAuthService],
})
export class MailboxesModule {}
