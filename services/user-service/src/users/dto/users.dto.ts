import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListUsersQuery {
  /** Matches username, email, first or last name. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class SetAdminDto {
  @IsBoolean()
  admin!: boolean;
}

export class SetEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}
