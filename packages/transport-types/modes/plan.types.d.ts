export type PlanAction = 'create' | 'read' | 'list' | 'edit' | 'set_current' | 'delete_version' | 'merge_versions' | 'copy_version' | 'delete';
export interface PlanCreatePayload {
    action: 'create';
    title?: string;
    content?: string;
    forceNew?: boolean;
}
export interface PlanReadPayload {
    action: 'read';
    versionId?: string;
}
export interface PlanListPayload {
    action: 'list';
    includeArchived?: boolean;
}
export interface PlanEditPayload {
    action: 'edit';
    editedContent: string;
    comment?: string;
}
export interface PlanSetCurrentPayload {
    action: 'set_current';
    versionId: string;
}
export interface PlanDeleteVersionPayload {
    action: 'delete_version';
    versionId: string;
}
export interface PlanMergeVersionsPayload {
    action: 'merge_versions';
    versionIds: string[];
    mergePrompt: string;
}
export interface PlanCopyVersionPayload {
    action: 'copy_version';
    versionId: string;
}
export interface PlanDeletePayload {
    action: 'delete';
}
export type PlanModePayload = PlanCreatePayload | PlanReadPayload | PlanListPayload | PlanEditPayload | PlanSetCurrentPayload | PlanDeleteVersionPayload | PlanMergeVersionsPayload | PlanCopyVersionPayload | PlanDeletePayload;
export interface PlanRequestMetadata {
    source: string;
    userId: string;
}
export interface PlanResponseMetadata {
    provider: string;
    model: string;
    usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        cost: number;
    };
    routingDecision?: Record<string, any>;
}
export interface PlanCreateResponseContent {
    plan: {
        id: string;
        conversationId: string;
        userId: string;
        agentName: string;
        organizationSlug: string;
        title: string;
        currentVersionId: string;
        createdAt: string;
        updatedAt: string;
    };
    version: {
        id: string;
        planId: string;
        versionNumber: number;
        content: string;
        format: 'markdown' | 'json';
        createdByType: 'agent' | 'user';
        createdById: string | null;
        metadata?: Record<string, any>;
        isCurrentVersion: boolean;
        createdAt: string;
    };
    isNew: boolean;
}
export interface PlanReadResponseContent {
    plan: {
        id: string;
        conversationId: string;
        userId: string;
        agentName: string;
        organizationSlug: string;
        title: string;
        currentVersionId: string;
        createdAt: string;
        updatedAt: string;
        currentVersion?: {
            id: string;
            planId: string;
            versionNumber: number;
            content: string;
            format: 'markdown' | 'json';
            createdByType: 'agent' | 'user';
            createdById: string | null;
            metadata?: Record<string, any>;
            isCurrentVersion: boolean;
            createdAt: string;
        };
    };
}
export interface PlanListResponseContent {
    plan: {
        id: string;
        conversationId: string;
        userId: string;
        agentName: string;
        organizationSlug: string;
        title: string;
        currentVersionId: string;
        createdAt: string;
        updatedAt: string;
    };
    versions: Array<{
        id: string;
        planId: string;
        versionNumber: number;
        content: string;
        format: 'markdown' | 'json';
        createdByType: 'agent' | 'user';
        createdById: string | null;
        metadata?: Record<string, any>;
        isCurrentVersion: boolean;
        createdAt: string;
    }>;
}
