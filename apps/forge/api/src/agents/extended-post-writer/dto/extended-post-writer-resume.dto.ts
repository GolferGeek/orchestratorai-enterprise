import {
  IsString,
  IsOptional,
  IsIn,
  IsObject,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Edited content DTO - matches GeneratedContent interface
 */
export class EditedContentDto {
  @IsString()
  blogPost!: string;

  @IsString()
  seoDescription!: string;

  @IsArray()
  @IsString({ each: true })
  socialPosts!: string[];
}

/**
 * Resume DTO for Extended Post Writer HITL
 */
export class ExtendedPostWriterResumeDto {
  @IsString()
  @IsIn(['approve', 'edit', 'reject'])
  decision!: 'approve' | 'edit' | 'reject';

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EditedContentDto)
  editedContent?: EditedContentDto;

  @IsOptional()
  @IsString()
  feedback?: string;
}
