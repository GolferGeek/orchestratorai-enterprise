import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  IsUUID,
  IsBoolean,
  IsIn,
} from 'class-validator';

export type RagComplexityType =
  | 'basic'
  | 'attributed'
  | 'hybrid'
  | 'cross-reference'
  | 'temporal';

export class CreateCollectionDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  embeddingModel?: string = 'nomic-embed-text';

  @IsInt()
  @Min(100)
  @Max(4000)
  @IsOptional()
  chunkSize?: number = 1000;

  @IsInt()
  @Min(0)
  @Max(1000)
  @IsOptional()
  chunkOverlap?: number = 200;

  @IsString()
  @IsOptional()
  requiredRole?: string | null;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  allowedUsers?: string[] | null;

  @IsBoolean()
  @IsOptional()
  privateToCreator?: boolean;

  @IsString()
  @IsIn(['basic', 'attributed', 'hybrid', 'cross-reference', 'temporal'])
  @IsOptional()
  complexityType?: RagComplexityType = 'basic';
}
