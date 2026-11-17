import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser } from './auth.types';

export const ROLES_KEY = 'nexusdrive:roles';

/** Restrict a route to users having at least one of the given realm roles. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Injects the caller's raw access token, for calling another NexusDrive service
 * on the caller's behalf (the other service checks it again).
 */
export const BearerToken = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const header: string = ctx.switchToHttp().getRequest().headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
});

/** Injects the authenticated user (set by JwtAuthGuard) into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
