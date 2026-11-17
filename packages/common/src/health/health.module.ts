import {
  Controller,
  Get,
  Global,
  Injectable,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';

type Check = () => Promise<unknown>;

/**
 * Services register dependency checks here (e.g. "s3", "postgres") in
 * onModuleInit. /ready runs all of them; /health never touches dependencies.
 */
@Injectable()
export class ReadinessRegistry {
  private readonly checks = new Map<string, Check>();

  register(name: string, check: Check): void {
    this.checks.set(name, check);
  }

  async run(): Promise<{ ok: boolean; checks: Record<string, string> }> {
    const results: Record<string, string> = {};
    let ok = true;
    for (const [name, check] of this.checks) {
      try {
        await check();
        results[name] = 'ok';
      } catch (err) {
        ok = false;
        results[name] = err instanceof Error ? err.message : 'failed';
      }
    }
    return { ok, checks: results };
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
