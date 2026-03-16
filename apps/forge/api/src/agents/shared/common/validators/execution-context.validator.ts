import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { isExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Custom validator decorator that uses isExecutionContext from transport-types
 */
export function IsValidExecutionContext(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidExecutionContext',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message:
          'context must be a valid ExecutionContext with all required fields (orgSlug, userId, conversationId, taskId, planId, deliverableId, agentSlug, agentType, provider, model)',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown, _args: ValidationArguments) {
          return isExecutionContext(value);
        },
      },
    });
  };
}
