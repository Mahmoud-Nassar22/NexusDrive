import 'reflect-metadata';
import { bootstrapService } from '@nexusdrive/common';
import { AppModule } from './app.module';

void bootstrapService(AppModule, { globalPrefix: 'api/users', defaultPort: 3003 });
