# 04 - Circuit Breaker

## 📖 Visão Geral

Circuit Breaker é um padrão que protege o sistema de falhas em cascata, interrompendo chamadas a serviços instáveis e permitindo recuperação gradual.

## 🎯 Problema

E se o GCS (Google Cloud Storage) ficar instável ou cair?
- Workers continuam tentando fazer upload
- Todos os jobs falham
- Retentativas automáticas pioram a situação
- Sistema fica em loop de falhas

## 🔌 Estados do Circuit Breaker

```
CLOSED (Normal) → failures → OPEN (Bloqueado) → timeout → HALF_OPEN (Teste) → success → CLOSED
                                      ↑                                  ↓
                                      └──────────── failures ────────────┘
```

## 💻 Implementação

### Passo 1: Instalar Biblioteca

```bash
yarn add opossum
# ou
npm install opossum
```

### Passo 2: Criar Circuit Breaker Provider

```typescript
// src/providers/circuit-breaker/circuit-breaker.provider.ts
import { Injectable } from '@nestjs/common';
import CircuitBreaker from 'opossum';

@Injectable()
export class CircuitBreakerProvider {
  private breakers: Map<string, CircuitBreaker> = new Map();

  createBreaker<T>(
    name: string,
    action: (...args: any[]) => Promise<T>,
    options?: CircuitBreaker.Options,
  ): CircuitBreaker<any[], T> {
    if (this.breakers.has(name)) {
      return this.breakers.get(name);
    }

    const defaultOptions: CircuitBreaker.Options = {
      timeout: 30000, // 30 segundos
      errorThresholdPercentage: 50, // 50% de erro abre o circuito
      resetTimeout: 60000, // 1 minuto para tentar novamente
      rollingCountTimeout: 10000, // Janela de 10 segundos
      rollingCountBuckets: 10,
      volumeThreshold: 5, // Mínimo 5 requests para calcular
      ...options,
    };

    const breaker = new CircuitBreaker(action, defaultOptions);

    // Logs dos eventos
    breaker.on('open', () => {
      console.error(`[CircuitBreaker] ${name} ABERTO - Bloqueando chamadas`);
    });

    breaker.on('halfOpen', () => {
      console.warn(`[CircuitBreaker] ${name} HALF-OPEN - Testando recuperação`);
    });

    breaker.on('close', () => {
      console.log(`[CircuitBreaker] ${name} FECHADO - Operação normal`);
    });

    breaker.on('fallback', (result) => {
      console.warn(`[CircuitBreaker] ${name} usando fallback`);
    });

    this.breakers.set(name, breaker);
    return breaker;
  }

  getBreaker(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  async getStatus(name: string) {
    const breaker = this.breakers.get(name);
    if (!breaker) return null;

    return {
      name,
      state: breaker.opened ? 'OPEN' : breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
      stats: breaker.stats,
    };
  }

  async getAllStatus() {
    const statuses = [];
    for (const [name, breaker] of this.breakers) {
      statuses.push(await this.getStatus(name));
    }
    return statuses;
  }
}
```

### Passo 3: Proteger Storage com Circuit Breaker

