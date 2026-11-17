import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule, createLoggerModule, HealthModule, MetricsModule } from '@nexusdrive/common';
import { validateEnv, type Env } from './config/env';
import { Database } from './database/database.service';
import { DepartmentsController } from './departments/departments.controller';
import { DepartmentsService } from './departments/departments.service';
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
        internalUrl: config.get('KEYCLOAK_INTERNAL_URL', { infer: true }),
      }),
    }),
    HealthModule,
    MetricsModule,
  ],
  // DepartmentsController first: /departments must match before UsersController's /:id.
  controllers: [DepartmentsController, UsersController],
  providers: [Database, KeycloakAdminClient, DepartmentsService, UsersService],
})
export class AppModule {}
