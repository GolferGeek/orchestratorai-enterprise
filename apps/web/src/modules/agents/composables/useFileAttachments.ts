/**
 * useFileAttachments.ts
 *
 * Composable that manages file attachment state for the message input.
 * Handles validation, base64 encoding, and image preview generation.
 *
 * Three-layer architecture: this is a composable (UI logic layer), not a service.
 * No API calls here — pure client-side file processing.
 */

import { ref } from 'vue';
import type { Ref } from 'vue';

// ============================================================================
// Types
// ============================================================================

export interface PendingAttachment {
  file: File;
  base64: string;
  mimeType: string;
  filename: string;
  preview?: string; // data URL for image thumbnails
}

export interface RejectedFile {
  filename: string;
  reason: string;
}

// ============================================================================
// Constants
// ============================================================================

const ACCEPTED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILE_COUNT = 4;

// ============================================================================
// Helpers
// ============================================================================

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Read a File as a base64-encoded string (without the data URL prefix).
 * Returns the raw base64 content only.
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:<mimeType>;base64," prefix
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error(`Failed to extract base64 from file: ${file.name}`));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`FileReader error for: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Read a File as a data URL (full data URL with prefix) for image preview.
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`FileReader error for: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// Composable
// ============================================================================

export function useFileAttachments(): {
  attachments: Ref<PendingAttachment[]>;
  addFiles: (files: FileList | File[]) => Promise<RejectedFile[]>;
  removeAttachment: (index: number) => void;
  clear: () => void;
} {
  const attachments = ref<PendingAttachment[]>([]);

  /**
   * Validate and process a list of files.
   * Returns rejected files with reasons for error display.
   * Accepted files are appended to the attachments ref.
   */
  async function addFiles(files: FileList | File[]): Promise<RejectedFile[]> {
    const fileArray = Array.from(files);
    const rejected: RejectedFile[] = [];

    const slotsAvailable = MAX_FILE_COUNT - attachments.value.length;
    if (slotsAvailable <= 0) {
      return fileArray.map((f) => ({
        filename: f.name,
        reason: `Maximum ${MAX_FILE_COUNT} attachments allowed`,
      }));
    }

    const toProcess = fileArray.slice(0, slotsAvailable);
    const overflow = fileArray.slice(slotsAvailable);

    for (const f of overflow) {
      rejected.push({
        filename: f.name,
        reason: `Maximum ${MAX_FILE_COUNT} attachments allowed`,
      });
    }

    for (const file of toProcess) {
      if (!ACCEPTED_MIME_TYPES.has(file.type)) {
        rejected.push({ filename: file.name, reason: 'File type not supported' });
        continue;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        rejected.push({ filename: file.name, reason: 'File exceeds 10 MB limit' });
        continue;
      }

      try {
        const base64 = await readFileAsBase64(file);
        let preview: string | undefined;

        if (isImageMimeType(file.type)) {
          preview = await readFileAsDataUrl(file);
        }

        attachments.value = [
          ...attachments.value,
          {
            file,
            base64,
            mimeType: file.type,
            filename: file.name,
            preview,
          },
        ];
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Failed to read file';
        rejected.push({ filename: file.name, reason });
      }
    }

    return rejected;
  }

  function removeAttachment(index: number): void {
    const updated = [...attachments.value];
    updated.splice(index, 1);
    attachments.value = updated;
  }

  function clear(): void {
    attachments.value = [];
  }

  return { attachments, addFiles, removeAttachment, clear };
}
