# 01 - Workflows com BullMQ

## 📖 Visão Geral

Aprenda a orquestrar jobs em cadeia usando BullMQ Flows para processar vídeos em múltiplas etapas (transcodificação, thumbnails, áudio).

## 🎯 Conceito

Ao invés de ter um único job monolítico que processa tudo, você divide em jobs menores e especializados que rodam em paralelo ou em sequência.

**Exemplo de Workflow:**
```
process-video (Parent)
  ├── transcode-1080p (Child 1)
  ├── transcode-720p (Child 2)
  ├── transcode-480p (Child 3)
  ├── extract-audio (Child 4)
  └── generate-thumbnails (Child 5 - depende dos transcodes)
```

## 🏗️ Implementação

### Passo 1: Instalar BullMQ Pro (Opcional)

```bash
# BullMQ gratuito suporta jobs parent/child
# BullMQ Pro oferece Flows avançados
npm install @taskforcesh/bullmq-pro
```

### Passo 2: Criar Flow Manager

```typescript
// src/modules/worker/services/video-flow.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, FlowProducer } from 'bullmq';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VideoFlowService {
  private flowProducer: FlowProducer;

  constructor(
    @InjectQueue('video-processing') private videoQueue: Queue,
    private configService: ConfigService,
  ) {
    this.flowProducer = new FlowProducer({
      connection: {
        host: this.configService.get('REDIS_HOST'),
        port: this.configService.get('REDIS_PORT'),
      },
    });
  }

  async createVideoProcessingFlow(data: any) {
    const flow = await this.flowProducer.add({
      name: 'process-video-flow',
      queueName: 'video-processing',
      data: {
        gcsPath: data.gcsPath,
        userId: data.userId,
      },
      children: [
        // Jobs que rodam em paralelo
        {
          name: 'transcode',
          data: { ...data, resolution: '1080p' },
          queueName: 'video-transcode',
        },
        {
          name: 'transcode',
          data: { ...data, resolution: '720p' },
          queueName: 'video-transcode',
        },
        {
          name: 'transcode',
          data: { ...data, resolution: '480p' },
          queueName: 'video-transcode',
        },
        {
          name: 'extract-audio',
          data,
          queueName: 'audio-processing',
        },
      ],
    });

    return flow;
  }

  async createThumbnailFlow(data: any) {
    // Thumbnails só rodam DEPOIS dos transcodes
    const flow = await this.flowProducer.add({
      name: 'generate-thumbnails',
      queueName: 'thumbnail-processing',
      data,
      children: [
        {
          name: 'thumbnail-start',
          data: { ...data, position: 0 },
          queueName: 'thumbnail-generation',
        },
        {
          name: 'thumbnail-middle',
          data: { ...data, position: 50 },
          queueName: 'thumbnail-generation',
        },
        {
          name: 'thumbnail-end',
          data: { ...data, position: 100 },
          queueName: 'thumbnail-generation',
        },
      ],
    });

    return flow;
  }
}
```

### Passo 3: Criar Workers Especializados

#### Worker de Transcodificação

```typescript
// src/modules/worker/processors/transcode.worker.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { FFmpegService } from '../services/ffmpeg.service';
import { StorageProvider } from '../../../providers/storage/storage.provider';

@Processor('video-transcode', { concurrency: 3 })
export class TranscodeWorker extends WorkerHost {
  constructor(
    private ffmpeg: FFmpegService,
    private storage: StorageProvider,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    const { gcsPath, userId, resolution } = job.data;

    console.log(`[Transcode ${resolution}] Iniciando: ${gcsPath}`);

    // Download
    const inputPath = `/tmp/${job.id}-input.mp4`;
    await this.storage.downloadRaw(gcsPath, inputPath);

    // Transcode específico para resolução
    const outputPath = `/tmp/${job.id}-${resolution}.mp4`;
    await this.ffmpeg.transcode(inputPath, outputPath, resolution, job);

    // Upload
    const processedPath = await this.storage.uploadProcessed(
      userId,
      outputPath,
      `${Date.now()}-${resolution}.mp4`,
    );

    console.log(`[Transcode ${resolution}] Concluído: ${processedPath}`);

    return { resolution, path: processedPath };
  }
}
```

