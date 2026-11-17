import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReadinessRegistry } from '@nexusdrive/common';
import Redis from 'ioredis';
import type { Env } from '../config/env';

/**
 * The two Redis connections the socket.io Redis adapter needs (one publishes,
 * one subscribes). With them, a message sent on one chat-service replica reaches
 * users connected to any other replica. Disabled when REDIS_URL is empty.
 */
@Injectable()
export class RedisPubSub implements OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSub.name);
  readonly clients?: { pub: Redis; sub: Redis };

  constructor(config: ConfigService<Env, true>, readiness: ReadinessRegistry) {
    const url = config.get('REDIS_URL', { infer: true });
    if (!url) {
      this.logger.log('REDIS_URL not set: chat rooms are local to this replica');
      return;
    }

    // Commands wait for a reconnect instead of failing after N retries. Otherwise the
    // adapter's subscribe call rejects while Redis is down and crashes the process.
    // /ready still reports Redis as down, because readiness checks have a timeout.
    const pub = new Redis(url, { maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    for (const [name, client] of Object.entries({ pub, sub })) {
      // ioredis reconnects on its own; log state changes instead of every retry.
      let lastError = '';
      client.on('ready', () => {
        lastError = '';
        this.logger.log(`redis ${name} connected`);
      });
      client.on('error', (err: Error) => {
        if (err.message !== lastError) this.logger.warn(`redis ${name}: ${err.message}`);
        lastError = err.message;
      });
    }
    this.clients = { pub, sub };
    readiness.register('redis', () => pub.ping());
  }

  async onModuleDestroy(): Promise<void> {
    if (this.clients) {
      await Promise.allSettled([this.clients.pub.quit(), this.clients.sub.quit()]);
    }
  }
}
