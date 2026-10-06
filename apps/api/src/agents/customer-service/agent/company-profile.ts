import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestratorai/planes/database';

/**
 * How customers reach the company. Stored on the organization row as
 * `settings.customerService`; `email` is required, the rest optional.
 */
export interface CompanyContact {
  email: string;
  phone?: string;
  bookingUrl?: string;
}

/** The company the customer-service agent speaks for. */
export interface CompanyProfile {
  orgSlug: string;
  name: string;
  contact: CompanyContact;
}

const CONTACT_KEYS = new Set(['email', 'phone', 'bookingUrl']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What a guest is told; the detail is for whoever sets the organization up. */
export const NOT_CONFIGURED_MESSAGE = "This organization hasn't set up customer service yet.";
export const NOT_CONFIGURED_CODE = 'customer_service_not_configured';

/**
 * The organization the widget speaks for is not set up for customer service.
 * Guests get a 503 with a plain message and a code; the error's own message
 * (and the server log) say exactly what is missing.
 */
export class CustomerServiceNotConfiguredException extends ServiceUnavailableException {
  constructor(readonly detail: string) {
    super({ statusCode: 503, code: NOT_CONFIGURED_CODE, message: NOT_CONFIGURED_MESSAGE });
    this.message = detail;
  }
}

const logger = new Logger('CustomerServiceProfile');

function configError(orgSlug: string, problem: string): CustomerServiceNotConfiguredException {
  const detail =
    `Customer service cannot speak for organization '${orgSlug}': ${problem}. ` +
    'Set organizations.settings.customerService to { "email": string, "phone"?: string, "bookingUrl"?: string }.';
  logger.warn(detail);
  return new CustomerServiceNotConfiguredException(detail);
}

function optionalString(
  orgSlug: string,
  settings: Record<string, unknown>,
  key: 'phone' | 'bookingUrl',
): string | undefined {
  if (!(key in settings)) {
    return undefined;
  }
  const value = settings[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw configError(
      orgSlug,
      `settings.customerService.${key} must be a non-empty string when present`,
    );
  }
  return value.trim();
}

/**
 * Validate an organizations row (`name`, `settings`) into a CompanyProfile.
 * Every problem throws: the agent must never answer for a company it cannot
 * name or give contact details for.
 */
export function parseCompanyProfile(
  orgSlug: string,
  row: unknown,
): CompanyProfile {
  if (row === null || row === undefined) {
    throw configError(orgSlug, 'the organization does not exist');
  }
  if (!isRecord(row)) {
    throw configError(orgSlug, 'the organization row is not an object');
  }
  if (typeof row.name !== 'string' || row.name.trim().length === 0) {
    throw configError(orgSlug, 'the organization has no name');
  }
  if (!isRecord(row.settings)) {
    throw configError(orgSlug, 'the organization has no settings object');
  }
  const settings = row.settings.customerService;
  if (settings === undefined) {
    throw configError(orgSlug, 'settings.customerService is missing');
  }
  if (!isRecord(settings)) {
    throw configError(orgSlug, 'settings.customerService must be an object');
  }

  const unknownKeys = Object.keys(settings).filter(
    (key) => !CONTACT_KEYS.has(key),
  );
  if (unknownKeys.length > 0) {
    throw configError(
      orgSlug,
      `settings.customerService has unknown keys: ${unknownKeys.join(', ')}`,
    );
  }

  const email = settings.email;
  if (email === undefined) {
    throw configError(orgSlug, 'settings.customerService.email is missing');
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw configError(
      orgSlug,
      'settings.customerService.email must be an email address',
    );
  }

  const phone = optionalString(orgSlug, settings, 'phone');
  const bookingUrl = optionalString(orgSlug, settings, 'bookingUrl');
  if (bookingUrl !== undefined && !/^https?:\/\/\S+$/.test(bookingUrl)) {
    throw configError(
      orgSlug,
      'settings.customerService.bookingUrl must be an http(s) URL',
    );
  }

  const contact: CompanyContact = { email: email.trim() };
  if (phone !== undefined) {
    contact.phone = phone;
  }
  if (bookingUrl !== undefined) {
    contact.bookingUrl = bookingUrl;
  }

  return { orgSlug, name: row.name.trim(), contact };
}

/**
 * Loads the profile of the organization named by the invocation's
 * ExecutionContext. Called once per invocation at the start of the graph.
 */
@Injectable()
export class CompanyProfileLoader {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async load(context: ExecutionContext): Promise<CompanyProfile> {
    const { data, error } = await this.db
      .from(null, 'organizations')
      .select('name, settings')
      .eq('slug', context.orgSlug)
      .maybeSingle();
    if (error) {
      throw new Error(
        `Failed to load organization '${context.orgSlug}' for customer service: ${error.message}`,
      );
    }
    return parseCompanyProfile(context.orgSlug, data);
  }
}
