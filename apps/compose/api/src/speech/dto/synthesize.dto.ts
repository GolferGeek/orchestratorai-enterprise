import { IsString, IsNumber, IsOptional, MinLength } from 'class-validator';

export class SynthesizeDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsString()
  @IsOptional()
  voiceName?: string;

  @IsNumber()
  @IsOptional()
  speakingRate?: number;
}

export interface SynthesizeResponseDto {
  audioData: string;
  format: 'mp3';
}