```typescript
// src/providers/storage/storage.provider.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { CircuitBreakerProvider } from '../circuit-breaker/circuit-breaker.provider';
import CircuitBreaker from 'opossum';

@Injectable()
export class StorageProvider implements OnModuleInit {
  private storage: Storage;
  private uploadBreaker: CircuitBreaker;
  private downloadBreaker: CircuitBreaker;

  constructor(private circuitBreakerProvider: CircuitBreakerProvider) {
    this.storage = new Storage();
  }

  onModuleInit() {
    // Circuit Breaker para Upload
    this.uploadBreaker = this.circuitBreakerProvider.createBreaker(
      'gcs-upload',
      this.rawUpload.bind(this),
      {
        timeout: 60000, // 1 minuto
        errorThresholdPercentage: 60,
        resetTimeout: 120000, // 2 minutos
      },
    );

    // Fallback para upload
    this.uploadBreaker.fallback(() => {
      throw new Error('GCS Upload indisponível. Tente novamente mais tarde.');
    });

    // Circuit Breaker para Download
    this.downloadBreaker = this.circuitBreakerProvider.createBreaker(
      'gcs-download',
      this.rawDownload.bind(this),
      {
        timeout: 60000,
        errorThresholdPercentage: 60,
        resetTimeout: 120000,
      },
    );
  }

  // Método público que usa circuit breaker
  async uploadProcessed(userId: string, localPath: string, filename: string): Promise<string> {
    return this.uploadBreaker.fire(userId, localPath, filename);
  }

  // Método público que usa circuit breaker
  async downloadRaw(gcsPath: string, destPath: string): Promise<void> {
    return this.downloadBreaker.fire(gcsPath, destPath);
  }

  // Método PRIVADO - chamado pelo circuit breaker
  private async rawUpload(userId: string, localPath: string, filename: string): Promise<string> {
    const destination = `processed/${userId}/${filename}`;
    await this.storage
      .bucket('pixel-queue-videos-processed')
      .upload(localPath, { destination });

    return `gs://pixel-queue-videos-processed/${destination}`;
  }

  // Método PRIVADO - chamado pelo circuit breaker
  private async rawDownload(gcsPath: string, destPath: string): Promise<void> {
    const [bucketName, ...filePath] = gcsPath.replace('gs://', '').split('/');
    await this.storage
      .bucket(bucketName)
      .file(filePath.join('/'))
      .download({ destination: destPath });
  }
}
```

### Passo 4: Worker com Circuit Breaker Awareness

```typescript
// src/modules/worker/processors/video-processor.worker.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { StorageProvider } from '../../../providers/storage/storage.provider';
import { CircuitBreakerProvider } from '../../../providers/circuit-breaker/circuit-breaker.provider';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Processor('video-processing', { concurrency: 5 })
export class VideoProcessorWorker extends WorkerHost {
  constructor(
    private storage: StorageProvider,
    private circuitBreaker: CircuitBreakerProvider,
    @InjectQueue('video-processing') private videoQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    // Verifica estado do circuit breaker ANTES de processar
    const uploadBreakerStatus = await this.circuitBreaker.getStatus('gcs-upload');
    
    if (uploadBreakerStatus?.state === 'OPEN') {
      console.warn('[Worker] GCS Upload circuit breaker ABERTO - Pausando fila');
      
      // Pausa a fila inteira
      await this.videoQueue.pause();
      
      // Reagenda o job para 2 minutos depois
      await job.moveToDelayed(Date.now() + 120000);
      
      // Agenda retomada da fila
      setTimeout(async () => {
        const status = await this.circuitBreaker.getStatus('gcs-upload');
        if (status?.state !== 'OPEN') {
          await this.videoQueue.resume();
          console.log('[Worker] Fila retomada');
        }
      }, 120000);
      
      return { paused: true, reason: 'circuit_breaker_open' };
    }

    try {
      // Processamento normal com circuit breaker
      const result = await this.processVideo(job);
      return result;
      
    } catch (error) {
      // Se erro é de circuit breaker aberto, não conta como falha do job
      if (error.message.includes('indisponível')) {
        console.warn('[Worker] Erro de circuit breaker, não conta como falha');
        throw new Error('SERVICE_UNAVAILABLE'); // BullMQ pode ter lógica especial
      }
      
      throw error; // Outras falhas são normais
    }
  }

  private async processVideo(job: Job) {
    const { gcsPath, userId } = job.data;

    // Download (protegido por circuit breaker)
    const inputPath = `/tmp/${job.id}-input.mp4`;
    await this.storage.downloadRaw(gcsPath, inputPath);

    // Processamento FFmpeg (sem circuit breaker - local)
    const outputPath = `/tmp/${job.id}-output.mp4`;
    await this.processWithFFmpeg(inputPath, outputPath);

    // Upload (protegido por circuit breaker)
    const processedPath = await this.storage.uploadProcessed(
      userId,
      outputPath,
      `${Date.now()}-output.mp4`,
    );

    return { success: true, processedPath };
  }

  private async processWithFFmpeg(input: string, output: string) {
    // ...lógica FFmpeg...
  }
}
```

### Passo 5: Health Check com Circuit Breakers

```typescript
// src/modules/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { CircuitBreakerProvider } from '../../providers/circuit-breaker/circuit-breaker.provider';

@Controller('health')
export class HealthController {
  constructor(private circuitBreaker: CircuitBreakerProvider) {}

  @Get()
  async check() {
    const breakers = await this.circuitBreaker.getAllStatus();
    
    const hasOpenBreaker = breakers.some(b => b.state === 'OPEN');
    const status = hasOpenBreaker ? 'DEGRADED' : 'HEALTHY';

    return {
      status,
      timestamp: new Date().toISOString(),
      circuitBreakers: breakers,
    };
  }

