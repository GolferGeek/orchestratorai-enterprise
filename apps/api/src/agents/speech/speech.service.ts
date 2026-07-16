import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { Readable } from 'stream';
import type { SynthesizeResponseDto, TranscribeResponseDto } from './dto';

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  private getElevenLabsApiKey(): string {
    const key = this.configService.get<string>('ELEVENLABS_API_KEY');
    if (!key) {
      throw new InternalServerErrorException(
        'ELEVENLABS_API_KEY environment variable is required',
      );
    }
    return key;
  }

  private getElevenLabsVoiceId(): string {
    const id = this.configService.get<string>('ELEVENLABS_VOICE_ID');
    if (!id) {
      throw new InternalServerErrorException(
        'ELEVENLABS_VOICE_ID environment variable is required',
      );
    }
    return id;
  }

  private getDeepgramApiKey(): string {
    const key = this.configService.get<string>('DEEPGRAM_API_KEY');
    if (!key) {
      throw new InternalServerErrorException(
        'DEEPGRAM_API_KEY environment variable is required',
      );
    }
    return key;
  }

  async synthesize(
    text: string,
    voiceName?: string,
    speakingRate?: number,
  ): Promise<SynthesizeResponseDto> {
    const apiKey = this.getElevenLabsApiKey();
    const voiceId = voiceName || this.getElevenLabsVoiceId();

    this.logger.log(
      `Synthesizing text (${text.length} chars) with voiceId=${voiceId}`,
    );

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const requestBody: Record<string, unknown> = {
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    };

    if (speakingRate !== undefined) {
      requestBody['voice_settings'] = {
        ...(requestBody['voice_settings'] as Record<string, unknown>),
        speed: speakingRate,
      };
    }

    const response = await firstValueFrom(
      this.httpService.post(url, requestBody, {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        responseType: 'arraybuffer',
      }),
    );

    if (!response.data) {
      throw new InternalServerErrorException(
        'ElevenLabs returned empty audio response',
      );
    }

    const audioBuffer = Buffer.from(response.data as ArrayBuffer);
    const audioData = audioBuffer.toString('base64');

    this.logger.log(`Synthesis complete: ${audioBuffer.length} bytes`);

    return { audioData, format: 'mp3' };
  }

  /**
   * Stream TTS audio from ElevenLabs using their HTTP streaming endpoint.
   * Returns a Node.js Readable stream of raw MP3 bytes for progressive playback.
   * Uses eleven_flash_v2_5 for lowest time-to-first-byte (~75ms).
   */
  async synthesizeStream(
    text: string,
    voiceName?: string,
    speakingRate?: number,
  ): Promise<Readable> {
    const apiKey = this.getElevenLabsApiKey();
    const voiceId = voiceName || this.getElevenLabsVoiceId();

    this.logger.log(
      `Streaming synthesis (${text.length} chars) with voiceId=${voiceId}`,
    );

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;

    const requestBody: Record<string, unknown> = {
      text,
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    };

    if (speakingRate !== undefined) {
      requestBody['voice_settings'] = {
        ...(requestBody['voice_settings'] as Record<string, unknown>),
        speed: speakingRate,
      };
    }

    const response = await firstValueFrom(
      this.httpService.post(url, requestBody, {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        responseType: 'stream',
      }),
    );

    if (!response.data) {
      throw new InternalServerErrorException(
        'ElevenLabs returned empty streaming response',
      );
    }

    return response.data as Readable;
  }

  async transcribe(
    audioBuffer: Buffer,
    mimeType: string,
  ): Promise<TranscribeResponseDto> {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new BadRequestException('Audio buffer is empty');
    }

    this.logger.log(
      `Transcribing audio: ${audioBuffer.length} bytes, mimeType=${mimeType}`,
    );

    const url =
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true';

    const response = await firstValueFrom(
      this.httpService.post(url, audioBuffer, {
        headers: {
          Authorization: `Token ${this.getDeepgramApiKey()}`,
          'Content-Type': mimeType || 'audio/webm;codecs=opus',
        },
      }),
    );

    const result = response.data as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            confidence?: number;
          }>;
        }>;
      };
    };

    const alternative = result.results?.channels?.[0]?.alternatives?.[0];

    if (!alternative) {
      throw new InternalServerErrorException(
        'Deepgram returned no transcription result',
      );
    }

    const transcript = alternative.transcript ?? '';
    const confidence = alternative.confidence ?? 0;

    this.logger.log(
      `Transcription complete: "${transcript.substring(0, 50)}..." confidence=${confidence}`,
    );

    return { transcript, confidence };
  }
}
