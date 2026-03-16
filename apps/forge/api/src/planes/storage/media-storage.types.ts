/**
 * Types shared between storage provider implementations.
 */

/**
 * Result of storing generated media
 */
export interface StoredMediaResult {
  /** Our internal asset UUID */
  assetId: string;
  /** Public URL to access the media */
  url: string;
  /** Storage path within bucket */
  storagePath: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * Metadata for stored media
 */
export interface MediaStorageMetadata {
  /** Original prompt used to generate */
  prompt: string;
  /** Provider-revised prompt (if applicable) */
  revisedPrompt?: string;
  /** Provider name (openai, google) */
  provider: string;
  /** Model used (gpt-image-1.5, imagen-4.0-generate-001) */
  model: string;
  /** MIME type */
  mime: string;
  /** Image/video width in pixels */
  width?: number;
  /** Image/video height in pixels */
  height?: number;
  /** Video duration in seconds */
  durationSeconds?: number;
  /** Parent asset ID if this is an edit/variation */
  parentAssetId?: string;
}
