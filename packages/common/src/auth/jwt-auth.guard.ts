import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from './auth.types';
import { ROLES_KEY } from './decorators';
import { TokenVerifier } from './token-verifier.service';

export type AuthenticatedRequest = Request & { user?: AuthUser };

/**
 * Requires a valid Keycloak Bearer token. If the handler or controller is
 * annotated with @Roles(...), the user must also have at least one of them.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly verifier: TokenVerifier,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }

    try {
      req.user = await this.verifier.verify(header.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }

    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length && !required.some((role) => req.user!.roles.includes(role))) {
      throw new ForbiddenException('insufficient role');
    }
    return true;
  }
}
