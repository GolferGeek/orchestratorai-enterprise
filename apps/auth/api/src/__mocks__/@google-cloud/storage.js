// Mock for @google-cloud/storage
module.exports = {
  Storage: jest.fn().mockImplementation(() => ({
    bucket: jest.fn().mockReturnValue({
      file: jest.fn().mockReturnValue({
        save: jest.fn().mockResolvedValue([]),
        download: jest.fn().mockResolvedValue([Buffer.from('mock-content')]),
        delete: jest.fn().mockResolvedValue([{}]),
        exists: jest.fn().mockResolvedValue([true]),
        getSignedUrl: jest.fn().mockResolvedValue(['https://mock-signed-url']),
      }),
      getFiles: jest.fn().mockResolvedValue([[]], {}),
      upload: jest.fn().mockResolvedValue([{}]),
    })),
  })),
};
