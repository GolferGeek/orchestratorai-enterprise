export type ProtocolLayer = 'discovery' | 'transport' | 'negotiation' | 'identity' | 'payment' | 'wallet' | 'trust' | 'encryption' | 'resilience' | 'observability' | 'orchestration' | 'audit';
export declare const PROTOCOL_LAYERS: ProtocolLayer[];
export interface ProtocolConfig {
    discovery: string;
    transport: string;
    negotiation: string;
    identity: string;
    payment: string;
    wallet: string;
    trust: string;
    encryption: string;
    resilience: string;
    observability: string;
    orchestration: string;
    audit: string;
}
export interface ProtocolPreset {
    id: string;
    name: string;
    description: string;
    config: ProtocolConfig;
}
export declare const PROTOCOL_PRESETS: ProtocolPreset[];
export interface ProtocolSuite {
    id: string;
    name: string;
    description: string;
    defaultPresetId?: string;
    bundleProviderIds: string[][];
}
export interface ProviderDependency {
    id: string;
    providerIds: string[];
    reason: string;
}
export declare const PROTOCOL_SUITES: ProtocolSuite[];
export declare const PROVIDER_DEPENDENCIES: ProviderDependency[];
export interface ProviderInfo {
    id: string;
    layer: ProtocolLayer;
    name: string;
    description: string;
    standard: string;
    phase: number;
}
export interface ScenarioConfigOverride {
    scenarioId: number;
    config: Partial<ProtocolConfig>;
}
