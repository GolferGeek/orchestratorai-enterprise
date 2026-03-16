export interface MessageSecurityEnvelope {
  nonce: string;               // UUIDv4, unique per message
  timestamp: number;           // Unix epoch ms
  senderId: string;            // Agent identity ID
  senderPublicKey: string;     // Sender's public key for verification
  signature: string;           // Signature over canonical payload
  identityProvider: string;    // Which identity provider signed
}

export interface SecureTransportMessage {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: Record<string, unknown>;
  security: MessageSecurityEnvelope;
}

export interface MessageValidationError {
  code: 'INVALID_SIGNATURE' | 'REPLAY_DETECTED' | 'TIMESTAMP_EXPIRED' | 'SCHEMA_INVALID' | 'UNKNOWN_SENDER';
  message: string;
  details?: Record<string, unknown>;
}

export interface MessageValidationResult {
  valid: boolean;
  error?: MessageValidationError;
}
