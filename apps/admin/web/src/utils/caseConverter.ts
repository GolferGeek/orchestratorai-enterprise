// Utility functions for case conversion - simplified after backend standardization
// The API now consistently returns camelCase, so most conversions are no longer needed
// Keep this function for any legacy compatibility needs

// Generic object type for case conversion
type GenericObject = Record<string, unknown>;

export function snakeToCamel(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(snakeToCamel);
  }
  const camelObj: GenericObject = {};
  const sourceObj = obj as GenericObject;
  for (const key in sourceObj) {
    if (Object.prototype.hasOwnProperty.call(sourceObj, key)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      camelObj[camelKey] = snakeToCamel(sourceObj[key]);
    }
  }
  return camelObj;
}
// Legacy support for LLM Selection - API now expects camelCase directly
export function convertLLMSelectionToAPI(selection: unknown): unknown {
  // API now expects camelCase, so return as-is
  return selection;
}
// Legacy support for API responses - API now returns camelCase directly  
export function convertAPIResponseToFrontend(response: unknown): unknown {
  // API now returns camelCase, so return as-is
  return response;
}
// Format agent names from snake_case or kebab-case to Title Case for display
export function formatAgentName(name: string): string {
  if (!name) return '';
  return name.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
// Format agent descriptions for display
export function formatAgentDescription(description: string): string {
  if (!description) return '';
  return description.trim();
}