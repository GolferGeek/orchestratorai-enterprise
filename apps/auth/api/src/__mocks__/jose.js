// Mock for jose (JOSE - JSON Object Signing and Encryption)
module.exports = {
  createRemoteJWKSet: jest.fn().mockReturnValue(jest.fn()),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: {
      sub: 'mock-user-id',
      email: 'mock@example.com',
      aud: 'authenticated',
    },
    protectedHeader: { alg: 'RS256' },
  }),
  SignJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    setIssuedAt: jest.fn().mockReturnThis(),
    setExpirationTime: jest.fn().mockReturnThis(),
    sign: jest.fn().mockResolvedValue('mock.signed.jwt'),
  })),
  importJWK: jest.fn().mockResolvedValue({}),
  importX509: jest.fn().mockResolvedValue({}),
  exportJWK: jest.fn().mockResolvedValue({}),
  generateKeyPair: jest.fn().mockResolvedValue({
    privateKey: {},
    publicKey: {},
  }),
};
