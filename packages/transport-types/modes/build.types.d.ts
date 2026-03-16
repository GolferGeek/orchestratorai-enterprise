export type BuildAction = 'create' | 'read' | 'list' | 'edit' | 'rerun' | 'set_current' | 'delete_version' | 'merge_versions' | 'copy_version' | 'delete';
export interface BuildCreatePayload {
    action: 'create';
    title?: string;
    type?: string;
    content?: string;
    planVersionId?: string;
}
export interface BuildReadPayload {
    action: 'read';
    versionId?: string;
}
export interface BuildListPayload {
    action: 'list';
    includeArchived?: boolean;
}
export interface BuildEditPayload {
    action: 'edit';
    editedContent: string;
    comment?: string;
}
export interface BuildRerunPayload {
    action: 'rerun';
    versionId: string;
    rerunConfig: {
        provider: string;
        model: string;
        temperature?: number;
        maxTokens?: number;
    };
}
export interface BuildSetCurrentPayload {
    action: 'set_current';
    versionId: string;
}
export interface BuildDeleteVersionPayload {
    action: 'delete_version';
    versionId: string;
}
export interface BuildMergeVersionsPayload {
    action: 'merge_versions';
    versionIds: string[];
    mergePrompt: string;
}
export interface BuildCopyVersionPayload {
    action: 'copy_version';
    versionId: string;
}
export interface BuildDeletePayload {
    action: 'delete';
}
export type BuildModePayload = BuildCreatePayload | BuildReadPayload | BuildListPayload | BuildEditPayload | BuildRerunPayload | BuildSetCurrentPayload | BuildDeleteVersionPayload | BuildMergeVersionsPayload | BuildCopyVersionPayload | BuildDeletePayload;
export interface BuildRequestMetadata {
    source: string;
    userId: string;
    deliverableType?: string;
    format?: string;
}
export interface BuildResponseMetadata {
    provider: string;
    model: string;
    usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        cost: number;
    };
    routingDecision?: Record<string, any>;
    usedPlanContext?: boolean;
}
export interface BuildCreateResponseContent {
    deliverable: {
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
    };
    version: {
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
    };
    isNew: boolean;
}
