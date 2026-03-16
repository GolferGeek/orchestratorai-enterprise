const mockAccessSecretVersion = jest.fn().mockResolvedValue([
  {
    payload: { data: Buffer.from('mock-secret-value') },
  },
]);

const SecretManagerServiceClient = jest.fn().mockImplementation(() => ({
  accessSecretVersion: mockAccessSecretVersion,
}));

module.exports = { SecretManagerServiceClient };
