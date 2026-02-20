# 02 - Fan-Out / Fan-In

## 📖 Visão Geral

Padrão onde um único evento (Pub/Sub) aciona múltiplos consumidores independentes simultaneamente (Fan-Out) e seus resultados podem ser agregados (Fan-In).

## 🎯 Conceito

**Fan-Out:** Um tópico Pub/Sub com múltiplas subscriptions independentes
**Fan-In:** Múltiplos resultados agregados em um único ponto

```
                    ┌──────────────────┐
                    │  Pub/Sub Topic   │
                    │ "video-processed"│
                    └────────┬─────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌──────────┐      ┌──────────┐     ┌──────────┐
    │Subscription│     │Subscription│    │Subscription│
    │Notifications│    │ Analytics  │    │  Audit   │
    └──────────┘      └──────────┘     └──────────┘
```

## 🏗️ Implementação

### Passo 1: Criar Subscriptions no Pub/Sub

```bash
# Criar tópico
gcloud pubsub topics create video-processed

# Subscription 1: Notificações aos usuários
gcloud pubsub subscriptions create video-processed-notifications \
  --topic=video-processed \
  --ack-deadline=30

# Subscription 2: Analytics (BigQuery)
gcloud pubsub subscriptions create video-processed-analytics \
  --topic=video-processed \
  --ack-deadline=30

# Subscription 3: Audit Log
gcloud pubsub subscriptions create video-processed-audit \
  --topic=video-processed \
  --ack-deadline=60
```

### Passo 2: Publisher (Worker)

```typescript
// src/modules/worker/processors/video-processor.worker.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PubSubProvider } from '../../../providers/pubsub/pubsub.provider';

@Processor('video-processing')
export class VideoProcessorWorker extends WorkerHost {
  constructor(private pubsub: PubSubProvider) {
    super();
  }

  async process(job: Job): Promise<any> {
    // ...processamento do vídeo...

    // Publica UMA VEZ no tópico
    await this.pubsub.publishVideoProcessed({
      userId: job.data.userId,
      videoId: job.data.videoId,
      originalPath: job.data.gcsPath,
      processedPaths: results.processedPaths,
      duration: metadata.duration,
      resolution: metadata.resolution,
      completedAt: new Date().toISOString(),
    });

    // Múltiplos sistemas receberão este evento automaticamente!
    return { success: true };
  }
}
```

### Passo 3: Subscriber 1 - Notificações

```typescript
// src/modules/notification/subscribers/video-notification.subscriber.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PubSubProvider } from '../../../providers/pubsub/pubsub.provider';
import { NotificationGateway } from '../notification.gateway';
import { PrismaService } from '../../../providers/prisma/prisma.service';

@Injectable()
export class VideoNotificationSubscriber implements OnModuleInit {
  constructor(
    private pubsub: PubSubProvider,
    private notificationGateway: NotificationGateway,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.pubsub.subscribe(
      'video-processed-notifications',
      this.handleVideoProcessed.bind(this),
    );
  }

  private async handleVideoProcessed(data: any) {
    console.log('[Notifications] Vídeo processado:', data.videoId);

    const { userId, videoId, processedPaths } = data;

    // Busca informações do usuário
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    // Envia notificação via WebSocket
    this.notificationGateway.notifyUser(userId, 'video.completed', {
      videoId,
      title: 'Vídeo processado com sucesso!',
      message: `Seu vídeo está pronto para ser visualizado`,
      processedPaths,
    });

    // Envia email (opcional)
    // await this.emailService.sendVideoReady(user.email, videoId);

    console.log(`[Notifications] Usuário ${userId} notificado`);
  }
}
```

### Passo 4: Subscriber 2 - Analytics

```typescript
// src/modules/analytics/subscribers/video-analytics.subscriber.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PubSubProvider } from '../../../providers/pubsub/pubsub.provider';
import { BigQuery } from '@google-cloud/bigquery';

@Injectable()
export class VideoAnalyticsSubscriber implements OnModuleInit {
  private bigquery: BigQuery;

  constructor(private pubsub: PubSubProvider) {
    this.bigquery = new BigQuery();
  }

  async onModuleInit() {
    this.pubsub.subscribe(
      'video-processed-analytics',
      this.handleVideoProcessed.bind(this),
    );
  }

  private async handleVideoProcessed(data: any) {
    console.log('[Analytics] Registrando métricas:', data.videoId);

    const { userId, videoId, duration, resolution, completedAt } = data;

    // Insere no BigQuery para análise
    await this.bigquery
      .dataset('pixel_queue_analytics')
      .table('video_processing')
      .insert([
        {
          user_id: userId,
          video_id: videoId,
          duration_seconds: duration,
          resolution,
          processed_at: completedAt,
          processing_time_ms: this.calculateProcessingTime(data),
        },
      ]);

    console.log('[Analytics] Métricas salvas no BigQuery');
  }

  private calculateProcessingTime(data: any): number {
    const started = new Date(data.requestedAt).getTime();
    const completed = new Date(data.completedAt).getTime();
    return completed - started;
  }
}
```

### Passo 5: Subscriber 3 - Audit Log

