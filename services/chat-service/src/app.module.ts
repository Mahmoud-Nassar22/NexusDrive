import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule, createLoggerModule, HealthModule, MetricsModule } from '@nexusdrive/common';
import { ChatController } from './chat/chat.controller';
import { ChatGateway } from './chat/chat.gateway';
import { ChatStore } from './chat/chat.store';
import { validateEnv, type Env } from './config/env';
import { MeetingsController } from './meetings/meetings.controller';
import { MeetingsService } from './meetings/meetings.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    createLoggerModule('chat-service'),
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
  controllers: [ChatController, MeetingsController],
  providers: [ChatStore, ChatGateway, MeetingsService],
})
export class AppModule {}
