/**
 * Interface for discovering deliverables from custom/external systems
 *
 * Allows agents that store deliverables outside the standard deliverables table
 * to register discovery methods that can find and convert their deliverables
 * into the standard format.
 */
export interface IDeliverableDiscovery {
  /**
   * Unique identifier for this discovery method (e.g., 'marketing-swarm', 'cad-agent')
   */
  readonly agentSlug: string;

  /**
   * Agent type(s) this discovery method handles (e.g., 'api', 'media')
   */
  readonly agentTypes: string[];

  /**
   * Discover deliverables for a specific conversation
   * @param conversationId - The conversation ID to search for deliverables
   * @param userId - The user ID (for security/validation)
   * @returns Array of discovered deliverables in standard format, or empty array if none found
   */
  discoverDeliverables(
    conversationId: string,
    userId: string,
  ): Promise<DiscoveredDeliverable[]>;
}

/**
 * Standard format for discovered deliverables
 * These will be converted to the standard Deliverable entity format
 */
export interface DiscoveredDeliverable {
  /**
   * Unique identifier (can be from external system or generated)
   */
  id: string;

  /**
   * Title of the deliverable
   */
  title: string;

  /**
   * Type of deliverable (e.g., 'document', 'image', 'api-response')
   */
  type: string;

  /**
   * Content preview/summary (for list display)
   */
  contentPreview?: string;

  /**
   * Full content (if available, otherwise will be loaded on-demand)
   */
  content?: string;

  /**
   * Format of the content (e.g., 'markdown', 'json', 'html')
   */
  format?: string;

  /**
   * When this deliverable was created
   */
  createdAt: Date;

  /**
   * When this deliverable was last updated
   */
  updatedAt: Date;

  /**
   * Metadata from the external system
   */
  metadata?: Record<string, unknown>;

  /**
   * The conversation ID this deliverable belongs to
   */
  conversationId: string;

  /**
   * The task ID that created this deliverable (if applicable)
   */
  taskId?: string;

  /**
   * Agent name that created this deliverable
   */
  agentName: string;

  /**
   * Flag indicating this is from an external system (not in deliverables table)
   */
  isExternal: boolean;

  /**
   * Method to load full content on-demand (if content is not provided)
   * Returns the full content string
   */
  loadFullContent?: () => Promise<string>;
}
