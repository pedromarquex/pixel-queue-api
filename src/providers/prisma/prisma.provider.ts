import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaProvider
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaProvider.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    process.env.NODE_ENV === 'development' &&
      this.logger.log('✅ Prisma connected!');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    process.env.NODE_ENV === 'development' &&
      this.logger.error('❌ Prisma disconnected!');
  }
}
