import { Module } from '@nestjs/common';
import { AmbientDatabaseModule } from '../ambient-database/database.module';
import { AmbientEventsModule } from '../events/events.module';
import { ListenersModule } from '../listeners/listeners.module';
import { MailboxClientFactory, MailboxWatcherService } from './mailbox-watcher.service';
import { MailboxWatchesController } from './mailbox-watches.controller';
import { MailboxWatchesRepository } from './mailbox-watches.repository';

/** Watched mailboxes: a new message pushes the watch's named event (Gmail, read-only). */
@Module({
  imports: [AmbientDatabaseModule, AmbientEventsModule, ListenersModule],
  controllers: [MailboxWatchesController],
  providers: [MailboxWatchesRepository, MailboxClientFactory, MailboxWatcherService],
})
export class MailboxesModule {}
