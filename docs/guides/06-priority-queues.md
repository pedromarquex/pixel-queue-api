# 06 - Filas Prioritárias

## 📖 Visão Geral

Implementar sistema de prioridades para processar vídeos de usuários Premium antes de usuários Free, garantindo diferentes níveis de serviço (SLA).

## 🎯 Estratégias de Prioridade

### 1. Prioridade por Plano de Usuário
- **PREMIUM**: Prioridade 1 (mais alta)
- **STANDARD**: Prioridade 5 (média)
- **FREE**: Prioridade 10 (mais baixa)

### 2. Prioridade por Hora do Dia
- **Horário comercial (9h-18h)**: Prioridade normal
- **Madrugada (0h-6h)**: Processa apenas FREE (agendado)

### 3. Prioridade por Tamanho do Arquivo
- **Arquivos pequenos (<100MB)**: Prioridade +2
- **Arquivos grandes (>1GB)**: Prioridade -2

## 💻 Implementação

### Passo 1: Scheduler com Lógica de Prioridade

```typescript
// src/modules/scheduler/scheduler.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PubSubProvider } from '../../providers/pubsub/pubsub.provider';
import { PrismaService } from '../../providers/prisma/prisma.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue('video-processing') private videoQueue: Queue,
    private pubsub: PubSubProvider,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.pubsub.subscribe('video-received-scheduler', this.handleVideoReceived.bind(this));
  }

  private async handleVideoReceived(data: any) {
    const { gcsPath, userId, metadata } = data;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, email: true },
    });

    if (!user) {
      console.error(`Usuário ${userId} não encontrado`);
      return;
    }

    const jobOptions = this.calculateJobOptions(user.plan, metadata);

    await this.videoQueue.add('process-video', data, jobOptions);

    console.log(
      `[Scheduler] Job adicionado - Plan: ${user.plan}, Priority: ${jobOptions.priority}, Delay: ${jobOptions.delay || 0}ms`,
    );
  }

  private calculateJobOptions(plan: string, metadata: any) {
    const baseOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 5000,
      },
    };

    let priority = 5; // Padrão
    let delay = 0;

    // Prioridade base por plano
    switch (plan) {
      case 'PREMIUM':
        priority = 1;
        break;
      case 'STANDARD':
        priority = 5;
        break;
      case 'FREE':
        priority = 10;
        // FREE só processa de madrugada
        delay = this.calculateDelayUntil3AM();
        break;
    }

    // Ajuste por tamanho do arquivo
    const fileSizeMB = metadata.fileSize / (1024 * 1024);
    if (fileSizeMB < 100) {
      priority = Math.max(1, priority - 2); // Arquivos pequenos têm prioridade
    } else if (fileSizeMB > 1024) {
      priority = Math.min(10, priority + 2); // Arquivos grandes têm menos prioridade
    }

    // Ajuste por horário
    const hour = new Date().getHours();
    const isPeakHours = hour >= 9 && hour < 18;
    
    if (isPeakHours && plan === 'PREMIUM') {
      priority = Math.max(1, priority - 1); // Premium tem ainda mais prioridade no horário de pico
    }

    return {
      ...baseOptions,
      priority,
      delay,
      jobId: gcsPath, // Evita duplicatas
    };
  }

  private calculateDelayUntil3AM(): number {
    const now = new Date();
    const target = new Date();
    target.setHours(3, 0, 0, 0);

    if (now.getHours() >= 3) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
  }
}
```

### Passo 2: Múltiplas Filas por Prioridade

