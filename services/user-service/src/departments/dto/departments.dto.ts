import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { DEPARTMENT_ROLES, type DepartmentRole } from '../departments.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class DepartmentNameDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

export class SetMemberDto {
  @IsIn(DEPARTMENT_ROLES)
  role!: DepartmentRole;

  /** For workers: the team leader they report to. null or omitted: none. */
  @IsOptional()
  @IsUUID('all')
  leadId?: string | null;
}
