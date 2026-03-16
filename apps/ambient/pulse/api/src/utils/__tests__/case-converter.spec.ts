/**
 * Comprehensive Unit Tests for Case Converter Utility
 *
 * Tests all case conversion functions with various inputs including:
 * - Empty strings
 * - Single words
 * - Multi-word strings
 * - Special characters
 * - Edge cases
 */

import {
  snakeToCamel,
  camelToSnake,
  mapProviderFromDb,
  mapProviderToDb,
  mapModelFromDb,
  mapModelToDb,
  mapLLMModelFromDb,
  mapLLMProviderFromDb,
  mapCIDAFMCommandFromDb,
  mapCIDAFMCommandToDb,
  mapEnhancedMessageFromDb,
  mapEnhancedMessageToDb,
  mapUserUsageStatsFromDb,
  mapUserUsageStatsToDb,
} from '../case-converter';

describe('Case Converter Utility', () => {
  describe('snakeToCamel', () => {
    describe('primitive values', () => {
      it('should return null for null input', () => {
        expect(snakeToCamel(null)).toBeNull();
      });

      it('should return undefined for undefined input', () => {
        expect(snakeToCamel(undefined)).toBeUndefined();
      });

      it('should return primitive values unchanged', () => {
        expect(snakeToCamel(42)).toBe(42);
        expect(snakeToCamel('string')).toBe('string');
        expect(snakeToCamel(true)).toBe(true);
        expect(snakeToCamel(false)).toBe(false);
      });
    });

    describe('object key conversion', () => {
      it('should convert snake_case keys to camelCase', () => {
        const input = {
          first_name: 'John',
          last_name: 'Doe',
          email_address: 'john@example.com',
        };

        const result = snakeToCamel(input) as Record<string, unknown>;

        expect(result.firstName).toBe('John');
        expect(result.lastName).toBe('Doe');
        expect(result.emailAddress).toBe('john@example.com');
        expect(result.first_name).toBeUndefined();
      });

      it('should handle empty objects', () => {
        expect(snakeToCamel({})).toEqual({});
      });

      it('should handle single word keys (no conversion needed)', () => {
        const input = { name: 'John', age: 30 };
        const result = snakeToCamel(input);
        expect(result).toEqual({ name: 'John', age: 30 });
      });

      it('should handle keys with multiple underscores', () => {
        const input = {
          user_first_name: 'John',
          user_last_name: 'Doe',
          api_base_url: 'https://api.example.com',
        };

        const result = snakeToCamel(input) as Record<string, unknown>;

        expect(result.userFirstName).toBe('John');
        expect(result.userLastName).toBe('Doe');
        expect(result.apiBaseUrl).toBe('https://api.example.com');
      });

      it('should handle keys starting with underscore', () => {
        const input = {
          _private_field: 'value',
          __double_underscore: 'test',
        };

        const result = snakeToCamel(input) as Record<string, unknown>;

        // Regex replaces _[lowercase] with uppercase, so _p becomes P, __d becomes _D
        expect(result['PrivateField']).toBe('value');
        expect(result['_DoubleUnderscore']).toBe('test');
      });

      it('should handle keys ending with underscore', () => {
        const input = {
          field_name_: 'value',
          another_field__: 'test',
        };

        const result = snakeToCamel(input) as Record<string, unknown>;

        expect(result.fieldName_).toBe('value');
        expect(result.anotherField__).toBe('test');
      });

      it('should handle consecutive underscores', () => {
        const input = {
          field__name: 'value',
          multiple___underscores: 'test',
        };

        const result = snakeToCamel(input) as Record<string, unknown>;

        expect(result.field_Name).toBe('value');
        expect(result.multiple__Underscores).toBe('test');
      });
    });

    describe('nested objects', () => {
      it('should recursively convert nested objects', () => {
        const input = {
          user_info: {
            first_name: 'John',
            last_name: 'Doe',
            contact_details: {
              email_address: 'john@example.com',
              phone_number: '555-1234',
            },
          },
        };

        const result = snakeToCamel(input) as Record<string, any>;

        expect(result.userInfo.firstName).toBe('John');
        expect(result.userInfo.lastName).toBe('Doe');
        expect(result.userInfo.contactDetails.emailAddress).toBe(
          'john@example.com',
        );
        expect(result.userInfo.contactDetails.phoneNumber).toBe('555-1234');
      });

      it('should handle deeply nested structures', () => {
        const input = {
          level_one: {
            level_two: {
              level_three: {
                deep_value: 'found',
              },
            },
          },
        };

        const result = snakeToCamel(input) as Record<string, any>;

        expect(result.levelOne.levelTwo.levelThree.deepValue).toBe('found');
      });
    });

    describe('arrays', () => {
      it('should process arrays of objects', () => {
        const input = [
          { first_name: 'John', last_name: 'Doe' },
          { first_name: 'Jane', last_name: 'Smith' },
        ];

        const result = snakeToCamel(input) as Array<Record<string, unknown>>;

        expect(result[0]?.firstName).toBe('John');
        expect(result[0]?.lastName).toBe('Doe');
        expect(result[1]?.firstName).toBe('Jane');
        expect(result[1]?.lastName).toBe('Smith');
      });

      it('should handle arrays of primitive values', () => {
        const input = [1, 2, 3, 'test', true];
        const result = snakeToCamel(input);
        expect(result).toEqual([1, 2, 3, 'test', true]);
      });

      it('should handle empty arrays', () => {
        expect(snakeToCamel([])).toEqual([]);
      });

      it('should handle nested arrays', () => {
        const input = {
          items: [
            { item_name: 'Item 1', item_tags: ['tag_one', 'tag_two'] },
            { item_name: 'Item 2', item_tags: ['tag_three'] },
          ],
        };

        const result = snakeToCamel(input) as Record<string, any>;

        expect(result.items[0].itemName).toBe('Item 1');
        expect(result.items[0].itemTags).toEqual(['tag_one', 'tag_two']);
      });
    });

    describe('special cases', () => {
      it('should handle mixed camelCase and snake_case keys', () => {
        const input = {
          firstName: 'John',
          last_name: 'Doe',
          emailAddress: 'john@example.com',
          phone_number: '555-1234',
        };

        const result = snakeToCamel(input) as Record<string, unknown>;

        expect(result.firstName).toBe('John');
        expect(result.lastName).toBe('Doe');
        expect(result.emailAddress).toBe('john@example.com');
        expect(result.phoneNumber).toBe('555-1234');
      });

      it('should preserve uppercase letters in values', () => {
        const input = {
          api_key: 'APIKEY123',
          user_name: 'JohnDOE',
        };

        const result = snakeToCamel(input) as Record<string, unknown>;

        expect(result.apiKey).toBe('APIKEY123');
        expect(result.userName).toBe('JohnDOE');
      });

      it('should handle objects with null and undefined values', () => {
        const input = {
          first_name: 'John',
          middle_name: null,
          last_name: undefined,
        };

        const result = snakeToCamel(input) as Record<string, unknown>;

        expect(result.firstName).toBe('John');
        expect(result.middleName).toBeNull();
        expect(result.lastName).toBeUndefined();
      });
    });
  });

  describe('camelToSnake', () => {
    describe('primitive values', () => {
      it('should return null for null input', () => {
        expect(camelToSnake(null)).toBeNull();
      });

      it('should return undefined for undefined input', () => {
        expect(camelToSnake(undefined)).toBeUndefined();
      });

      it('should return primitive values unchanged', () => {
        expect(camelToSnake(42)).toBe(42);
        expect(camelToSnake('string')).toBe('string');
        expect(camelToSnake(true)).toBe(true);
        expect(camelToSnake(false)).toBe(false);
      });
    });

    describe('object key conversion', () => {
      it('should convert camelCase keys to snake_case', () => {
        const input = {
          firstName: 'John',
          lastName: 'Doe',
          emailAddress: 'john@example.com',
        };

        const result = camelToSnake(input) as Record<string, unknown>;

        expect(result.first_name).toBe('John');
        expect(result.last_name).toBe('Doe');
        expect(result.email_address).toBe('john@example.com');
        expect(result.firstName).toBeUndefined();
      });

      it('should handle empty objects', () => {
        expect(camelToSnake({})).toEqual({});
      });

      it('should handle single word keys (no conversion needed)', () => {
        const input = { name: 'John', age: 30 };
        const result = camelToSnake(input);
        expect(result).toEqual({ name: 'John', age: 30 });
      });

      it('should handle keys with multiple capital letters', () => {
        const input = {
          userFirstName: 'John',
          userLastName: 'Doe',
          apiBaseURL: 'https://api.example.com',
        };

        const result = camelToSnake(input) as Record<string, unknown>;

        expect(result.user_first_name).toBe('John');
        expect(result.user_last_name).toBe('Doe');
        expect(result.api_base_u_r_l).toBe('https://api.example.com');
      });

      it('should handle PascalCase keys', () => {
        const input = {
          FirstName: 'John',
          LastName: 'Doe',
          EmailAddress: 'john@example.com',
        };

        const result = camelToSnake(input) as Record<string, unknown>;

        expect(result._first_name).toBe('John');
        expect(result._last_name).toBe('Doe');
        expect(result._email_address).toBe('john@example.com');
      });

      it('should handle consecutive capitals', () => {
        const input = {
          HTTPSConnection: 'secure',
          APIKey: 'key123',
        };

        const result = camelToSnake(input) as Record<string, unknown>;

        expect(result._h_t_t_p_s_connection).toBe('secure');
        expect(result._a_p_i_key).toBe('key123');
      });
    });

    describe('nested objects', () => {
      it('should recursively convert nested objects', () => {
        const input = {
          userInfo: {
            firstName: 'John',
            lastName: 'Doe',
            contactDetails: {
              emailAddress: 'john@example.com',
              phoneNumber: '555-1234',
            },
          },
        };

        const result = camelToSnake(input) as Record<string, any>;

        expect(result.user_info.first_name).toBe('John');
        expect(result.user_info.last_name).toBe('Doe');
        expect(result.user_info.contact_details.email_address).toBe(
          'john@example.com',
        );
        expect(result.user_info.contact_details.phone_number).toBe('555-1234');
      });

      it('should handle deeply nested structures', () => {
        const input = {
          levelOne: {
            levelTwo: {
              levelThree: {
                deepValue: 'found',
              },
            },
          },
        };

        const result = camelToSnake(input) as Record<string, any>;

        expect(result.level_one.level_two.level_three.deep_value).toBe('found');
      });
    });

    describe('arrays', () => {
      it('should process arrays of objects', () => {
        const input = [
          { firstName: 'John', lastName: 'Doe' },
          { firstName: 'Jane', lastName: 'Smith' },
        ];

        const result = camelToSnake(input) as Array<Record<string, unknown>>;

        expect(result[0]?.first_name).toBe('John');
        expect(result[0]?.last_name).toBe('Doe');
        expect(result[1]?.first_name).toBe('Jane');
        expect(result[1]?.last_name).toBe('Smith');
      });

      it('should handle arrays of primitive values', () => {
        const input = [1, 2, 3, 'test', true];
        const result = camelToSnake(input);
        expect(result).toEqual([1, 2, 3, 'test', true]);
      });

      it('should handle empty arrays', () => {
        expect(camelToSnake([])).toEqual([]);
      });
    });

    describe('special cases', () => {
      it('should preserve uppercase letters in values', () => {
        const input = {
          apiKey: 'APIKEY123',
          userName: 'JohnDOE',
        };

        const result = camelToSnake(input) as Record<string, unknown>;

        expect(result.api_key).toBe('APIKEY123');
        expect(result.user_name).toBe('JohnDOE');
      });

      it('should handle objects with null and undefined values', () => {
        const input = {
          firstName: 'John',
          middleName: null,
          lastName: undefined,
        };

        const result = camelToSnake(input) as Record<string, unknown>;

        expect(result.first_name).toBe('John');
        expect(result.middle_name).toBeNull();
        expect(result.last_name).toBeUndefined();
      });
    });
  });

  describe('round-trip conversions', () => {
    it('should maintain data integrity in snake->camel->snake conversion', () => {
      const original = {
        user_id: '123',
        first_name: 'John',
        last_name: 'Doe',
        email_address: 'john@example.com',
        created_at: '2023-01-01',
      };

      const camelCase = snakeToCamel(original);
      const backToSnake = camelToSnake(camelCase);

      expect(backToSnake).toEqual(original);
    });

    it('should maintain data integrity in camel->snake->camel conversion', () => {
      const original = {
        userId: '123',
        firstName: 'John',
        lastName: 'Doe',
        emailAddress: 'john@example.com',
        createdAt: '2023-01-01',
      };

      const snakeCase = camelToSnake(original);
      const backToCamel = snakeToCamel(snakeCase);

      expect(backToCamel).toEqual(original);
    });
  });

  describe('Provider Mappers', () => {
    describe('mapProviderFromDb', () => {
      it('should map database provider to Provider type', () => {
        const dbProvider = {
          id: '123',
          name: 'OpenAI',
          api_base_url: 'https://api.openai.com',
          auth_type: 'api_key',
          status: 'active',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapProviderFromDb(dbProvider);

        expect(result.id).toBe('123');
        expect(result.name).toBe('OpenAI');
        expect(result.apiBaseUrl).toBe('https://api.openai.com');
        expect(result.authType).toBe('api_key');
        expect(result.status).toBe('active');
        expect(result.createdAt).toBe('2023-01-01T00:00:00Z');
        expect(result.updatedAt).toBe('2023-01-02T00:00:00Z');
      });

      it('should handle undefined optional fields', () => {
        const dbProvider = {
          id: '123',
          name: 'Local Provider',
          auth_type: 'none',
          status: 'active',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapProviderFromDb(dbProvider);

        expect(result.apiBaseUrl).toBeUndefined();
      });
    });

    describe('mapProviderToDb', () => {
      it('should map Provider to database format', () => {
        const provider = {
          id: '123',
          name: 'OpenAI',
          apiBaseUrl: 'https://api.openai.com',
          authType: 'api_key' as const,
          status: 'active' as const,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-02T00:00:00Z',
        };

        const result = mapProviderToDb(provider);

        expect(result.id).toBe('123');
        expect(result.name).toBe('OpenAI');
        expect(result.api_base_url).toBe('https://api.openai.com');
        expect(result.auth_type).toBe('api_key');
        expect(result.status).toBe('active');
        expect(result.created_at).toBe('2023-01-01T00:00:00Z');
        expect(result.updated_at).toBe('2023-01-02T00:00:00Z');
      });

      it('should handle partial Provider objects', () => {
        const provider = {
          name: 'OpenAI',
          authType: 'api_key' as const,
        };

        const result = mapProviderToDb(provider);

        expect(result.name).toBe('OpenAI');
        expect(result.auth_type).toBe('api_key');
        expect(result.id).toBeUndefined();
      });
    });

    describe('mapLLMProviderFromDb', () => {
      it('should map llm_providers table to Provider type', () => {
        const dbProvider = {
          id: '123',
          provider_name: 'OpenAI',
          base_url: 'https://api.openai.com',
          auth_type: 'api_key',
          is_active: true,
          is_local: false,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapLLMProviderFromDb(dbProvider);

        expect(result.id).toBe('123');
        expect(result.name).toBe('OpenAI');
        expect(result.apiBaseUrl).toBe('https://api.openai.com');
        expect(result.authType).toBe('api_key');
        expect(result.status).toBe('active');
        expect(result.isLocal).toBe(false);
        expect(result.createdAt).toBe('2023-01-01T00:00:00Z');
        expect(result.updatedAt).toBe('2023-01-02T00:00:00Z');
      });

      it('should handle inactive providers', () => {
        const dbProvider = {
          id: '123',
          provider_name: 'Legacy Provider',
          is_active: false,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapLLMProviderFromDb(dbProvider);

        expect(result.status).toBe('inactive');
        expect(result.authType).toBe('api_key'); // default
      });

      it('should prioritize provider_name over name and display_name', () => {
        const dbProvider = {
          id: '123',
          provider_name: 'ProviderName',
          name: 'Name',
          display_name: 'DisplayName',
          is_active: true,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapLLMProviderFromDb(dbProvider);

        expect(result.name).toBe('ProviderName');
      });

      it('should fallback to name if provider_name is missing', () => {
        const dbProvider = {
          id: '123',
          name: 'Name',
          display_name: 'DisplayName',
          is_active: true,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapLLMProviderFromDb(dbProvider);

        expect(result.name).toBe('Name');
      });
    });
  });

  describe('Model Mappers', () => {
    describe('mapModelFromDb', () => {
      it('should map database model to Model type', () => {
        const dbModel = {
          model_name: 'gpt-4',
          provider_name: 'openai',
          pricing_input_per_1k: 0.03,
          pricing_output_per_1k: 0.06,
          supports_thinking: true,
          max_tokens: 8192,
          context_window: 8192,
          strengths: ['reasoning', 'code'],
          weaknesses: ['cost'],
          use_cases: ['analysis', 'development'],
          status: 'active',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapModelFromDb(dbModel);

        expect(result.name).toBe('gpt-4');
        expect(result.providerName).toBe('openai');
        expect(result.pricingInputPer1k).toBe(0.03);
        expect(result.pricingOutputPer1k).toBe(0.06);
        expect(result.supportsThinking).toBe(true);
        expect(result.maxTokens).toBe(8192);
        expect(result.contextWindow).toBe(8192);
        expect(result.strengths).toEqual(['reasoning', 'code']);
        expect(result.weaknesses).toEqual(['cost']);
        expect(result.useCases).toEqual(['analysis', 'development']);
        expect(result.status).toBe('active');
      });

      it('should include provider if present', () => {
        const dbModel = {
          model_name: 'gpt-4',
          provider_name: 'openai',
          pricing_input_per_1k: 0.03,
          pricing_output_per_1k: 0.06,
          supports_thinking: false,
          max_tokens: 8192,
          context_window: 8192,
          strengths: [],
          weaknesses: [],
          use_cases: [],
          status: 'active',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          provider: {
            id: '123',
            name: 'OpenAI',
            auth_type: 'api_key',
            status: 'active',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
          },
        };

        const result = mapModelFromDb(dbModel);

        expect(result.provider).toBeDefined();
        expect(result.provider?.id).toBe('123');
        expect(result.provider?.name).toBe('OpenAI');
      });
    });

    describe('mapModelToDb', () => {
      it('should map Model to database format', () => {
        const model = {
          name: 'gpt-4',
          providerName: 'openai',
          pricingInputPer1k: 0.03,
          pricingOutputPer1k: 0.06,
          supportsThinking: true,
          maxTokens: 8192,
          contextWindow: 8192,
          strengths: ['reasoning', 'code'],
          weaknesses: ['cost'],
          useCases: ['analysis', 'development'],
          status: 'active' as const,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-02T00:00:00Z',
        };

        const result = mapModelToDb(model);

        expect(result.model_name).toBe('gpt-4');
        expect(result.provider_name).toBe('openai');
        expect(result.pricing_input_per_1k).toBe(0.03);
        expect(result.pricing_output_per_1k).toBe(0.06);
        expect(result.supports_thinking).toBe(true);
        expect(result.max_tokens).toBe(8192);
        expect(result.context_window).toBe(8192);
        expect(result.strengths).toEqual(['reasoning', 'code']);
        expect(result.weaknesses).toEqual(['cost']);
        expect(result.use_cases).toEqual(['analysis', 'development']);
        expect(result.status).toBe('active');
      });
    });

    describe('mapLLMModelFromDb', () => {
      it('should map llm_models table to ModelResponseDto', () => {
        const dbModel = {
          provider_name: 'openai',
          model_name: 'gpt-4',
          display_name: 'GPT-4',
          pricing_info_json: {
            input_cost_per_token: 0.00003,
            output_cost_per_token: 0.00006,
          },
          capabilities: ['reasoning', 'code'],
          max_output_tokens: 4096,
          context_window: 8192,
          is_active: true,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapLLMModelFromDb(dbModel);

        expect(result.providerName).toBe('openai');
        expect(result.modelName).toBe('gpt-4');
        expect(result.name).toBe('GPT-4');
        expect(result.pricingInputPer1k).toBeCloseTo(0.03, 5);
        expect(result.pricingOutputPer1k).toBeCloseTo(0.06, 5);
        expect(result.supportsThinking).toBe(true);
        expect(result.maxTokens).toBe(4096);
        expect(result.contextWindow).toBe(8192);
        expect(result.status).toBe('active');
      });

      it('should use model_name as fallback for display_name', () => {
        const dbModel = {
          provider_name: 'openai',
          model_name: 'gpt-4',
          pricing_info_json: {},
          max_output_tokens: 4096,
          context_window: 8192,
          is_active: true,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapLLMModelFromDb(dbModel);

        expect(result.name).toBe('gpt-4');
      });

      it('should handle missing pricing info', () => {
        const dbModel = {
          provider_name: 'openai',
          model_name: 'gpt-4',
          pricing_info_json: {},
          max_output_tokens: 4096,
          context_window: 8192,
          is_active: true,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapLLMModelFromDb(dbModel);

        expect(result.pricingInputPer1k).toBe(0);
        expect(result.pricingOutputPer1k).toBe(0);
      });

      it('should correctly identify reasoning capability', () => {
        const dbModel = {
          provider_name: 'openai',
          model_name: 'gpt-4',
          pricing_info_json: {},
          capabilities: ['reasoning', 'code'],
          max_output_tokens: 4096,
          context_window: 8192,
          is_active: true,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapLLMModelFromDb(dbModel);

        expect(result.supportsThinking).toBe(true);
      });

      it('should handle inactive models', () => {
        const dbModel = {
          provider_name: 'openai',
          model_name: 'gpt-3',
          pricing_info_json: {},
          max_output_tokens: 2048,
          context_window: 4096,
          is_active: false,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapLLMModelFromDb(dbModel);

        expect(result.status).toBe('inactive');
      });

      it('should include provider if present', () => {
        const dbModel = {
          provider_name: 'openai',
          model_name: 'gpt-4',
          pricing_info_json: {},
          max_output_tokens: 4096,
          context_window: 8192,
          is_active: true,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          provider: {
            id: '123',
            provider_name: 'OpenAI',
            is_active: true,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
          },
        };

        const result = mapLLMModelFromDb(dbModel);

        expect(result.provider).toBeDefined();
        expect(result.provider?.name).toBe('OpenAI');
      });
    });
  });

  describe('CIDAFM Command Mappers', () => {
    describe('mapCIDAFMCommandFromDb', () => {
      it('should map database command to CIDAFMCommand type', () => {
        const dbCommand = {
          id: '123',
          type: '^',
          name: 'Test Command',
          description: 'A test command',
          default_active: true,
          is_builtin: true,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapCIDAFMCommandFromDb(dbCommand);

        expect(result.id).toBe('123');
        expect(result.type).toBe('^');
        expect(result.name).toBe('Test Command');
        expect(result.description).toBe('A test command');
        expect(result.defaultActive).toBe(true);
        expect(result.isBuiltin).toBe(true);
        expect(result.createdAt).toBe('2023-01-01T00:00:00Z');
        expect(result.updatedAt).toBe('2023-01-02T00:00:00Z');
      });

      it('should handle all command types', () => {
        const types: Array<'^' | '&' | '!'> = ['^', '&', '!'];

        types.forEach((type) => {
          const dbCommand = {
            id: '123',
            type,
            name: `Command ${type}`,
            description: 'Description',
            default_active: false,
            is_builtin: false,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
          };

          const result = mapCIDAFMCommandFromDb(dbCommand);
          expect(result.type).toBe(type);
        });
      });
    });

    describe('mapCIDAFMCommandToDb', () => {
      it('should map CIDAFMCommand to database format', () => {
        const command = {
          id: '123',
          type: '^' as const,
          name: 'Test Command',
          description: 'A test command',
          defaultActive: true,
          isBuiltin: true,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-02T00:00:00Z',
        };

        const result = mapCIDAFMCommandToDb(command);

        expect(result.id).toBe('123');
        expect(result.type).toBe('^');
        expect(result.name).toBe('Test Command');
        expect(result.description).toBe('A test command');
        expect(result.default_active).toBe(true);
        expect(result.is_builtin).toBe(true);
        expect(result.created_at).toBe('2023-01-01T00:00:00Z');
        expect(result.updated_at).toBe('2023-01-02T00:00:00Z');
      });

      it('should handle partial command objects', () => {
        const command = {
          name: 'Test Command',
          type: '&' as const,
        };

        const result = mapCIDAFMCommandToDb(command);

        expect(result.name).toBe('Test Command');
        expect(result.type).toBe('&');
        expect(result.id).toBeUndefined();
      });
    });
  });

  describe('Enhanced Message Mappers', () => {
    describe('mapEnhancedMessageFromDb', () => {
      it('should map database message to EnhancedMessage type', () => {
        const dbMessage = {
          id: '123',
          session_id: 'session-123',
          user_id: 'user-123',
          role: 'user',
          content: 'Hello world',
          timestamp: '2023-01-01T00:00:00Z',
          order: 1,
          metadata: { key: 'value' },
          provider_name: 'openai',
          model_name: 'gpt-4',
          input_tokens: 10,
          output_tokens: 20,
          total_cost: 0.001,
          response_time_ms: 500,
          langsmith_run_id: 'run-123',
          user_rating: 5,
          speed_rating: 4,
          accuracy_rating: 5,
          user_notes: 'Great response',
          evaluation_timestamp: '2023-01-01T00:01:00Z',
          cidafm_options: { activeStateModifiers: ['modifier1'] },
          evaluation_details: { tags: ['tag1'] },
        };

        const result = mapEnhancedMessageFromDb(dbMessage);

        expect(result.id).toBe('123');
        expect(result.sessionId).toBe('session-123');
        expect(result.userId).toBe('user-123');
        expect(result.role).toBe('user');
        expect(result.content).toBe('Hello world');
        expect(result.timestamp).toBe('2023-01-01T00:00:00Z');
        expect(result.order).toBe(1);
        expect(result.metadata).toEqual({ key: 'value' });
        expect(result.providerName).toBe('openai');
        expect(result.modelName).toBe('gpt-4');
        expect(result.inputTokens).toBe(10);
        expect(result.outputTokens).toBe(20);
        expect(result.totalCost).toBe(0.001);
        expect(result.responseTimeMs).toBe(500);
        expect(result.langsmithRunId).toBe('run-123');
        expect(result.userRating).toBe(5);
        expect(result.speedRating).toBe(4);
        expect(result.accuracyRating).toBe(5);
        expect(result.userNotes).toBe('Great response');
        expect(result.evaluationTimestamp).toBe('2023-01-01T00:01:00Z');
        expect(result.cidafmOptions).toEqual({
          activeStateModifiers: ['modifier1'],
        });
        expect(result.evaluationDetails).toEqual({ tags: ['tag1'] });
      });

      it('should handle optional fields being undefined', () => {
        const dbMessage = {
          id: '123',
          session_id: 'session-123',
          user_id: 'user-123',
          role: 'assistant',
          content: 'Response',
          timestamp: '2023-01-01T00:00:00Z',
          order: 1,
        };

        const result = mapEnhancedMessageFromDb(dbMessage);

        expect(result.id).toBe('123');
        expect(result.metadata).toBeUndefined();
        expect(result.providerName).toBeUndefined();
        expect(result.userRating).toBeUndefined();
      });

      it('should include provider and model if present', () => {
        const dbMessage = {
          id: '123',
          session_id: 'session-123',
          user_id: 'user-123',
          role: 'assistant',
          content: 'Response',
          timestamp: '2023-01-01T00:00:00Z',
          order: 1,
          provider: {
            id: '456',
            name: 'OpenAI',
            auth_type: 'api_key',
            status: 'active',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
          model: {
            model_name: 'gpt-4',
            provider_name: 'openai',
            pricing_input_per_1k: 0.03,
            pricing_output_per_1k: 0.06,
            supports_thinking: true,
            max_tokens: 8192,
            context_window: 8192,
            strengths: [],
            weaknesses: [],
            use_cases: [],
            status: 'active',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        };

        const result = mapEnhancedMessageFromDb(dbMessage);

        expect(result.provider).toBeDefined();
        expect(result.provider?.name).toBe('OpenAI');
        expect(result.model).toBeDefined();
        expect(result.model?.name).toBe('gpt-4');
      });
    });

    describe('mapEnhancedMessageToDb', () => {
      it('should map EnhancedMessage to database format', () => {
        const message = {
          id: '123',
          sessionId: 'session-123',
          userId: 'user-123',
          role: 'user' as const,
          content: 'Hello world',
          timestamp: '2023-01-01T00:00:00Z',
          order: 1,
          metadata: { key: 'value' },
          providerName: 'openai',
          modelName: 'gpt-4',
          inputTokens: 10,
          outputTokens: 20,
          totalCost: 0.001,
          responseTimeMs: 500,
          langsmithRunId: 'run-123',
          userRating: 5 as const,
          speedRating: 4 as const,
          accuracyRating: 5 as const,
          userNotes: 'Great response',
          evaluationTimestamp: '2023-01-01T00:01:00Z',
          cidafmOptions: { activeStateModifiers: ['modifier1'] },
          evaluationDetails: { tags: ['tag1'] },
        };

        const result = mapEnhancedMessageToDb(message);

        expect(result.id).toBe('123');
        expect(result.sessionId).toBe('session-123');
        expect(result.user_id).toBe('user-123');
        expect(result.role).toBe('user');
        expect(result.content).toBe('Hello world');
        expect(result.timestamp).toBe('2023-01-01T00:00:00Z');
        expect(result.order).toBe(1);
        expect(result.metadata).toEqual({ key: 'value' });
        expect(result.provider_name).toBe('openai');
        expect(result.model_name).toBe('gpt-4');
        expect(result.inputTokens).toBe(10);
        expect(result.outputTokens).toBe(20);
        expect(result.totalCost).toBe(0.001);
        expect(result.responseTimeMs).toBe(500);
        expect(result.langsmith_run_id).toBe('run-123');
        expect(result.userRating).toBe(5);
        expect(result.speedRating).toBe(4);
        expect(result.accuracyRating).toBe(5);
        expect(result.userNotes).toBe('Great response');
        expect(result.evaluationTimestamp).toBe('2023-01-01T00:01:00Z');
        expect(result.cidafmOptions).toEqual({
          activeStateModifiers: ['modifier1'],
        });
        expect(result.evaluationDetails).toEqual({ tags: ['tag1'] });
      });
    });
  });

  describe('User Usage Stats Mappers', () => {
    describe('mapUserUsageStatsFromDb', () => {
      it('should map database stats to UserUsageStats type', () => {
        const dbStats = {
          id: '123',
          user_id: 'user-123',
          date: '2023-01-01',
          provider_name: 'openai',
          model_name: 'gpt-4',
          total_requests: 100,
          total_tokens: 50000,
          total_cost: 1.5,
          avg_response_time_ms: 500,
          avg_user_rating: 4.5,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
        };

        const result = mapUserUsageStatsFromDb(dbStats);

        expect(result.id).toBe('123');
        expect(result.userId).toBe('user-123');
        expect(result.date).toBe('2023-01-01');
        expect(result.providerName).toBe('openai');
        expect(result.modelName).toBe('gpt-4');
        expect(result.totalRequests).toBe(100);
        expect(result.totalTokens).toBe(50000);
        expect(result.totalCost).toBe(1.5);
        expect(result.avgResponseTimeMs).toBe(500);
        expect(result.avgUserRating).toBe(4.5);
        expect(result.createdAt).toBe('2023-01-01T00:00:00Z');
        expect(result.updatedAt).toBe('2023-01-02T00:00:00Z');
      });

      it('should include provider and model if present', () => {
        const dbStats = {
          id: '123',
          user_id: 'user-123',
          date: '2023-01-01',
          provider_name: 'openai',
          model_name: 'gpt-4',
          total_requests: 100,
          total_tokens: 50000,
          total_cost: 1.5,
          avg_response_time_ms: 500,
          avg_user_rating: 4.5,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          provider: {
            id: '456',
            name: 'OpenAI',
            auth_type: 'api_key',
            status: 'active',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
          model: {
            model_name: 'gpt-4',
            provider_name: 'openai',
            pricing_input_per_1k: 0.03,
            pricing_output_per_1k: 0.06,
            supports_thinking: true,
            max_tokens: 8192,
            context_window: 8192,
            strengths: [],
            weaknesses: [],
            use_cases: [],
            status: 'active',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        };

        const result = mapUserUsageStatsFromDb(dbStats);

        expect(result.provider).toBeDefined();
        expect(result.provider?.name).toBe('OpenAI');
        expect(result.model).toBeDefined();
        expect(result.model?.name).toBe('gpt-4');
      });
    });

    describe('mapUserUsageStatsToDb', () => {
      it('should map UserUsageStats to database format', () => {
        const stats = {
          id: '123',
          userId: 'user-123',
          date: '2023-01-01',
          providerName: 'openai',
          modelName: 'gpt-4',
          totalRequests: 100,
          totalTokens: 50000,
          totalCost: 1.5,
          avgResponseTimeMs: 500,
          avgUserRating: 4.5,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-02T00:00:00Z',
        };

        const result = mapUserUsageStatsToDb(stats);

        expect(result.id).toBe('123');
        expect(result.user_id).toBe('user-123');
        expect(result.date).toBe('2023-01-01');
        expect(result.provider_name).toBe('openai');
        expect(result.model_name).toBe('gpt-4');
        expect(result.totalRequests).toBe(100);
        expect(result.totalTokens).toBe(50000);
        expect(result.totalCost).toBe(1.5);
        expect(result.avg_responseTimeMs).toBe(500);
        expect(result.avg_userRating).toBe(4.5);
        expect(result.created_at).toBe('2023-01-01T00:00:00Z');
        expect(result.updated_at).toBe('2023-01-02T00:00:00Z');
      });
    });
  });
});
