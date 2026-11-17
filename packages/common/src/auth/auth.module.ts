import { DynamicModule, FactoryProvider, Global, Module } from '@nestjs/common';
import { AUTH_OPTIONS, type AuthModuleOptions } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenVerifier } from './token-verifier.service';

@Global()
@Module({})
export class AuthModule {
  static forRootAsync(options: {
    imports?: DynamicModule['imports'];
    inject?: FactoryProvider['inject'];
    useFactory: (...args: never[]) => AuthModuleOptions;
  }): DynamicModule {
    return {
      module: AuthModule,
      imports: options.imports ?? [],
      providers: [
        { provide: AUTH_OPTIONS, inject: options.inject ?? [], useFactory: options.useFactory },
        TokenVerifier,
        JwtAuthGuard,
      ],
      exports: [TokenVerifier, JwtAuthGuard],
    };
  }
}
