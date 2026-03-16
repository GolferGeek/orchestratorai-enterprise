export interface OpenClawHistoryMessage {
  direction: string;
  message_text: string;
}

export interface OpenClawCreatedTask {
  id: string;
  title: string;
}

export interface OpenClawBridgePersistence {
  getRecentHistory(
    channelUserId: string,
    maxMessages: number,
  ): Promise<OpenClawHistoryMessage[]>;
  createFlowTask(input: {
    title: string;
    description: string;
    channelUserId: string;
    teamId: string | null;
    channelId: string | null;
  }): Promise<OpenClawCreatedTask>;
  postChannelMessage(input: {
    channelId: string;
    content: string;
    guestName: string;
  }): Promise<void>;
}

export const OPENCLAW_BRIDGE_PERSISTENCE = Symbol('OPENCLAW_BRIDGE_PERSISTENCE');
