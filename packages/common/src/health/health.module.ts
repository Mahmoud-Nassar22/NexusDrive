import {
  Controller,
  Get,
  Global,
  Injectable,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';

type Check = () => Promise<unknown>;

/** A hung dependency must fail readiness quickly, not hang the probe. */
const CHECK_TIMEOUT_MS = 3000;

function withTimeout(check: Check, ms: number): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([check(), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Services register dependency checks here (e.g. "s3", "postgres") in
 * onModuleInit. /ready runs all of them in parallel, each with a timeout;
 * /health never touches dependencies.
 */
@Injectable()
export class ReadinessRegistry {
  private readonly checks = new Map<string, Check>();

  register(name: string, check: Check): void {
    this.checks.set(name, check);
  }

  async run(
    timeoutMs = CHECK_TIMEOUT_MS,
  ): Promise<{ ok: boolean; checks: Record<string, string> }> {
    const entries = [...this.checks];
    const settled = await Promise.allSettled(
      entries.map(([, check]) => withTimeout(check, timeoutMs)),
    );
    const results: Record<string, string> = {};
    settled.forEach((r, i) => {
      const name = entries[i][0];
      results[name] =
        r.status === 'fulfilled' ? 'ok' : r.reason instanceof Error ? r.reason.message : 'failed';
    });
    return { ok: settled.every((r) => r.status === 'fulfilled'), checks: results };
  }
}

@Controller()
export class HealthController {
  constructor(private readonly registry: ReadinessRegistry) {}

  /** Liveness: the process is up. Kubernetes restarts the pod if this fails. */
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies are reachable. Kubernetes stops routing traffic if this fails. */
  @Get('ready')
  async ready() {
    const result = await this.registry.run();
    if (!result.ok) {
      throw new ServiceUnavailableException({ status: 'not ready', checks: result.checks });
    }
    return { status: 'ready', checks: result.checks };
  }
}

@Global()
@Module({
  controllers: [HealthController],
  providers: [ReadinessRegistry],
  exports: [ReadinessRegistry],
})
export class HealthModule {}
