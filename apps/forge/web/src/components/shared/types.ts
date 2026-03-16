import type { DeliverableVersion } from '@/services/deliverablesService';

// ============================================================================
// ContentViewer Props
// ============================================================================

export interface ContentViewerProps {
  /** Blog post content (markdown) */
  blogPost?: string;
  /** SEO description */
  seoDescription?: string;
  /** Social media posts (can be strings or objects with content/platform/hashtags) */
  socialPosts?: unknown[];
  /** Which tab to show initially */
  initialTab?: 'blog' | 'seo' | 'social';
  /** Whether content is loading */
  loading?: boolean;
}

// ============================================================================
// ContentEditor Props
// ============================================================================

export interface ContentEditorProps {
  /** Blog post content (markdown) */
  blogPost?: string;
  /** SEO description */
  seoDescription?: string;
  /** Social media posts (joined by newlines) */
  socialPosts?: string;
  /** Which tab to show initially */
  initialTab?: 'blog' | 'seo' | 'social';
  /** Whether editing is disabled */
  disabled?: boolean;
}

export interface ContentEditorEmits {
  /** Emitted when content changes */
  (e: 'update:blogPost', value: string): void;
  (e: 'update:seoDescription', value: string): void;
  (e: 'update:socialPosts', value: string): void;
  /** Emitted when any content changes (for dirty checking) */
  (e: 'change'): void;
}

// ============================================================================
// VersionSelector Props
// ============================================================================

export interface VersionSelectorProps {
  /** List of versions */
  versions: DeliverableVersion[];
  /** Currently selected version ID */
  selectedVersionId?: string;
  /** Whether to show the comparison toggle */
  showCompareToggle?: boolean;
  /** Whether versions are loading */
  loading?: boolean;
}

export interface VersionSelectorEmits {
  /** Emitted when a version is selected */
  (e: 'select', version: DeliverableVersion): void;
  /** Emitted when compare mode is toggled */
  (e: 'compare', enabled: boolean): void;
}

// ============================================================================
// VersionBadge Props
// ============================================================================

export type VersionCreationType =
  | 'ai_response'
  | 'manual_edit'
  | 'ai_enhancement'
  | 'user_request'
  | 'llm_rerun';

export interface VersionBadgeProps {
  /** Version number */
  versionNumber: number;
  /** How this version was created */
  creationType: VersionCreationType;
  /** Whether this is the current version */
  isCurrent?: boolean;
  /** Size variant */
  size?: 'small' | 'medium';
}

// ============================================================================
// FeedbackInput Props
// ============================================================================

export interface FeedbackInputProps {
  /** Current feedback value */
  modelValue: string;
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Whether feedback is required (shows validation) */
  required?: boolean;
  /** Maximum character count */
  maxLength?: number;
}

export interface FeedbackInputEmits {
  (e: 'update:modelValue', value: string): void;
}

// ============================================================================
// Card Props (for conversation history)
// ============================================================================

export interface HitlPendingCardProps {
  /** Task ID for resuming */
  taskId: string;
  /** Topic/title */
  topic: string;
  /** Current version number */
  versionNumber: number;
  /** Agent slug */
  agentSlug: string;
  /** When HITL became pending */
  pendingSince: string;
}

export interface HitlPendingCardEmits {
  (e: 'review'): void;
}

export interface DeliverableCardProps {
  /** Deliverable ID */
  deliverableId: string;
  /** Title */
  title: string;
  /** Current version number */
  currentVersionNumber: number;
  /** How current version was created */
  creationType: VersionCreationType;
  /** When deliverable was last updated */
  updatedAt: string;
}

export interface DeliverableCardEmits {
  (e: 'view'): void;
}
