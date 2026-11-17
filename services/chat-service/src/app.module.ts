import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  AuthModule,
  createLoggerModule,
  HealthModule,
  MetricsModule,
  ReadinessRegistry,
} from '@nexusdrive/common';
import { RoomServiceClient } from 'livekit-server-sdk';
import { Pool } from 'pg';
import { ChatGateway } from './chat/chat.gateway';
import { ChatStore } from './chat/chat.store';
import { RedisPubSub } from './chat/redis-pubsub';
import { validateEnv, type Env } from './config/env';
import { UserDirectoryClient } from './directory/user-directory.client';
import { MeetingsController } from './meetings/meetings.controller';
import { livekitApiUrl, LIVEKIT_ROOMS, MeetingsService } from './meetings/meetings.service';
import { RoomsController } from './rooms/rooms.controller';
import { RoomsService } from './rooms/rooms.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    createLoggerModule('chat-service'),
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
  controllers: [RoomsController, MeetingsController],
  providers: [
    {
      provide: ChatStore,
      inject: [ConfigService, ReadinessRegistry],
      useFactory: (config: ConfigService<Env, true>, readiness: ReadinessRegistry) => {
        const pool = new Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          max: 10,
          connectionTimeoutMillis: 3000,
        });
        // Without a listener, an idle connection dropped by the server (restart,
        // failover) emits an unhandled 'error' and kills the process.
        pool.on('error', (err) => new Logger('Postgres').warn(`idle client: ${err.message}`));
        const store = new ChatStore(pool);
        readiness.register('postgres', () => store.ping());
        return store;
      },
    },
    UserDirectoryClient,
    RoomsService,
    RedisPubSub,
    ChatGateway,
    {
      provide: LIVEKIT_ROOMS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new RoomServiceClient(
          livekitApiUrl(
            config.get('LIVEKIT_URL', { infer: true }),
            config.get('LIVEKIT_API_URL', { infer: true }),
          ),
          config.get('LIVEKIT_API_KEY', { infer: true }),
          config.get('LIVEKIT_API_SECRET', { infer: true }),
        ),
    },
    MeetingsService,
  ],
})
export class AppModule {}
