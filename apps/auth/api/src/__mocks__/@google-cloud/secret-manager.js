// Mock for @google-cloud/secret-manager
const mockSecretManagerServiceClient = {
  accessSecretVersion: jest.fn().mockResolvedValue([
    { payload: { data: Buffer.from('mock-secret-value') } },
  ]),
  addSecretVersion: jest.fn().mockResolvedValue([{}]),
  createSecret: jest.fn().mockResolvedValue([{}]),
  deleteSecret: jest.fn().mockResolvedValue([{}]),
  listSecrets: jest.fn().mockResolvedValue([[]])
};

class SecretManagerServiceClient {
  constructor() {
    Object.assign(this, mockSecretManagerServiceClient);
  }
}

module.exports = { SecretManagerServiceClient };
