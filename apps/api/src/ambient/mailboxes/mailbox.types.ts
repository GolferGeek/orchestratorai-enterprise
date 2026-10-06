/** One message as the watcher hands it on: text only, attachments fetched on demand. */
export interface MailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  receivedAt: Date;
  /** The plain-text body (from the HTML part, tags removed, when there is no text part). */
  body: string;
  attachments: MailAttachment[];
}

export interface MailAttachment {
  /** The provider's id for fetching it. */
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

/** A signed-in mailbox. Read-only: nothing here marks, moves or deletes a message. */
export interface MailboxClient {
  /** The address the credential signs in as. */
  address(): Promise<string>;
  /** Ids of messages matching the query received after `after`, any order. */
  search(query: string, after: Date): Promise<string[]>;
  message(id: string): Promise<MailMessage>;
  attachment(messageId: string, attachment: MailAttachment): Promise<Buffer>;
}
