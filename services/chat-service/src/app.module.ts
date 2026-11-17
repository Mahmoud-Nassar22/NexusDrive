import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  AuthModule,
  createLoggerModule,
  HealthModule,
  MetricsModule,
  ReadinessRegistry,
} from '@nexusdrive/common';
import { Pool } from 'pg';
import { ChatController } from './chat/chat.controller';
import { ChatGateway } from './chat/chat.gateway';
import { ChatStore, MemoryChatStore } from './chat/chat.store';
import { PostgresChatStore } from './chat/postgres-chat.store';
import { RedisPubSub } from './chat/redis-pubsub';
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
  providers: [
    {
      // Postgres when DATABASE_URL is set; in-memory history otherwise (local dev).
      provide: ChatStore,
      inject: [ConfigService, ReadinessRegistry],
      useFactory: (config: ConfigService<Env, true>, readiness: ReadinessRegistry): ChatStore => {
        const url = config.get('DATABASE_URL', { infer: true });
        if (!url) {
          new Logger('ChatStore').log('DATABASE_URL not set: chat history is kept in memory');
          return new MemoryChatStore();
        }
        const store = new PostgresChatStore(
          new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 3000 }),
        );
        readiness.register('postgres', () => store.ping());
        return store;
      },
    },
    RedisPubSub,
    ChatGateway,
    MeetingsService,
  ],
})
export class AppModule {}
