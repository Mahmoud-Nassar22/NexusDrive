import { IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUploadUrlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  /** Declared size in bytes, checked against MAX_UPLOAD_BYTES. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  size?: number;
}
