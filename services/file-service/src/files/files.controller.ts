import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '@nexusdrive/common';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { FilesService } from './files.service';

/** Mounted under /api/files (global prefix). Every route requires a Keycloak token. */
@Controller()
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** GET /api/files */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { files: await this.files.list(user) };
  }

  /** POST /api/files/upload-url  -> browser then PUTs the file to the returned URL */
  @Post('upload-url')
  createUploadUrl(@CurrentUser() user: AuthUser, @Body() dto: CreateUploadUrlDto) {
    return this.files.createUploadUrl(user, dto);
  }

  /** GET /api/files/:name/download-url */
  @Get(':name/download-url')
  createDownloadUrl(@CurrentUser() user: AuthUser, @Param('name') name: string) {
    return this.files.createDownloadUrl(user, name);
  }

  /** DELETE /api/files/:name */
  @Delete(':name')
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthUser, @Param('name') name: string) {
    await this.files.delete(user, name);
  }
}
