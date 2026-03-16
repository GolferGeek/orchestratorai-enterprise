const mockGetSignedUrl = jest.fn().mockResolvedValue(['https://storage.googleapis.com/bucket/object?X-Goog-Signature=mock']);
const mockSave = jest.fn().mockResolvedValue(undefined);
const mockDelete = jest.fn().mockResolvedValue(undefined);

const mockFile = jest.fn().mockImplementation(() => ({
  save: mockSave,
  getSignedUrl: mockGetSignedUrl,
  delete: mockDelete,
}));

const mockBucket = jest.fn().mockImplementation(() => ({
  file: mockFile,
}));

const Storage = jest.fn().mockImplementation(() => ({
  bucket: mockBucket,
}));

module.exports = { Storage };
