import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the authenticated user from the request object.
 * The user is set by whichever auth guard runs (in-process or remote).
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): unknown => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: unknown }>();
    return request.user;
  },
);