  @Get('breakers')
  async getBreakers() {
    return this.circuitBreaker.getAllStatus();
  }
}
```

### Passo 6: Dashboard de Circuit Breakers (GraphQL)

```typescript
// src/modules/monitoring/monitoring.resolver.ts
import { Resolver, Query } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CircuitBreakerProvider } from '../../providers/circuit-breaker/circuit-breaker.provider';
import { CircuitBreakerStatus } from './types/circuit-breaker-status.type';

@Resolver()
export class MonitoringResolver {
  constructor(private circuitBreaker: CircuitBreakerProvider) {}

  @Query(() => [CircuitBreakerStatus])
  @UseGuards(GqlAuthGuard) // Apenas admins devem ver
  async circuitBreakers(): Promise<CircuitBreakerStatus[]> {
    return this.circuitBreaker.getAllStatus();
  }
}
```

## 📊 Métricas de Circuit Breaker

```typescript
// src/modules/monitoring/circuit-breaker-metrics.service.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CircuitBreakerProvider } from '../../providers/circuit-breaker/circuit-breaker.provider';

@Injectable()
export class CircuitBreakerMetricsService {
  constructor(private circuitBreaker: CircuitBreakerProvider) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async collectMetrics() {
    const statuses = await this.circuitBreaker.getAllStatus();
    
    for (const status of statuses) {
      const { name, state, stats } = status;
      
      console.log(`[Metrics] ${name}:`, {
        state,
        failures: stats.failures,
        successes: stats.successes,
        rejects: stats.rejects,
        timeouts: stats.timeouts,
        errorRate: (stats.failures / (stats.failures + stats.successes)) * 100,
      });
      
      // Enviar para sistema de métricas (Prometheus, Datadog, etc)
      // await this.metricsClient.gauge('circuit_breaker_state', state === 'OPEN' ? 1 : 0, {
      //   breaker: name
      // });
    }
  }
}
```

## 🚨 Alertas Automáticos

```typescript
// src/modules/alerts/circuit-breaker-alerts.service.ts
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class CircuitBreakerAlertsService {
  @OnEvent('circuit.breaker.open')
  async handleCircuitOpen(payload: { name: string }) {
    console.error(`🚨 ALERTA: Circuit Breaker ${payload.name} ABERTO!`);
    
    // Enviar alerta para Discord/Slack/Email
    // await this.notificationService.sendAlert({
    //   level: 'CRITICAL',
    //   message: `Circuit Breaker ${payload.name} está ABERTO. Serviço degradado.`,
    // });
  }

  @OnEvent('circuit.breaker.halfOpen')
  async handleCircuitHalfOpen(payload: { name: string }) {
    console.warn(`⚠️ Circuit Breaker ${payload.name} em HALF-OPEN. Testando recuperação...`);
  }

  @OnEvent('circuit.breaker.close')
  async handleCircuitClose(payload: { name: string }) {
    console.log(`✅ Circuit Breaker ${payload.name} FECHADO. Serviço recuperado.`);
    
    // Notificar recuperação
    // await this.notificationService.sendAlert({
    //   level: 'INFO',
    //   message: `Circuit Breaker ${payload.name} recuperado. Operação normal.`,
    // });
  }
}
```

## 🎯 Benefícios

1. **Prevenção de Falhas em Cascata:** Para requisições antes de sobrecarregar serviço falho
2. **Recuperação Automática:** Testa recuperação periodicamente
3. **Feedback Rápido:** Usuários recebem erro imediato ao invés de timeout
4. **Proteção de Recursos:** Evita desperdício de CPU/memória em chamadas fadadas ao fracasso
5. **Observabilidade:** Métricas claras sobre saúde dos serviços

## 🔧 Configurações Recomendadas

| Serviço | Timeout | Error % | Reset Time | Volume |
|---------|---------|---------|------------|--------|
| **GCS Upload** | 60s | 60% | 2min | 5 |
| **GCS Download** | 60s | 60% | 2min | 5 |
| **Pub/Sub Publish** | 10s | 50% | 1min | 10 |
| **Database** | 5s | 70% | 30s | 10 |
| **External API** | 15s | 50% | 2min | 5 |

## 🚀 Próximos Passos

- [WebSockets](./05-websockets.md)
- [Filas Prioritárias](./06-priority-queues.md)
- [Monitoramento](../architecture/infrastructure.md#monitoramento)

