import {
  IsString,
  IsNumber,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  Min,
  Max,
} from 'class-validator';

export class SynthesizeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  text!: string;

  @IsString()
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,100}$/)
  voiceName?: string;

  @IsNumber()
  @IsOptional()
  @Min(0.7)
  @Max(1.2)
  speakingRate?: number;
}

export interface SynthesizeResponseDto {
  audioData: string;
  format: 'mp3';
}