#### Worker de Áudio

```typescript
// src/modules/worker/processors/audio.worker.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { FFmpegService } from '../services/ffmpeg.service';
import { StorageProvider } from '../../../providers/storage/storage.provider';

@Processor('audio-processing', { concurrency: 5 })
export class AudioWorker extends WorkerHost {
  constructor(
    private ffmpeg: FFmpegService,
    private storage: StorageProvider,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    const { gcsPath, userId } = job.data;

    console.log(`[Audio] Extraindo áudio: ${gcsPath}`);

    const inputPath = `/tmp/${job.id}-input.mp4`;
    await this.storage.downloadRaw(gcsPath, inputPath);

    const outputPath = `/tmp/${job.id}-audio.mp3`;
    await this.ffmpeg.extractAudio(inputPath, outputPath, job);

    const audioPath = await this.storage.uploadProcessed(
      userId,
      outputPath,
      `${Date.now()}-audio.mp3`,
    );

    console.log(`[Audio] Concluído: ${audioPath}`);

    return { audioPath };
  }
}
```

#### Worker de Thumbnails

```typescript
// src/modules/worker/processors/thumbnail.worker.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { FFmpegService } from '../services/ffmpeg.service';
import { StorageProvider } from '../../../providers/storage/storage.provider';

@Processor('thumbnail-generation', { concurrency: 10 })
export class ThumbnailWorker extends WorkerHost {
  constructor(
    private ffmpeg: FFmpegService,
    private storage: StorageProvider,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    const { gcsPath, userId, position } = job.data;

    console.log(`[Thumbnail] Gerando no ${position}%: ${gcsPath}`);

    const inputPath = `/tmp/${job.id}-input.mp4`;
    await this.storage.downloadRaw(gcsPath, inputPath);

    const outputPath = `/tmp/${job.id}-thumb-${position}.jpg`;
    await this.ffmpeg.generateThumbnail(inputPath, outputPath, position);

    const thumbPath = await this.storage.uploadProcessed(
      userId,
      outputPath,
      `${Date.now()}-thumb-${position}.jpg`,
    );

    console.log(`[Thumbnail] Concluído: ${thumbPath}`);

    return { position, path: thumbPath };
  }
}
```

### Passo 4: Orquestrador Principal

```typescript
// src/modules/worker/processors/main-orchestrator.worker.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { VideoFlowService } from '../services/video-flow.service';
import { PrismaService } from '../../../providers/prisma/prisma.service';

@Processor('video-processing', { concurrency: 10 })
export class VideoOrchestratorWorker extends WorkerHost {
  constructor(
    private videoFlow: VideoFlowService,
    private prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    const { gcsPath, userId } = job.data;

    console.log(`[Orchestrator] Iniciando workflow: ${gcsPath}`);

    // Cria flow de processamento principal
    await this.videoFlow.createVideoProcessingFlow(job.data);

    // Aguarda conclusão dos filhos (automático pelo BullMQ)
    // Este job só termina quando todos os filhos terminarem

    const childrenValues = await job.getChildrenValues();
    console.log('[Orchestrator] Todos os jobs filhos concluídos:', childrenValues);

    // Agora cria flow de thumbnails (que depende dos transcodes)
    await this.videoFlow.createThumbnailFlow(job.data);

    // Atualiza banco com todos os resultados
    await this.prisma.video.updateMany({
      where: { originalPath: gcsPath },
      data: {
        status: 'READY',
        processedPath: childrenValues['transcode-1080p']?.path,
      },
    });

    return { success: true, results: childrenValues };
  }
}
```

### Passo 5: Serviço FFmpeg Auxiliar

