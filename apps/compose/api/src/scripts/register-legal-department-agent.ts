/**
 * Script to register the legal-department agent in the database
 *
 * Run with: npx ts-node -r tsconfig-paths/register apps/api/src/scripts/register-legal-department-agent.ts
 *
 * Uses a minimal NestJS application context to access DATABASE_SERVICE,
 * which supports any configured DB_PROVIDER (supabase, postgresql, sqlserver).
 */

import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { DatabaseModule } from '../planes/database/database.module';
import {
  DATABASE_SERVICE,
  DatabaseService,
} from '../planes/database/database.interface';

const logger = new Logger('RegisterLegalDepartmentAgent');

// Load environment variables before bootstrapping
dotenv.config({ path: resolve(process.cwd(), '.env') });

/**
 * Minimal bootstrap module — only what is needed to resolve DATABASE_SERVICE.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), '.env')],
    }),
    DatabaseModule,
  ],
})
class BootstrapModule {}

async function registerLegalDepartmentAgent(): Promise<void> {
  logger.log('=== Registering Legal Department Agent ===');

  const app = await NestFactory.createApplicationContext(BootstrapModule, {
    logger: ['error', 'warn', 'log'],
  });

  const db = app.get<DatabaseService>(DATABASE_SERVICE);

  const agentData = {
    slug: 'legal-department',
    organization_slug: ['legal'], // Legal organization
    name: 'Legal Department AI',
    description: 'AI-powered legal document analysis and routing system',
    version: '1.0.0',
    agent_type: 'langgraph',
    department: 'legal',
    tags: ['legal', 'document-analysis', 'routing', 'langgraph'],
    capabilities: [
      'document-analysis',
      'legal-routing',
      'specialist-delegation',
    ],
    context: `# Legal Department AI

The Legal Department AI is an intelligent document analysis and routing system that:
- Analyzes legal documents (contracts, NDAs, MSAs, etc.)
- Extracts key metadata (parties, dates, signatures, sections)
- Routes documents to appropriate legal specialists
- Provides comprehensive legal analysis and recommendations

## Capabilities
- Document type classification
- Section identification and extraction
- Signature block detection
- Date extraction and normalization
- Party identification
- Legal routing decisions
- Specialist delegation`,
    io_schema: {
      input: {
        type: 'object',
        properties: {
          documents: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                filename: { type: 'string' },
                mimeType: { type: 'string' },
                base64Data: { type: 'string' },
              },
              required: ['filename', 'mimeType', 'base64Data'],
            },
          },
        },
        required: ['documents'],
      },
      output: {
        type: 'object',
        properties: {
          analysisResults: { type: 'object' },
          routingDecision: { type: 'object' },
          specialistOutputs: { type: 'object' },
        },
      },
    },
    endpoint: null,
    llm_config: null,
    metadata: {
      langgraph: true,
      supportsHitl: true,
      deliverableType: 'analysis',
    },
  };

  try {
    logger.log(
      `Registering agent with data: ${JSON.stringify(agentData, null, 2)}`,
    );
    logger.log(
      `Agent type: ${agentData.agent_type}, endpoint: ${String(agentData.endpoint)}`,
    );

    const result = await db
      .from(null, 'agents')
      .upsert(agentData, { onConflict: 'slug' })
      .select('*')
      .single();

    if (result.error) {
      logger.error(`Error registering agent: ${JSON.stringify(result.error)}`);
      await app.close();
      process.exit(1);
    }

    if (!result.data) {
      logger.error('No data returned from upsert');
      await app.close();
      process.exit(1);
    }

    interface AgentRecord {
      slug: string;
      name: string;
      agent_type: string;
      organization_slug: string[];
    }

    const typedData = result.data as unknown as AgentRecord;

    logger.log('Successfully registered legal-department agent!');
    logger.log('Agent details:');
    logger.log(`  Slug: ${typedData.slug}`);
    logger.log(`  Name: ${typedData.name}`);
    logger.log(`  Type: ${typedData.agent_type}`);
    logger.log(`  Endpoint: internal (null)`);
    logger.log(`  Organization: ${typedData.organization_slug.join(', ')}`);
    logger.log('Agent is now available for use!');
  } catch (error) {
    logger.error(`Failed to register agent: ${String(error)}`);
    await app.close();
    process.exit(1);
  }

  await app.close();
}

void registerLegalDepartmentAgent();
