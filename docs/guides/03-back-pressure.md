# 03 - Back-Pressure e Controle de Carga

## 📖 Visão Geral

Back-pressure é o mecanismo de controlar a taxa de processamento para evitar sobrecarga do sistema quando há mais trabalho chegando do que a capacidade de processar.

## 🎯 Problema

E se 10.000 vídeos chegarem em 1 minuto?
- Pub/Sub aguenta, mas...
- Workers vão explodir
- Memória vai estourar
- CPU vai a 100%
- Sistema trava

## 🏗️ Solução: Cascata de Proteção

```
Pub/Sub (buffer gigante)
    ↓ controle de pull
Scheduler (buffer Redis)
    ↓ controle de concorrência
Worker (processamento controlado)
```

## 💻 Implementação

### Nível 1: Scheduler - Controle de Pull do Pub/Sub

```typescript
// src/modules/scheduler/scheduler.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PubSub, Subscription } from '@google-cloud/pubsub';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private subscription: Subscription;
  private isProcessing = false;
  private readonly MAX_MESSAGES_PER_BATCH = 100;
  private readonly BATCH_INTERVAL_MS = 1000; // 1 segundo

  constructor(
    @InjectQueue('video-processing') private videoQueue: Queue,
    private pubSubProvider: PubSubProvider,
  ) {}

  async onModuleInit() {
    this.subscription = this.pubSubProvider.getSubscription('video-received-scheduler');

    // Configurar flow control
    this.subscription.setOptions({
      flowControl: {
        maxMessages: this.MAX_MESSAGES_PER_BATCH, // Máximo de mensagens simultâneas
        maxBytes: 10 * 1024 * 1024, // 10MB máximo
        allowExcessMessages: false,
      },
      batching: {
        maxMessages: 10, // Agrupa até 10 mensagens por batch
        maxMilliseconds: 1000, // Ou 1 segundo
      },
    });

    this.subscription.on('message', this.handleMessage.bind(this));
    
    console.log('[Scheduler] Iniciado com flow control configurado');
  }

  private async handleMessage(message: Message) {
    // Rate limiting manual
    if (this.isProcessing) {
      // Se já está processando, "nackeia" para reprocessar depois
      message.nack();
      return;
    }

    this.isProcessing = true;

    try {
      const data = JSON.parse(message.data.toString());
      
      // Verifica capacidade do Redis antes de adicionar
      const queueSize = await this.videoQueue.count();
      
      if (queueSize > 10000) {
        console.warn('[Scheduler] Fila muito grande, aguardando...');
        message.nack(); // Reprocessa depois
        return;
      }

      await this.addJobToQueue(data);
      message.ack();
      
    } catch (error) {
      console.error('[Scheduler] Erro:', error);
      message.nack();
    } finally {
      this.isProcessing = false;
    }
  }

  private async addJobToQueue(data: any) {
    // ...lógica de adicionar job...
  }
}
```

### Nível 2: BullMQ - Controle de Concorrência

```typescript
// src/modules/worker/worker.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'video-processing',
      // Limiter global da fila
      limiter: {
        max: 100, // Máximo 100 jobs processados
        duration: 60000, // Por minuto (60 segundos)
        bounceBack: true, // Retorna jobs que excederem o limite
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 86400, // 24h
          count: 1000,
        },
      },
    }),
  ],
})
export class WorkerModule {}
```

### Nível 3: Worker - Controle Fino de Concorrência

```typescript
// src/modules/worker/processors/video-processor.worker.ts
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('video-processing', {
  concurrency: 5, // Máximo 5 jobs simultâneos neste worker
  limiter: {
    max: 10, // Máximo 10 jobs
    duration: 60000, // Por minuto
  },
})
export class VideoProcessorWorker extends WorkerHost {
  private activeJobs = 0;
  private readonly MAX_MEMORY_MB = 2048;

  async process(job: Job): Promise<any> {
    this.activeJobs++;
    
    try {
      // Verifica memória antes de processar
      const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
      
      if (memoryUsage > this.MAX_MEMORY_MB) {
        console.warn('[Worker] Memória alta, pausando processamento...');
        await this.pauseProcessing();
        throw new Error('Memory limit exceeded');
      }

      // Processamento normal
      return await this.processVideo(job);
      
    } finally {
      this.activeJobs--;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    console.log(`[Worker] Job ${job.id} ativo (${this.activeJobs}/5)`);
  }

  private async pauseProcessing() {
    const queue = await this.videoQueue.pause();
    
    // Aguarda 30 segundos e retoma
    setTimeout(async () => {
      await queue.resume();
      console.log('[Worker] Processamento retomado');
    }, 30000);
  }

  private async processVideo(job: Job) {
    // ...lógica de processamento...
  }
}
```

### Nível 4: Rate Limiting por Usuário

