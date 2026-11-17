import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule, createLoggerModule, HealthModule, MetricsModule } from '@nexusdrive/common';
import { validateEnv, type Env } from './config/env';
import { KeycloakAdminClient } from './keycloak/keycloak-admin.client';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    createLoggerModule('user-service'),
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
  controllers: [UsersController],
  providers: [KeycloakAdminClient, UsersService],
})
export class AppModule {}
