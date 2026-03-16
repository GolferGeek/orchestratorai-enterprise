import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { SpeechService } from './speech.service';
import { SynthesizeDto, SynthesizeResponseDto } from './dto/synthesize.dto';
import { TranscribeResponseDto } from './dto/transcribe.dto';
import { Public } from '../auth/decorators/public.decorator';

/**
 * SpeechController
 *
 * TTS (ElevenLabs) and STT (Deepgram) proxy endpoints.
 * Marked @Public() — accessible to both authenticated app users and
 * unauthenticated guest sessions.
 */
@Public()
@Controller('speech')
export class SpeechController {
  private readonly logger = new Logger(SpeechController.name);

  constructor(private readonly speechService: SpeechService) {}

  /**
   * Convert text to speech audio via ElevenLabs.
   * POST /speech/synthesize
   * Request:  { text: string, voiceName?: string, speakingRate?: number }
   * Response: { audioData: string (base64 MP3), format: "mp3" }
   */
  @Post('synthesize')
  @HttpCode(HttpStatus.OK)
  async synthesize(
    @Body() body: SynthesizeDto,
  ): Promise<SynthesizeResponseDto> {
    this.logger.log(
      `POST /speech/synthesize — text length=${body.text?.length}`,
    );
    return this.speechService.synthesize(
      body.text,
      body.voiceName,
      body.speakingRate,
    );
  }

  /**
   * Stream text-to-speech audio via ElevenLabs streaming endpoint.
   * POST /speech/synthesize-stream
   * Request:  { text: string, voiceName?: string, speakingRate?: number }
   * Response: Raw MP3 audio stream (chunked transfer encoding)
   *
   * Uses eleven_flash_v2_5 for lowest TTFB (~75ms). Audio chunks are piped
   * directly from ElevenLabs to the client for progressive playback.
   */
  @Post('synthesize-stream')
  async synthesizeStream(
    @Body() body: SynthesizeDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `POST /speech/synthesize-stream — text length=${body.text?.length}`,
    );

    const audioStream = await this.speechService.synthesizeStream(
      body.text,
      body.voiceName,
      body.speakingRate,
    );

    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    });

    audioStream.pipe(res);
  }

  /**
   * Transcribe audio to text via Deepgram.
   * POST /speech/transcribe
   * Request:  multipart/form-data { audio: Blob }
   * Response: { transcript: string, confidence: number }
   */
  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('audio'))
  async transcribe(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<TranscribeResponseDto> {
    if (!file) {
      throw new BadRequestException('audio file is required');
    }

    this.logger.log(
      `POST /speech/transcribe — size=${file.size}, mimetype=${file.mimetype}`,
    );

    return this.speechService.transcribe(file.buffer, file.mimetype);
  }
}