```typescript
// src/modules/scheduler/multi-queue.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class MultiQueueService {
  constructor(
    @InjectQueue('video-processing-premium') private premiumQueue: Queue,
    @InjectQueue('video-processing-standard') private standardQueue: Queue,
    @InjectQueue('video-processing-free') private freeQueue: Queue,
  ) {}

  async addJob(data: any, userPlan: string) {
    switch (userPlan) {
      case 'PREMIUM':
        return this.premiumQueue.add('process-video', data, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        });

      case 'STANDARD':
        return this.standardQueue.add('process-video', data, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        });

      case 'FREE':
        return this.freeQueue.add('process-video', data, {
          attempts: 2, // Menos retentativas para FREE
          backoff: { type: 'exponential', delay: 10000 },
          delay: this.calculateDelayUntil3AM(),
        });
    }
  }

  private calculateDelayUntil3AM(): number {
    const now = new Date();
    const target = new Date();
    target.setHours(3, 0, 0, 0);

    if (now.getHours() >= 3) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
  }
}
```

### Passo 3: Workers com Concorrência Diferenciada

```typescript
// src/modules/worker/workers/premium.worker.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('video-processing-premium', {
  concurrency: 10, // Premium pode processar mais simultaneamente
  limiter: {
    max: 200, // Mais jobs por minuto
    duration: 60000,
  },
})
export class PremiumWorker extends WorkerHost {
  async process(job: Job): Promise<any> {
    console.log(`[Premium Worker] Processando job ${job.id}`);
    // ...processamento com recursos prioritários...
    return { success: true };
  }
}

// src/modules/worker/workers/standard.worker.ts
@Processor('video-processing-standard', {
  concurrency: 5, // Concorrência média
  limiter: {
    max: 100,
    duration: 60000,
  },
})
export class StandardWorker extends WorkerHost {
  async process(job: Job): Promise<any> {
    console.log(`[Standard Worker] Processando job ${job.id}`);
    return { success: true };
  }
}

// src/modules/worker/workers/free.worker.ts
@Processor('video-processing-free', {
  concurrency: 2, // Concorrência baixa
  limiter: {
    max: 50, // Menos jobs por minuto
    duration: 60000,
  },
})
export class FreeWorker extends WorkerHost {
  async process(job: Job): Promise<any> {
    console.log(`[Free Worker] Processando job ${job.id}`);
    // Pode usar configurações de FFmpeg mais lentas/econômicas
    return { success: true };
  }
}
```

### Passo 4: Worker Scheduler (Distribui entre Filas)

```typescript
// src/modules/worker/services/worker-scheduler.service.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class WorkerSchedulerService {
  constructor(
    @InjectQueue('video-processing-premium') private premiumQueue: Queue,
    @InjectQueue('video-processing-standard') private standardQueue: Queue,
    @InjectQueue('video-processing-free') private freeQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkQueueBalance() {
    const [premiumCount, standardCount, freeCount] = await Promise.all([
      this.premiumQueue.getWaitingCount(),
      this.standardQueue.getWaitingCount(),
      this.freeQueue.getWaitingCount(),
    ]);

    console.log('[Worker Scheduler] Filas:', {
      premium: premiumCount,
      standard: standardCount,
      free: freeCount,
    });

    // Lógica de rebalanceamento
    // Se Premium está vazia, pode processar Standard
    if (premiumCount === 0 && standardCount > 10) {
      console.log('[Worker Scheduler] Premium vazia, priorizando Standard');
      // Pode aumentar concorrência do Standard temporariamente
    }
  }

  @Cron('0 3 * * *') // Todos os dias às 3h
  async processFreeQueue() {
    const freeCount = await this.freeQueue.getWaitingCount();
    console.log(`[Worker Scheduler] Iniciando processamento de ${freeCount} jobs FREE`);

    // Aumenta temporariamente a concorrência para FREE
    // (Implementação depende de como você gerencia workers)
  }

  @Cron('0 6 * * *') // Todos os dias às 6h
  async pauseFreeQueue() {
    // Pausa processamento de FREE durante o dia
    await this.freeQueue.pause();
    console.log('[Worker Scheduler] Fila FREE pausada até amanhã');
  }
}
```

### Passo 5: SLA Tracking

