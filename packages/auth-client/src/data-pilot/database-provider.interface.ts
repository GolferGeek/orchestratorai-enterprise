export interface IdentityLinkLookupInput {
  issuer: string;
  subject: string;
}

export interface IdentityLinkUpsertInput extends IdentityLinkLookupInput {
  userId: string;
  email: string | null;
  rawClaims: Record<string, unknown>;
}

export interface CreateAdoShadowTaskInput {
  title: string;
  description: string | null;
  assignedTo: string;
  teamId: string | null;
  channelId: string | null;
  sourceChannelUserId: string | null;
  externalTaskId: string;
}

export interface CreatedAdoShadowTask {
  id: string;
  title: string;
}

export interface DatabaseProvider {
  findIdentityLinkUserId(
    input: IdentityLinkLookupInput,
  ): Promise<string | null>;
  upsertIdentityLink(input: IdentityLinkUpsertInput): Promise<void>;
  createAdoShadowTask(
    input: CreateAdoShadowTaskInput,
  ): Promise<CreatedAdoShadowTask>;
  findAdoExternalTaskIdByInternalId(taskId: string): Promise<string | null>;
  updateAdoShadowTaskStatus(taskId: string, status: string): Promise<void>;
}

export const DATABASE_PROVIDER = Symbol('DATABASE_PROVIDER');
