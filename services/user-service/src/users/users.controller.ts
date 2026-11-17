import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, Roles, type AuthUser } from '@nexusdrive/common';
import { DepartmentsService } from '../departments/departments.service';
import { ListUsersQuery, SetAdminDto, SetEnabledDto } from './dto/users.dto';
import { ADMIN_ROLE, UsersService } from './users.service';

/** Mounted under /api/users (global prefix). Every route requires a Keycloak token. */
@Controller()
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly departments: DepartmentsService,
  ) {}

  /** GET /api/users/me: the caller (from their token) and their department, if any. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return { ...user, department: await this.departments.membership(user.sub) };
  }

  /**
   * GET /api/users/me/visibility: whose files the caller may see. Called by
   * file-service with the caller's token.
   */
  @Get('me/visibility')
  visibility(@CurrentUser() user: AuthUser) {
    return this.departments.visibility(user);
  }

  /** GET /api/users?search=: admins only */
  @Get()
  @Roles(ADMIN_ROLE)
  async list(@Query() query: ListUsersQuery) {
    return { users: await this.users.list(query.search) };
  }

  /** GET /api/users/:id: admins only */
  @Get(':id')
  @Roles(ADMIN_ROLE)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  /** PUT /api/users/:id/admin { admin: boolean }: grant or revoke the admin role */
  @Put(':id/admin')
  @Roles(ADMIN_ROLE)
  setAdmin(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAdminDto,
  ) {
    return this.users.setAdmin(actor, id, dto.admin);
  }

  /** PUT /api/users/:id/enabled { enabled: boolean }: enable or disable an account */
  @Put(':id/enabled')
  @Roles(ADMIN_ROLE)
  setEnabled(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetEnabledDto,
  ) {
    return this.users.setEnabled(actor, id, dto.enabled);
  }
}
