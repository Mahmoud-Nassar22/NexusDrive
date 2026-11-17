import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles } from '@nexusdrive/common';
import { ADMIN_ROLE } from '../users/users.service';
import { DepartmentsService } from './departments.service';
import { DepartmentNameDto, SetMemberDto } from './dto/departments.dto';

/** /api/users/departments: managing the company structure is for admins only. */
@Controller('departments')
@UseGuards(JwtAuthGuard)
@Roles(ADMIN_ROLE)
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  async list() {
    return { departments: await this.departments.list() };
  }

  @Post()
  create(@Body() dto: DepartmentNameDto) {
    return this.departments.create(dto.name);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.departments.get(id);
  }

  @Patch(':id')
  rename(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DepartmentNameDto) {
    return this.departments.rename(id, dto.name);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.departments.remove(id);
  }

  /** Add a user to the department, or change their role / team leader. */
  @Put(':id/members/:userId')
  setMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetMemberDto,
  ) {
    return this.departments.setMember(id, userId, dto.role, dto.leadId);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.departments.removeMember(id, userId);
  }
}
