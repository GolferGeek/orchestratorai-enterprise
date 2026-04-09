import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

export const RequirePermission = (
  permission: string,
): CustomDecorator<string> => SetMetadata(PERMISSION_KEY, permission);
