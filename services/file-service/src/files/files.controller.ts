import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BearerToken, CurrentUser, JwtAuthGuard, type AuthUser } from '@nexusdrive/common';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { FilesService } from './files.service';

/** Mounted under /api/files (global prefix). Every route requires a Keycloak token. */
@Controller()
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** GET /api/files: own files plus those of people the caller may see */
  @Get()
  list(@CurrentUser() user: AuthUser, @BearerToken() token: string) {
    return this.files.list(user, token);
  }

  /** POST /api/files/upload-url  -> browser then PUTs the file to the returned URL */
  @Post('upload-url')
  createUploadUrl(@CurrentUser() user: AuthUser, @Body() dto: CreateUploadUrlDto) {
    return this.files.createUploadUrl(user, dto);
  }

  /** GET /api/files/:name/download-url?owner=<sub>  (owner defaults to the caller) */
  @Get(':name/download-url')
  createDownloadUrl(
    @CurrentUser() user: AuthUser,
    @BearerToken() token: string,
    @Param('name') name: string,
    @Query('owner') owner?: string,
  ) {
    return this.files.createDownloadUrl(user, token, name, owner);
  }

  /** DELETE /api/files/:name  (own files only) */
  @Delete(':name')
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthUser, @Param('name') name: string) {
    await this.files.delete(user, name);
  }
}
