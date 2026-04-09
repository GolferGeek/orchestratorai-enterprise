import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * RemoteRbacGuard is a defensive pass-through in the remote-authorization model.
 *
 * The real permission check already happened in RemoteJwtAuthGuard via
 * POST /auth/authorize (Auth API). This guard exists for:
 *   (a) Semantic clarity at controller source — @UseGuards(RemoteJwtAuthGuard, RemoteRbacGuard)
 *       reads as "authenticated AND authorized"
 *   (b) Forward-compat seam for a future split where one endpoint wants
 *       authentication without permission enforcement
 *   (c) It lets @RequirePermission() sit at the same scope as @UseGuards()
 *
 * See PRD §4.1 for the full rationale.
 */
@Injectable()
export class RemoteRbacGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (!request.user) {
      // RemoteJwtAuthGuard should have populated this. If not, fail loud.
      throw new UnauthorizedException(
        'Request is missing authenticated principal',
      );
    }
    return true;
  }
}
