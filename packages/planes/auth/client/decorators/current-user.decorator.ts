import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the authenticated user from the request object.
 * The user is set by whichever auth guard runs (in-process or remote).
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): any => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: any }>();
    return request.user;
  },
);
