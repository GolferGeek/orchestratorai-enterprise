import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import {
  PrivacyAdminService,
  CreateDictionaryEntryRequest,
  CreatePatternRequest,
  PrivacyDictionaryEntry,
  PrivacyMapping,
  PrivacyPattern,
  PrivacyStats,
  SanitizationPreview,
  UpdateDictionaryEntryRequest,
  UpdatePatternRequest,
} from './privacy-admin.service';

/**
 * Admin surface for the LLM-boundary PII pipeline.
 *
 * CAUTION: the dictionary endpoints return original values — that is what makes
 * pseudonymization reversible — so every route here is behind
 * `admin:settings`. The mapping endpoints return hashes and pseudonyms only.
 */
@ApiTags('privacy-admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
@Controller('admin/privacy')
export class PrivacyAdminController {
  constructor(private readonly privacyAdminService: PrivacyAdminService) {}

  // ===================== Stats =====================

  @Get('stats')
  @ApiOperation({
    summary: 'Counts across patterns, dictionary entries and issued pseudonyms',
  })
  @ApiResponse({ status: 200, description: 'Privacy pipeline statistics' })
  async getStats(): Promise<PrivacyStats> {
    return this.privacyAdminService.getStats();
  }

  // ===================== Patterns =====================

  @Get('patterns')
  @ApiOperation({
    summary: 'List PII detection patterns',
    description:
      'Built-in patterns are returned alongside custom ones and flagged with isBuiltIn.',
  })
  async listPatterns(): Promise<PrivacyPattern[]> {
    return this.privacyAdminService.listPatterns();
  }

  @Post('patterns')
  @ApiOperation({
    summary: 'Create a custom PII pattern',
    description:
      'The regex is compiled before it is stored — an invalid pattern would break detection for every request.',
  })
  async createPattern(
    @Body() body: CreatePatternRequest,
  ): Promise<PrivacyPattern> {
    return this.privacyAdminService.createPattern(body);
  }

  @Put('patterns/:id')
  @ApiOperation({
    summary: 'Update a custom PII pattern',
    description: 'Built-in patterns are rejected with 403.',
  })
  async updatePattern(
    @Param('id') id: string,
    @Body() body: UpdatePatternRequest,
  ): Promise<PrivacyPattern> {
    return this.privacyAdminService.updatePattern(id, body);
  }

  @Delete('patterns/:id')
  @ApiOperation({
    summary: 'Delete a custom PII pattern',
    description: 'Built-in patterns are rejected with 403.',
  })
  async deletePattern(@Param('id') id: string): Promise<{ deleted: true }> {
    await this.privacyAdminService.deletePattern(id);
    return { deleted: true };
  }

  // ===================== Dictionary =====================

  @Get('dictionary')
  @ApiOperation({
    summary: 'List pseudonym dictionary entries',
    description:
      'CAUTION: returns original values. Role-gated to admin:settings.',
  })
  @ApiQuery({ name: 'organizationSlug', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Substring match against original_value',
  })
  async listDictionary(
    @Query('organizationSlug') organizationSlug?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ): Promise<PrivacyDictionaryEntry[]> {
    return this.privacyAdminService.listDictionaryEntries({
      organizationSlug,
      category,
      search,
    });
  }

  @Post('dictionary')
  @ApiOperation({ summary: 'Add a pseudonym dictionary entry' })
  async createDictionaryEntry(
    @Body() body: CreateDictionaryEntryRequest,
  ): Promise<PrivacyDictionaryEntry> {
    return this.privacyAdminService.createDictionaryEntry(body);
  }

  @Put('dictionary/:id')
  @ApiOperation({ summary: 'Update a pseudonym dictionary entry' })
  async updateDictionaryEntry(
    @Param('id') id: string,
    @Body() body: UpdateDictionaryEntryRequest,
  ): Promise<PrivacyDictionaryEntry> {
    return this.privacyAdminService.updateDictionaryEntry(id, body);
  }

  @Delete('dictionary/:id')
  @ApiOperation({ summary: 'Delete a pseudonym dictionary entry' })
  async deleteDictionaryEntry(
    @Param('id') id: string,
  ): Promise<{ deleted: true }> {
    await this.privacyAdminService.deleteDictionaryEntry(id);
    return { deleted: true };
  }

  @Post('dictionary/import')
  @ApiOperation({
    summary: 'Bulk import dictionary entries',
    description:
      'Rejected rows are reported by index rather than failing the whole import.',
  })
  async importDictionary(
    @Body() body: { entries: CreateDictionaryEntryRequest[] },
  ): Promise<{
    imported: number;
    failures: Array<{ index: number; reason: string }>;
  }> {
    return this.privacyAdminService.importDictionaryEntries(body.entries ?? []);
  }

  // ===================== Mappings =====================

  @Get('mappings')
  @ApiOperation({
    summary: 'List issued pseudonym mappings',
    description:
      'Returns the hash, not the original value — the source value is never stored.',
  })
  @ApiQuery({ name: 'dataType', required: false })
  @ApiQuery({ name: 'context', required: false })
  @ApiQuery({ name: 'limit', required: false, description: 'Default 50, max 200' })
  @ApiQuery({ name: 'offset', required: false })
  async listMappings(
    @Query('dataType') dataType?: string,
    @Query('context') context?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ mappings: PrivacyMapping[]; total: number }> {
    return this.privacyAdminService.listMappings({
      dataType,
      context,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  // ===================== Testing =====================

  @Post('preview')
  @ApiOperation({
    summary: 'Run text through the real boundary pipeline without calling a provider',
    description:
      'Returns each stage — pseudonymized, redacted, restored — so an operator can verify what would leave the building and that the round trip is lossless.',
  })
  async preview(
    @Body()
    body: {
      text: string;
      organizationSlug?: string | null;
      agentSlug?: string | null;
    },
  ): Promise<SanitizationPreview> {
    return this.privacyAdminService.previewSanitization(body.text, {
      organizationSlug: body.organizationSlug ?? null,
      agentSlug: body.agentSlug ?? null,
    });
  }
}