```typescript
// src/modules/worker/services/ffmpeg.service.ts
import { Injectable } from '@nestjs/common';
import * as ffmpeg from 'fluent-ffmpeg';
import { Job } from 'bullmq';

@Injectable()
export class FFmpegService {
  async transcode(
    inputPath: string,
    outputPath: string,
    resolution: string,
    job?: Job,
  ): Promise<void> {
    const resolutions = {
      '1080p': { width: 1920, height: 1080, bitrate: '5000k' },
      '720p': { width: 1280, height: 720, bitrate: '2500k' },
      '480p': { width: 854, height: 480, bitrate: '1000k' },
    };

    const config = resolutions[resolution];

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .size(`${config.width}x${config.height}`)
        .videoBitrate(config.bitrate)
        .outputOptions(['-c:v libx264', '-preset medium', '-c:a aac'])
        .on('progress', (progress) => {
          if (job) {
            job.updateProgress(progress.percent || 0);
          }
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
  }

  async extractAudio(inputPath: string, outputPath: string, job?: Job): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .on('progress', (progress) => {
          if (job) {
            job.updateProgress(progress.percent || 0);
          }
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
  }

  async generateThumbnail(
    inputPath: string,
    outputPath: string,
    position: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          count: 1,
          folder: '/tmp',
          filename: outputPath.split('/').pop(),
          timestamps: [`${position}%`],
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });
  }
}
```

### Passo 6: Configurar Módulo

```typescript
// src/modules/worker/worker.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VideoOrchestratorWorker } from './processors/main-orchestrator.worker';
import { TranscodeWorker } from './processors/transcode.worker';
import { AudioWorker } from './processors/audio.worker';
import { ThumbnailWorker } from './processors/thumbnail.worker';
import { VideoFlowService } from './services/video-flow.service';
import { FFmpegService } from './services/ffmpeg.service';
import { StorageModule } from '../../providers/storage/storage.module';
import { PrismaModule } from '../../providers/prisma/prisma.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'video-processing' },
      { name: 'video-transcode' },
      { name: 'audio-processing' },
      { name: 'thumbnail-generation' },
    ),
    StorageModule,
    PrismaModule,
  ],
  providers: [
    VideoOrchestratorWorker,
    TranscodeWorker,
    AudioWorker,
    ThumbnailWorker,
    VideoFlowService,
    FFmpegService,
  ],
})
export class WorkerModule {}
```

## 📊 Monitoramento de Workflows

### Visualizar Árvore de Jobs

```typescript
// src/modules/worker/services/job-monitor.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class JobMonitorService {
  constructor(
    @InjectQueue('video-processing') private videoQueue: Queue,
  ) {}

  async getJobTree(jobId: string) {
    const job = await this.videoQueue.getJob(jobId);
    
    if (!job) {
      throw new Error('Job não encontrado');
    }

    const children = await job.getChildrenValues();
    const state = await job.getState();
    const progress = job.progress;

    return {
      id: job.id,
      name: job.name,
      state,
      progress,
      data: job.data,
      children,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      finishedAt: job.finishedOn,
    };
  }

  async getFlowProgress(parentJobId: string) {
    const tree = await this.getJobTree(parentJobId);
    
    // Calcula progresso total baseado nos filhos
    const childrenCount = Object.keys(tree.children).length;
    const completedChildren = Object.values(tree.children).filter(
      (child: any) => child !== null,
    ).length;

    return {
      total: childrenCount,
      completed: completedChildren,
      percentage: (completedChildren / childrenCount) * 100,
    };
  }
}
```

## 🎯 Benefícios dos Workflows

1. **Paralelização:** Múltiplas resoluções processadas simultaneamente
2. **Especialização:** Workers otimizados para tarefas específicas
3. **Escalabilidade:** Escale workers por tipo de tarefa
4. **Resiliência:** Se thumbnail falha, não afeta transcodificação
5. **Observabilidade:** Rastreamento granular de cada etapa

## 🚀 Próximos Passos

- [Fan-Out/Fan-In](./02-fan-out-fan-in.md)
- [Back-Pressure](./03-back-pressure.md)
- [Circuit Breaker](./04-circuit-breaker.md)

