import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DrawingOutputDto {
  @ApiProperty({ description: 'Output ID' })
  id!: string;

  @ApiProperty({
    description: 'Format of the output file (step, stl, gltf, etc.)',
  })
  format!: string;

  @ApiProperty({ description: 'Storage path in Supabase storage' })
  storage_path!: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  file_size_bytes?: number;

  @ApiPropertyOptional({
    description: 'Mesh statistics for GLTF files',
  })
  mesh_stats?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Export time in milliseconds' })
  export_time_ms?: number;

  @ApiProperty({ description: 'Created timestamp' })
  created_at!: string;
}

export class GeneratedCodeDto {
  @ApiProperty({ description: 'Generated code ID' })
  id!: string;

  @ApiProperty({ description: 'The generated CAD code' })
  code!: string;

  @ApiProperty({ description: 'Code type (opencascade-js, cadquery, etc.)' })
  code_type!: string;

  @ApiProperty({ description: 'LLM provider used' })
  llm_provider!: string;

  @ApiProperty({ description: 'LLM model used' })
  llm_model!: string;

  @ApiPropertyOptional({ description: 'Prompt tokens used' })
  prompt_tokens?: number;

  @ApiPropertyOptional({ description: 'Completion tokens used' })
  completion_tokens?: number;

  @ApiPropertyOptional({ description: 'Generation time in milliseconds' })
  generation_time_ms?: number;

  @ApiPropertyOptional({ description: 'Whether the code is valid' })
  is_valid?: boolean;

  @ApiPropertyOptional({ description: 'Validation errors', type: 'array' })
  validation_errors?: unknown[];

  @ApiProperty({ description: 'Attempt number' })
  attempt_number!: number;

  @ApiProperty({ description: 'Created timestamp' })
  created_at!: string;
}

export class ExecutionLogEntryDto {
  @ApiProperty({ description: 'Log entry ID' })
  id!: string;

  @ApiProperty({ description: 'Step type' })
  step_type!: string;

  @ApiPropertyOptional({ description: 'Step message' })
  message?: string;

  @ApiPropertyOptional({ description: 'Step details' })
  details?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Duration in milliseconds' })
  duration_ms?: number;

  @ApiProperty({ description: 'Created timestamp' })
  created_at!: string;
}

export class DrawingResponseDto {
  @ApiProperty({ description: 'Drawing ID' })
  id!: string;

  @ApiProperty({ description: 'Project ID' })
  project_id!: string;

  @ApiPropertyOptional({ description: 'Task ID' })
  task_id?: string;

  @ApiPropertyOptional({ description: 'Conversation ID' })
  conversation_id?: string;

  @ApiProperty({ description: 'Drawing name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Drawing description' })
  description?: string;

  @ApiProperty({ description: 'Original prompt' })
  prompt!: string;

  @ApiProperty({ description: 'Version number' })
  version!: number;

  @ApiPropertyOptional({ description: 'Parent drawing ID' })
  parent_drawing_id?: string;

  @ApiProperty({ description: 'Drawing status' })
  status!: string;

  @ApiPropertyOptional({ description: 'Constraints override' })
  constraints_override?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  error_message?: string;

  @ApiProperty({ description: 'Created timestamp' })
  created_at!: string;

  @ApiProperty({ description: 'Updated timestamp' })
  updated_at!: string;

  @ApiPropertyOptional({ description: 'Completed timestamp' })
  completed_at?: string;

  @ApiPropertyOptional({ description: 'User ID who created the drawing' })
  created_by?: string;

  @ApiPropertyOptional({
    description: 'Generated code',
    type: [GeneratedCodeDto],
  })
  generated_code?: GeneratedCodeDto[];

  @ApiPropertyOptional({ description: 'CAD outputs', type: [DrawingOutputDto] })
  outputs?: DrawingOutputDto[];

  @ApiPropertyOptional({
    description: 'Execution log',
    type: [ExecutionLogEntryDto],
  })
  execution_log?: ExecutionLogEntryDto[];
}
