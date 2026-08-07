import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RateLimitGuard } from '../customer-service/guards/rate-limit.guard';

jest.mock('@orchestratorai/planes/auth', () => ({
  Public: () => () => undefined,
}));

import { SpeechController } from './speech.controller';

describe('SpeechController hardening', () => {
  const speech = {
    synthesize: jest.fn(),
    synthesizeStream: jest.fn(),
    transcribe: jest.fn(),
  };
  let controller: SpeechController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SpeechController(speech as never);
  });

  it('applies RateLimitGuard to every public speech endpoint', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      SpeechController,
    ) as unknown[];
    expect(guards).toContain(RateLimitGuard);
  });

  it('rejects audio larger than 10 MB before calling Deepgram', async () => {
    const file = {
      size: 10 * 1024 * 1024 + 1,
      mimetype: 'audio/webm',
      buffer: Buffer.alloc(1),
    } as Express.Multer.File;

    await expect(controller.transcribe(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(speech.transcribe).not.toHaveBeenCalled();
  });

  it('rejects a MIME type outside the audio allowlist', async () => {
    const file = {
      size: 10,
      mimetype: 'application/octet-stream',
      buffer: Buffer.from('not audio'),
    } as Express.Multer.File;

    await expect(controller.transcribe(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(speech.transcribe).not.toHaveBeenCalled();
  });
});
