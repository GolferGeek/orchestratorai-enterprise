import {
  Injectable,
  OnModuleInit,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { join } from 'path';
import * as dotenv from 'dotenv';

/**
 * SupabaseService — Supabase client provider for Bridge.
 *
 * Initializes both anon and service-role Supabase clients from environment config.
 * Bridge uses the service client for all A2A message logging and registry operations.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private anonClient: SupabaseClient | null = null;
  private serviceClient: SupabaseClient | null = null;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private configService: ConfigService) {
    this.initializeClients();
  }

  onModuleInit() {
    // No-op: initialization moved to constructor for earlier availability
  }

  private ensureEnvLoaded(): void {
    const baseEnvPath = process.env.ENV_FILE
      ? process.env.ENV_FILE.startsWith('/')
        ? process.env.ENV_FILE
        : join(process.cwd(), process.env.ENV_FILE)
      : join(process.cwd(), '../../.env');
    const result = dotenv.config({ path: baseEnvPath, override: true });
    if (result.error) {
      this.logger.warn(
        `SupabaseService: dotenv load failed from ${baseEnvPath}: ${result.error.message}`,
      );
    }
  }

  private initializeClients() {
    this.ensureEnvLoaded();

    const supabaseConfig = this.configService.get<{
      url?: string;
      anonKey?: string;
      serviceKey?: string;
    }>('supabase');

    const url =
      process.env.SUPABASE_URL ??
      supabaseConfig?.url ??
      this.configService.get<string>('SUPABASE_URL') ??
      'http://127.0.0.1:6012';
    const anonKey =
      process.env.SUPABASE_ANON_KEY ??
      supabaseConfig?.anonKey ??
      this.configService.get<string>('SUPABASE_ANON_KEY');
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      supabaseConfig?.serviceKey ??
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    this.logger.warn(
      `Supabase config - URL: ${url ? 'SET' : 'NOT SET'}, AnonKey: ${anonKey ? 'SET' : 'NOT SET'}, ServiceKey: ${serviceKey ? 'SET' : 'NOT SET'}`,
    );

    if (!url) {
      this.logger.error('Supabase URL not set. Set SUPABASE_URL in .env.');
      return;
    }
    if (!serviceKey) {
      this.logger.error(
        'Supabase service role key not set. Set SUPABASE_SERVICE_ROLE_KEY in .env.',
      );
    }

    if (anonKey) {
      this.anonClient = createClient(url, anonKey);
    }

    if (serviceKey) {
      this.serviceClient = createClient(url, serviceKey);
    }
  }

  getServiceClient(): SupabaseClient {
    if (!this.serviceClient) {
      throw new HttpException(
        'Supabase service client is not available. Check server configuration.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.serviceClient;
  }

  getAnonClient(): SupabaseClient {
    if (!this.anonClient) {
      throw new HttpException(
        'Supabase anon client is not available. Check server configuration.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.anonClient;
  }

  getConfig(): {
    url: string;
    coreSchema: string;
    companySchema: string;
    clientsAvailable: { anon: boolean; service: boolean };
  } {
    const url =
      this.configService.get<string>('supabase.url') ||
      this.configService.get<string>('SUPABASE_URL') ||
      '';
    return {
      url: url.substring(0, 30) + '...',
      coreSchema: 'public',
      companySchema: 'public',
      clientsAvailable: {
        anon: this.anonClient !== null,
        service: this.serviceClient !== null,
      },
    };
  }

  async checkConnection(): Promise<{ status: string; message: string }> {
    if (!this.anonClient && !this.serviceClient) {
      return {
        status: 'disabled',
        message: 'Supabase not configured — service disabled',
      };
    }
    try {
      const client = this.serviceClient ?? this.anonClient!;
      const { error } = await client
        .schema('ambient')
        .from('external_agents')
        .select('agent_id')
        .limit(1);
      if (error) {
        return { status: 'error', message: error.message };
      }
      return { status: 'ok', message: 'Database connection successful' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'error', message };
    }
  }
}
