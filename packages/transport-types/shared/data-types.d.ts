export interface PlanData {
    id: string;
    conversationId: string;
    userId: string;
    agentName: string;
    organizationSlug: string;
    title: string;
    currentVersionId: string;
    createdAt: string;
    updatedAt: string;
}
export interface PlanVersionData {
    id: string;
    planId: string;
    versionNumber: number;
    content: string;
    format: 'markdown' | 'json';
    createdByType: 'agent' | 'user';
    createdById: string | null;
    taskId?: string;
    metadata?: Record<string, any>;
    isCurrentVersion: boolean;
    createdAt: string;
}
export interface DeliverableData {
    id: string;
    conversationId: string;
    userId: string;
    agentName: string;
    organizationSlug: string;
    title: string;
    type: string;
    currentVersionId: string;
    createdAt: string;
    updatedAt: string;
}
export interface DeliverableVersionData {
    id: string;
    deliverableId: string;
    versionNumber: number;
    content: string;
    format: 'markdown' | 'json' | 'html';
    createdByType: 'agent' | 'user';
    createdById: string | null;
    metadata?: Record<string, any>;
    isCurrentVersion: boolean;
    createdAt: string;
}
