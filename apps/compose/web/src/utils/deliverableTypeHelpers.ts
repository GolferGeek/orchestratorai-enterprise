import { DeliverableType, DeliverableFormat } from '@/services/deliverablesService';

// Interface for service deliverable (API response format)
interface ServiceDeliverable {
  id: string;
  user_id: string;
  conversation_id?: string;
  project_step_id?: string;
  agent_name?: string;
  title: string;
  description?: string;
  type?: string;
  format?: string;
  created_at: string;
  updated_at: string;
  content_preview?: string;
  content?: string;
}

// Interface for store deliverable (frontend format with Date objects)
interface StoreDeliverable {
  id: string;
  user_id: string;
  conversation_id?: string;
  project_step_id?: string;
  agent_name?: string;
  title: string;
  description?: string;
  type?: DeliverableType;
  format?: DeliverableFormat;
  created_at: Date;
  updated_at: Date;
  content_preview?: string;
  content?: string;
}

// Helper to ensure string is a valid DeliverableType
export function toDeliverableType(type: string | DeliverableType): DeliverableType {
  if (Object.values(DeliverableType).includes(type as DeliverableType)) {
    return type as DeliverableType;
  }
  // Default fallback
  return DeliverableType.DOCUMENT;
}
// Helper to ensure string is a valid DeliverableFormat  
export function toDeliverableFormat(format: string | DeliverableFormat): DeliverableFormat {
  if (Object.values(DeliverableFormat).includes(format as DeliverableFormat)) {
    return format as DeliverableFormat;
  }
  // Default fallback
  return DeliverableFormat.MARKDOWN;
}
// Convert service deliverable (with string dates) to store deliverable (with Date objects)
export function convertServiceToStoreDeliverable(serviceDeliverable: ServiceDeliverable): StoreDeliverable {
  return {
    ...serviceDeliverable,
    type: toDeliverableType(serviceDeliverable.type || DeliverableType.DOCUMENT),
    format: toDeliverableFormat(serviceDeliverable.format || DeliverableFormat.MARKDOWN),
    created_at: new Date(serviceDeliverable.created_at),
    updated_at: new Date(serviceDeliverable.updated_at),
    content_preview: serviceDeliverable.content_preview || serviceDeliverable.content?.substring(0, 200) || ''
  };
}
// Convert store deliverable to service format
export function convertStoreToServiceDeliverable(storeDeliverable: StoreDeliverable): ServiceDeliverable {
  return {
    ...storeDeliverable,
    created_at: storeDeliverable.created_at instanceof Date 
      ? storeDeliverable.created_at.toISOString() 
      : storeDeliverable.created_at,
    updated_at: storeDeliverable.updated_at instanceof Date
      ? storeDeliverable.updated_at.toISOString()
      : storeDeliverable.updated_at
  };
}