/**
 * Re-export shim — Storage plane now lives in planes/storage/.
 */
export { MediaStorageHelper } from '../../planes/storage/supabase-media-storage.service';
export type {
  StoredMediaResult,
  MediaStorageMetadata,
} from '../../planes/storage/media-storage.types';
