export interface CreateWorkTaskInput {
  title: string;
  description?: string;
  assignedTo?: string;
  teamId?: string;
  channelId?: string;
  sourceChannelUserId?: string;
}

export interface CreatedWorkTask {
  id: string;
  title: string;
  provider: 'flow' | 'slack' | 'ado';
  externalId?: string;
}

export interface UpdateWorkTaskStatusInput {
  taskId: string;
  status: string;
}

export interface AddWorkTaskCommentInput {
  taskId: string;
  comment: string;
}

export interface WorkTaskSink {
  createTask(input: CreateWorkTaskInput): Promise<CreatedWorkTask>;
  updateTaskStatus(input: UpdateWorkTaskStatusInput): Promise<void>;
  addTaskComment(input: AddWorkTaskCommentInput): Promise<void>;
}

export const WORK_TASK_SINK = Symbol('WORK_TASK_SINK');