```typescript
// src/modules/video/video.service.ts
import { Injectable } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaService } from '../../providers/prisma/prisma.service';

@Injectable()
export class VideoService {
  constructor(private prisma: PrismaService) {}

  async initiateUpload(input: UploadVideoInput, userId: string) {
    // Verificar quantos jobs pendentes o usuário tem
    const pendingJobs = await this.prisma.video.count({
      where: {
        userId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    // Limites por plano
    const limits = {
      FREE: 2,
      STANDARD: 10,
      PREMIUM: 50,
    };

    const maxPending = limits[user.plan] || 2;

    if (pendingJobs >= maxPending) {
      throw new BusinessException(
        `Você tem ${pendingJobs} vídeos em processamento. ` +
        `Limite do plano ${user.plan}: ${maxPending}. ` +
        `Aguarde a conclusão dos vídeos anteriores.`
      );
    }

    // Prossegue com upload
    // ...
  }
}
```

### Nível 5: GraphQL Rate Limiting

```typescript
// src/modules/video/video.resolver.ts
import { Resolver, Mutation } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { GqlThrottlerGuard } from '../../guards/gql-throttler.guard';

@Resolver()
@UseGuards(GqlThrottlerGuard)
export class VideoResolver {
  @Mutation(() => VideoUploadPayload)
  @UseGuards(GqlAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 uploads por minuto
  async uploadVideo(
    @Args('input') input: UploadVideoInput,
    @CurrentUser() user: any,
  ): Promise<VideoUploadPayload> {
    return this.videoService.initiateUpload(input, user.id);
  }
}
```

### Custom Throttler Guard para GraphQL

```typescript
// src/guards/gql-throttler.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext();
    return { req: ctx.req, res: ctx.res };
  }
}
```

## 📊 Monitoramento de Carga

### Dashboard de Métricas

```typescript
// src/modules/monitoring/metrics.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class MetricsService {
  constructor(
    @InjectQueue('video-processing') private videoQueue: Queue,
  ) {}

  async getQueueMetrics() {
    const [waiting, active, delayed, failed] = await Promise.all([
      this.videoQueue.getWaitingCount(),
      this.videoQueue.getActiveCount(),
      this.videoQueue.getDelayedCount(),
      this.videoQueue.getFailedCount(),
    ]);

    const total = waiting + active + delayed;
    const healthStatus = this.calculateHealthStatus(total, active);

    return {
      waiting,
      active,
      delayed,
      failed,
      total,
      healthStatus,
      capacity: this.calculateCapacity(active),
    };
  }

  private calculateHealthStatus(total: number, active: number): string {
    if (total > 10000) return 'CRITICAL';
    if (total > 5000) return 'WARNING';
    if (active === 0 && total > 0) return 'DEGRADED';
    return 'HEALTHY';
  }

  private calculateCapacity(active: number): number {
    const maxConcurrency = 5; // Valor configurado
    return (active / maxConcurrency) * 100;
  }
}
```

### Endpoint de Health Check

```typescript
// src/modules/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { MetricsService } from '../monitoring/metrics.service';

@Controller('health')
export class HealthController {
  constructor(private metrics: MetricsService) {}

  @Get()
  async check() {
    const queueMetrics = await this.metrics.getQueueMetrics();
    const memoryUsage = process.memoryUsage();

    return {
      status: queueMetrics.healthStatus,
      timestamp: new Date().toISOString(),
      queue: queueMetrics,
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
        external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB',
      },
      uptime: process.uptime(),
    };
  }
}
```

## 🚨 Auto-scaling baseado em Carga

```typescript
// src/modules/scheduler/auto-scaler.service.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class AutoScalerService {
  constructor(
    @InjectQueue('video-processing') private videoQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkAndScale() {
    const waiting = await this.videoQueue.getWaitingCount();
    const active = await this.videoQueue.getActiveCount();

    console.log(`[Auto-Scaler] Waiting: ${waiting}, Active: ${active}`);

    // Se muitos jobs esperando, aumenta workers
    if (waiting > 100 && active < 50) {
      console.log('[Auto-Scaler] Recomendação: Aumentar workers');
      // Em produção, trigger auto-scaling no Kubernetes/Cloud Run
      // await this.scaleWorkers('up');
    }

    // Se poucos jobs, diminui workers
    if (waiting < 10 && active < 5) {
      console.log('[Auto-Scaler] Recomendação: Diminuir workers');
      // await this.scaleWorkers('down');
    }
  }
}
```

## 🎯 Estratégias de Back-Pressure

| Nível | Técnica | Efeito |
|-------|---------|--------|
| **API** | Rate Limiting | Rejeita requests excedentes |
| **Pub/Sub** | Flow Control | Controla pull de mensagens |
| **Scheduler** | Queue Size Check | Não adiciona se fila cheia |
| **BullMQ** | Limiter + Concurrency | Controla taxa de processamento |
| **Worker** | Memory Check | Pausa se memória alta |
| **Sistema** | Auto-scaling | Adiciona/remove workers |

## 🚀 Próximos Passos

- [Circuit Breaker](./04-circuit-breaker.md)
- [WebSockets](./05-websockets.md)
- [Filas Prioritárias](./06-priority-queues.md)