```typescript
// src/modules/monitoring/sla-tracker.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../providers/prisma/prisma.service';

@Injectable()
export class SLATrackerService {
  constructor(private prisma: PrismaService) {}

  async trackJobCompletion(jobId: string, userId: string, startTime: Date, endTime: Date) {
    const processingTime = endTime.getTime() - startTime.getTime();
    const processingMinutes = processingTime / 60000;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    // SLA por plano (em minutos)
    const slaTargets = {
      PREMIUM: 10, // 10 minutos
      STANDARD: 30, // 30 minutos
      FREE: 480, // 8 horas
    };

    const target = slaTargets[user.plan];
    const metSLA = processingMinutes <= target;

    // Registra métrica
    await this.prisma.slaMetric.create({
      data: {
        jobId,
        userId,
        userPlan: user.plan,
        processingTimeMinutes: processingMinutes,
        slaTarget: target,
        metSLA,
        timestamp: endTime,
      },
    });

    if (!metSLA) {
      console.warn(
        `[SLA] Violação de SLA para usuário ${userId} (${user.plan}): ` +
        `${processingMinutes.toFixed(2)}min > ${target}min`,
      );
      
      // Pode enviar alerta ou compensação
      // await this.alertService.sendSLAViolation(userId, processingMinutes, target);
    }

    return { metSLA, processingMinutes, target };
  }

  async getSLAStats(userPlan?: string) {
    const where = userPlan ? { userPlan } : {};

    const [total, met, avg] = await Promise.all([
      this.prisma.slaMetric.count({ where }),
      this.prisma.slaMetric.count({ where: { ...where, metSLA: true } }),
      this.prisma.slaMetric.aggregate({
        where,
        _avg: { processingTimeMinutes: true },
      }),
    ]);

    const slaCompliance = (met / total) * 100;

    return {
      totalJobs: total,
      metSLA: met,
      slaCompliance: slaCompliance.toFixed(2) + '%',
      avgProcessingTime: avg._avg.processingTimeMinutes?.toFixed(2) + ' min',
    };
  }
}
```

### Passo 6: GraphQL Query para Status da Fila

```typescript
// src/modules/monitoring/monitoring.resolver.ts
import { Resolver, Query } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueStatus } from './types/queue-status.type';

@Resolver()
export class MonitoringResolver {
  constructor(
    @InjectQueue('video-processing-premium') private premiumQueue: Queue,
    @InjectQueue('video-processing-standard') private standardQueue: Queue,
    @InjectQueue('video-processing-free') private freeQueue: Queue,
  ) {}

  @Query(() => [QueueStatus])
  @UseGuards(GqlAuthGuard)
  async queueStatus(): Promise<QueueStatus[]> {
    const queues = [
      { name: 'premium', queue: this.premiumQueue },
      { name: 'standard', queue: this.standardQueue },
      { name: 'free', queue: this.freeQueue },
    ];

    const statuses = await Promise.all(
      queues.map(async ({ name, queue }) => {
        const [waiting, active, delayed, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getDelayedCount(),
          queue.getFailedCount(),
        ]);

        return {
          name,
          waiting,
          active,
          delayed,
          failed,
          total: waiting + active + delayed,
        };
      }),
    );

    return statuses;
  }
}
```

## 📊 Comparativo de Prioridades

| Plano | Prioridade | Concorrência | SLA | Horário | Retentativas |
|-------|-----------|--------------|-----|---------|--------------|
| **PREMIUM** | 1 (alta) | 10 workers | 10 min | 24/7 | 3x |
| **STANDARD** | 5 (média) | 5 workers | 30 min | 24/7 | 3x |
| **FREE** | 10 (baixa) | 2 workers | 8h | 3h-6h | 2x |

## 🎯 Benefícios

1. **Diferentes Níveis de Serviço:** Usuários Premium têm experiência superior
2. **Otimização de Recursos:** FREE processa em horário de baixa demanda
3. **Monetização:** Incentiva upgrade para planos pagos
4. **Previsibilidade:** SLAs claros por plano
5. **Eficiência:** Recursos alocados conforme valor do cliente

## 🚀 Próximos Passos

- [Ver Schema GraphQL](../api/graphql-schema.md)
- [Exemplos de Requests](../api/examples.md)
- [Diagramas](../diagrams/flow.md)

