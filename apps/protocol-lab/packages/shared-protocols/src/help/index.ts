// Help system — structured content for the fishbowl contextual help UI

// Layer definitions (12 protocol layers)
export {
  LAYER_DEFINITIONS,
  getLayerDefinition,
  getLayerForProvider,
} from './layer-definitions';
export type { LayerDefinition } from './layer-definitions';

// Provider definitions (31 protocol providers)
export {
  PROVIDER_DEFINITIONS,
  getProviderDefinition,
  getProvidersByLayer,
  getProvidersByScenario,
} from './provider-definitions';
export type { ProviderDefinition } from './provider-definitions';

// Scenario explanations (11 scenarios across both ecosystems)
export {
  PRAIRIE_RIDGE_SCENARIOS,
  BUILDWELL_SCENARIOS,
  ALL_SCENARIOS,
  getScenarioExplanation,
  getScenariosForEcosystem,
} from './scenario-explanations';
export type { ScenarioExplanation } from './scenario-explanations';

// Code references (source file mappings)
export {
  PROVIDER_CODE_REFS,
  ABSTRACTION_CODE_REFS,
  ALL_CODE_REFS,
  getCodeReference,
  resolveSourcePath,
} from './code-references';
export type { CodeReference } from './code-references';

// Source code reader utility — NOT re-exported here because it uses Node.js fs/path.
// Import directly from './help/source-code.controller' in backend code.
export type { SourceCodeResponse } from './source-code.controller';
