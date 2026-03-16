import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateStreamTokenDto {
  @ApiPropertyOptional({
    description: 'Optional stream identifier to scope the token',
    example: '6a7eae61-3c2b-4a06-8f7f-5afad0881f4e',
  })
  @IsString()
  @IsOptional()
  streamId?: string;
}