```typescript
// src/modules/audit/subscribers/video-audit.subscriber.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PubSubProvider } from '../../../providers/pubsub/pubsub.provider';
import { PrismaService } from '../../../providers/prisma/prisma.service';

@Injectable()
export class VideoAuditSubscriber implements OnModuleInit {
  constructor(
    private pubsub: PubSubProvider,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.pubsub.subscribe(
      'video-processed-audit',
      this.handleVideoProcessed.bind(this),
    );
  }

  private async handleVideoProcessed(data: any) {
    console.log('[Audit] Registrando log de auditoria:', data.videoId);

    await this.prisma.auditLog.create({
      data: {
        entityType: 'VIDEO',
        entityId: data.videoId,
        action: 'PROCESSED',
        userId: data.userId,
        metadata: {
          originalPath: data.originalPath,
          processedPaths: data.processedPaths,
          duration: data.duration,
          resolution: data.resolution,
        },
        timestamp: new Date(data.completedAt),
      },
    });

    console.log('[Audit] Log de auditoria salvo');
  }
}
```

## 🔄 Fan-In: Agregando Resultados

### Caso de Uso: Esperar múltiplos processamentos

```typescript
// src/modules/aggregator/video-aggregator.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class VideoAggregatorService {
  private pendingAggregations = new Map<string, Set<string>>();

  constructor(private eventEmitter: EventEmitter2) {}

  async waitForMultipleProcessors(videoId: string, expectedCount: number) {
    return new Promise((resolve) => {
      const requiredEvents = new Set(['notifications', 'analytics', 'audit']);
      this.pendingAggregations.set(videoId, requiredEvents);

      // Listener para cada evento
      const checkCompletion = (source: string) => {
        const pending = this.pendingAggregations.get(videoId);
        if (pending) {
          pending.delete(source);
          
          if (pending.size === 0) {
            console.log(`[Aggregator] Todos os processadores completaram para ${videoId}`);
            this.pendingAggregations.delete(videoId);
            resolve(true);
          }
        }
      };

      // Escuta eventos de conclusão
      this.eventEmitter.on(`video.${videoId}.notifications.done`, () => 
        checkCompletion('notifications')
      );
      this.eventEmitter.on(`video.${videoId}.analytics.done`, () => 
        checkCompletion('analytics')
      );
      this.eventEmitter.on(`video.${videoId}.audit.done`, () => 
        checkCompletion('audit')
      );
    });
  }
}
```

### Emitir eventos de conclusão nos subscribers

```typescript
// Adicione em cada subscriber após processar
private async handleVideoProcessed(data: any) {
  // ...processamento...

  // Emite evento de conclusão
  this.eventEmitter.emit(`video.${data.videoId}.notifications.done`);
}
```

## 📊 Monitoramento

### Dashboard de Subscriptions

```typescript
// src/modules/monitoring/pubsub-monitor.service.ts
import { Injectable } from '@nestjs/common';
import { PubSub } from '@google-cloud/pubsub';

@Injectable()
export class PubSubMonitorService {
  private pubsub: PubSub;

  constructor() {
    this.pubsub = new PubSub();
  }

  async getSubscriptionMetrics(subscriptionName: string) {
    const subscription = this.pubsub.subscription(subscriptionName);
    const [metadata] = await subscription.getMetadata();

    return {
      name: subscriptionName,
      topic: metadata.topic,
      ackDeadlineSeconds: metadata.ackDeadlineSeconds,
      messageRetentionDuration: metadata.messageRetentionDuration,
      // Métricas do Cloud Monitoring
      undeliveredMessages: await this.getUndeliveredMessages(subscriptionName),
      oldestUnackedMessage: await this.getOldestUnackedMessage(subscriptionName),
    };
  }

  private async getUndeliveredMessages(subscriptionName: string): Promise<number> {
    // Integração com Cloud Monitoring API
    // Retorna número de mensagens não entregues
    return 0; // Implementar
  }

  private async getOldestUnackedMessage(subscriptionName: string): Promise<Date> {
    // Retorna timestamp da mensagem não confirmada mais antiga
    return new Date(); // Implementar
  }
}
```

## 🎯 Benefícios do Fan-Out/Fan-In

1. **Desacoplamento Total:** Sistemas não conhecem uns aos outros
2. **Escalabilidade Independente:** Cada subscriber escala conforme sua necessidade
3. **Resiliência:** Falha em um subscriber não afeta os outros
4. **Flexibilidade:** Adicionar novos subscribers sem modificar código existente
5. **Processamento Paralelo:** Todos os subscribers processam simultaneamente

## ⚠️ Considerações

- **Idempotência:** Subscribers devem ser idempotentes (mesma mensagem pode chegar 2x)
- **Ordem:** Pub/Sub não garante ordem de entrega
- **Latência:** Cada subscriber pode ter latências diferentes
- **Custos:** Cada subscription tem custo no GCP

## 🚀 Próximos Passos

- [Back-Pressure](./03-back-pressure.md)
- [Circuit Breaker](./04-circuit-breaker.md)
- [WebSockets](./05-websockets.md)

