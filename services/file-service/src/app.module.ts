import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule, createLoggerModule, HealthModule, MetricsModule } from '@nexusdrive/common';
import { validateEnv, type Env } from './config/env';
import { FilesController } from './files/files.controller';
import { FilesService } from './files/files.service';
import { StorageService } from './storage/storage.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    createLoggerModule('file-service'),
    AuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        issuerUrl: config.get('KEYCLOAK_ISSUER_URL', { infer: true }),
        audience: config.get('KEYCLOAK_AUDIENCE', { infer: true }),
      }),
    }),
    HealthModule,
    MetricsModule,
  ],
  controllers: [FilesController],
  providers: [FilesService, StorageService],
})
export class AppModule {}
