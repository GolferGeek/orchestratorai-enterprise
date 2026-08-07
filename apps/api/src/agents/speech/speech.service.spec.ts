import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { of } from 'rxjs';
import { Readable } from 'stream';
import { SpeechService } from './speech.service';

describe('SpeechService external provider boundaries', () => {
  const config = { get: jest.fn() };
  const http = { post: jest.fn() };
  let service: SpeechService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        ELEVENLABS_API_KEY: 'eleven-key',
        ELEVENLABS_VOICE_ID: 'voice-id',
        DEEPGRAM_API_KEY: 'deepgram-key',
      };
      return values[key];
    });
    service = new SpeechService(config as never, http as never);
  });

  it('bounds synthesis time, request size, and response size', async () => {
    http.post.mockReturnValue(of({ data: Buffer.from('mp3') }));

    await expect(service.synthesize('hello')).resolves.toEqual({
      audioData: Buffer.from('mp3').toString('base64'),
      format: 'mp3',
    });

    expect(http.post).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/text-to-speech/voice-id',
      expect.any(Object),
      expect.objectContaining({
        timeout: 30_000,
        maxContentLength: 20 * 1024 * 1024,
        maxBodyLength: 64 * 1024,
      }),
    );
  });

  it('rejects malformed audio responses', async () => {
    http.post.mockReturnValue(of({ data: 'not-an-array-buffer' }));

    await expect(service.synthesize('hello')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('bounds transcription and requires a typed provider result', async () => {
    http.post.mockReturnValue(
      of({
        data: {
          results: {
            channels: [{ alternatives: [{ transcript: 'hello', confidence: 0.9 }] }],
          },
        },
      }),
    );

    await expect(
      service.transcribe(Buffer.from('audio'), 'audio/webm'),
    ).resolves.toEqual({ transcript: 'hello', confidence: 0.9 });
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('https://api.deepgram.com/v1/listen'),
      expect.any(Buffer),
      expect.objectContaining({
        timeout: 30_000,
        maxBodyLength: 10 * 1024 * 1024,
        maxContentLength: 1024 * 1024,
      }),
    );
  });

  it('does not replace missing transcript fields with defaults', async () => {
    http.post.mockReturnValue(
      of({ data: { results: { channels: [{ alternatives: [{}] }] } } }),
    );

    await expect(
      service.transcribe(Buffer.from('audio'), 'audio/webm'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects empty transcription input before making a provider call', async () => {
    await expect(
      service.transcribe(Buffer.alloc(0), 'audio/webm'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('returns a bounded readable stream', async () => {
    http.post.mockReturnValue(of({ data: Readable.from([Buffer.from('mp3')]) }));

    const stream = await service.synthesizeStream('hello');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Buffer));
    }

    expect(Buffer.concat(chunks).toString()).toBe('mp3');
    expect(http.post).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/text-to-speech/voice-id/stream',
      expect.any(Object),
      expect.objectContaining({ timeout: 30_000, maxBodyLength: 64 * 1024 }),
    );
  });
});
