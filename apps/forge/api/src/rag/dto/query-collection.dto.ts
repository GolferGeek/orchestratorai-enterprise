import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsNumber,
  IsIn,
  IsArray,
  IsBoolean,
} from 'class-validator';

export class QueryCollectionDto {
  @IsString()
  query!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  topK?: number = 5;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  similarityThreshold?: number = 0.5;

  @IsString()
  @IsIn(['basic', 'mmr', 'reranking'])
  @IsOptional()
  strategy?: 'basic' | 'mmr' | 'reranking' = 'basic';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  documentIds?: string[];

  @IsBoolean()
  @IsOptional()
  includeMetadata?: boolean = false;
}
