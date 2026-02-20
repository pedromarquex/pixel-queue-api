# Fluxo Híbrido: Google Pub/Sub + BullMQ

## 📖 Visão Geral

Esta arquitetura combina **Google Pub/Sub** para ingestão de eventos com **BullMQ** para processamento, criando um sistema altamente escalável e resiliente para processamento de vídeos.

## 🎯 O "Pulo do Gato"

- **Google Pub/Sub (O "Carteiro"):** Usado para **Ingestão** de eventos. É o ponto de entrada assíncrono, global e massivamente escalável. Sua única função é dizer: "Ei, um novo vídeo *chegou*!".

- **BullMQ (O "Gerente de Chão de Fábrica"):** Usado para **Processamento** e **Agendamento**. Ele recebe o aviso do Pub/Sub e gerencia a *execução* da tarefa (retentativas, prioridades, agendamento, controle de concorrência).

## 🏗️ Componentes da Arquitetura

### 1. API Gateway (NestJS)
**Responsabilidade:** Porteiro - Recebe requisições e inicia o processo

**Funções:**
- Recebe uploads via GraphQL
- Valida autenticação JWT
- Salva arquivo bruto no GCS
- Publica evento no Pub/Sub
- Retorna resposta rápida (202 Accepted)

**Código de Exemplo:**

```typescript
// src/modules/video/video.resolver.ts
import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { VideoService } from './video.service';
import { UploadVideoInput } from './graphql/inputs/upload-video.input';
import { VideoUploadPayload } from './graphql/types/video-upload.payload';

@Resolver()
export class VideoResolver {
  constructor(private readonly videoService: VideoService) {}

  @Mutation(() => VideoUploadPayload)
  @UseGuards(GqlAuthGuard)
  async uploadVideo(
    @Args('input') input: UploadVideoInput,
    @CurrentUser() user: any,
  ): Promise<VideoUploadPayload> {
    return this.videoService.initiateUpload(input, user.id);
  }
}
```

```typescript
// src/modules/video/video.service.ts
import { Injectable } from '@nestjs/common';
import { PubSub } from '@google-cloud/pubsub';
import { Storage } from '@google-cloud/storage';

@Injectable()
export class VideoService {
  private pubSubClient: PubSub;
  private storageClient: Storage;
  private readonly topicName = 'video-received';
  private readonly bucketName = 'pixel-queue-videos-raw';

  constructor() {
    this.pubSubClient = new PubSub();
    this.storageClient = new Storage();
  }

  async initiateUpload(input: UploadVideoInput, userId: string) {
    // 1. Upload do arquivo para GCS
    const fileName = `${userId}/${Date.now()}-${input.file.filename}`;
    const file = this.storageClient.bucket(this.bucketName).file(fileName);
    
    await file.save(input.file.buffer, {
      metadata: {
        contentType: input.file.mimetype,
        metadata: {
          userId,
          originalName: input.file.filename,
        },
      },
    });

    const gcsPath = `gs://${this.bucketName}/${fileName}`;

    // 2. Publica evento no Pub/Sub
    const topic = this.pubSubClient.topic(this.topicName);
    const messageId = await topic.publishMessage({
      json: {
        gcsPath,
        userId,
        requestedAt: new Date().toISOString(),
        metadata: {
          title: input.title,
          description: input.description,
        },
      },
    });

    console.log(`Evento publicado no Pub/Sub: ${messageId}`);

    // 3. Retorna 202 (Accepted) - desacoplado do processamento
    return {
      success: true,
      message: 'Vídeo recebido e sendo processado',
      jobId: messageId,
      gcsPath,
    };
  }
}
```

### 2. Google Pub/Sub (Mensageria)
**Responsabilidade:** Carteiro - Transporta mensagens de forma confiável

**Características:**
- Buffer global e massivamente escalável
- Garante entrega de mensagens (at-least-once)
- Desacopla completamente API do processamento
- Suporta milhões de mensagens/segundo

**Configuração:**

```bash
# Criar tópico
gcloud pubsub topics create video-received

# Criar subscription para o Scheduler
gcloud pubsub subscriptions create video-received-scheduler \
  --topic=video-received \
  --ack-deadline=60
```

### 3. Scheduler (NestJS)
**Responsabilidade:** Organizador - Aplica regras de negócio e agenda processamento

**Funções:**
- Escuta subscription do Pub/Sub
- Aplica lógica de agendamento (horário, plano do usuário)
- Define prioridades
- Adiciona jobs no BullMQ
- Evita duplicatas

**Código de Exemplo:**

```typescript
// src/modules/scheduler/scheduler.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PubSub, Message } from '@google-cloud/pubsub';
import { PrismaService } from '../../providers/prisma/prisma.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private pubSubClient: PubSub;
  private readonly subscriptionName = 'video-received-scheduler';

  constructor(
    @InjectQueue('video-processing') private videoQueue: Queue,
    private prisma: PrismaService,
  ) {
    this.pubSubClient = new PubSub();
  }

  async onModuleInit() {
    // Inicia escuta do Pub/Sub
    const subscription = this.pubSubClient.subscription(this.subscriptionName);
    
    subscription.on('message', (message: Message) => {
      this.handleVideoReceived(message);
    });

    subscription.on('error', (error) => {
      console.error('Erro ao escutar Pub/Sub:', error);
    });

    console.log(`Scheduler escutando subscription: ${this.subscriptionName}`);
  }

  private async handleVideoReceived(message: Message) {
    try {
      const data = JSON.parse(message.data.toString());
      const { gcsPath, userId, requestedAt, metadata } = data;

      // Busca informações do usuário
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true, email: true },
      });

      if (!user) {
        console.error(`Usuário ${userId} não encontrado`);
        message.ack();
        return;
      }

      // LÓGICA DE AGENDAMENTO E PRIORIDADE
      let jobOptions: any = {
        jobId: gcsPath, // Evita duplicatas
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      };

      // Usuários FREE: processa apenas de madrugada (3h-6h)
      if (user.plan === 'FREE') {
        const delay = this.calculateDelayUntil3AM();
        jobOptions.delay = delay;
        jobOptions.priority = 10; // Baixa prioridade
        
        console.log(`[FREE] Job agendado para ${new Date(Date.now() + delay).toISOString()}`);
      } 
      // Usuários PREMIUM: processamento imediato com alta prioridade
      else if (user.plan === 'PREMIUM') {
        jobOptions.priority = 1; // Alta prioridade
        console.log('[PREMIUM] Job com prioridade alta');
      } 
      // Usuários STANDARD: processamento normal
      else {
        jobOptions.priority = 5; // Prioridade média
      }

      // Adiciona job na fila BullMQ
      await this.videoQueue.add('process-video', {
        gcsPath,
        userId,
        userEmail: user.email,
        userPlan: user.plan,
        metadata,
        requestedAt,
      }, jobOptions);

      console.log(`Job adicionado ao BullMQ: ${gcsPath}`);
      
      // Confirma recebimento da mensagem
      message.ack();
    } catch (error) {
      console.error('Erro ao processar mensagem do Pub/Sub:', error);
      // Não confirma (nack) - Pub/Sub irá retentar
      message.nack();
    }
  }

  private calculateDelayUntil3AM(): number {
    const now = new Date();
    const target = new Date();
    target.setHours(3, 0, 0, 0);

    // Se já passou das 3h hoje, agenda para amanhã
    if (now.getHours() >= 3) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
  }
}
```

### 4. BullMQ + Redis (Fila de Processamento)
**Responsabilidade:** Gerente - Controla execução de jobs

**Características:**
- Gerencia prioridades
- Controla delays (agendamento)
- Retentativas automáticas
- Controle de concorrência
- Persistência de estado

### 5. Worker (NestJS)
**Responsabilidade:** Trabalhador - Executa o processamento pesado

**Funções:**
- Escuta fila BullMQ
- Baixa vídeo do GCS
- Executa FFmpeg (transcodificação)
- Salva vídeo processado no GCS
- Atualiza status no PostgreSQL
- Notifica usuário via WebSocket

**Código de Exemplo:**

```typescript
// src/modules/worker/video-processor.worker.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import * as ffmpeg from 'fluent-ffmpeg';
import { PrismaService } from '../../providers/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Processor('video-processing', {
  concurrency: 5, // Processa até 5 vídeos simultaneamente
})
export class VideoProcessorWorker extends WorkerHost {
  private storageClient: Storage;

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {
    super();
    this.storageClient = new Storage();
  }

  async process(job: Job): Promise<any> {
    const { gcsPath, userId, userEmail, metadata } = job.data;

    console.log(`[Worker] Processando job ${job.id}: ${gcsPath}`);

    try {
      // 1. Atualiza status para PROCESSING
      await this.updateJobStatus(gcsPath, 'PROCESSING');

      // 2. Download do vídeo bruto
      const localPath = `/tmp/${job.id}-input.mp4`;
      await this.downloadFromGCS(gcsPath, localPath);

      // 3. Processamento com FFmpeg
      const outputPath = `/tmp/${job.id}-output.mp4`;
      await this.transcodeVideo(localPath, outputPath, job);

      // 4. Upload do vídeo processado
      const processedGcsPath = await this.uploadToGCS(
        outputPath,
        `processed/${userId}/${Date.now()}-output.mp4`
      );

      // 5. Salva no banco de dados
      await this.saveVideoRecord(userId, gcsPath, processedGcsPath, metadata);

      // 6. Atualiza status para COMPLETED
      await this.updateJobStatus(gcsPath, 'COMPLETED');

      // 7. Notifica usuário via WebSocket
      this.eventEmitter.emit('video.processed', {
        userId,
        email: userEmail,
        originalPath: gcsPath,
        processedPath: processedGcsPath,
      });

      console.log(`[Worker] Job ${job.id} concluído com sucesso`);

      return { success: true, processedPath: processedGcsPath };
    } catch (error) {
      console.error(`[Worker] Erro no job ${job.id}:`, error);
      await this.updateJobStatus(gcsPath, 'FAILED', error.message);
      throw error; // BullMQ irá retentar
    }
  }

  private async downloadFromGCS(gcsPath: string, destPath: string): Promise<void> {
    const [bucketName, ...filePath] = gcsPath.replace('gs://', '').split('/');
    const file = this.storageClient.bucket(bucketName).file(filePath.join('/'));
    await file.download({ destination: destPath });
  }

  private async uploadToGCS(localPath: string, gcsFileName: string): Promise<string> {
    const bucket = this.storageClient.bucket('pixel-queue-videos-processed');
    await bucket.upload(localPath, {
      destination: gcsFileName,
    });
    return `gs://pixel-queue-videos-processed/${gcsFileName}`;
  }

  private transcodeVideo(inputPath: string, outputPath: string, job: Job): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          '-preset medium',
          '-crf 23',
          '-c:a aac',
          '-b:a 128k',
        ])
        .on('progress', (progress) => {
          job.updateProgress(progress.percent || 0);
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
  }

  private async updateJobStatus(gcsPath: string, status: string, errorMsg?: string) {
    await this.prisma.videoJob.upsert({
      where: { gcsPath },
      update: { status, error: errorMsg, updatedAt: new Date() },
      create: { gcsPath, status, error: errorMsg },
    });
  }

  private async saveVideoRecord(
    userId: string,
    originalPath: string,
    processedPath: string,
    metadata: any,
  ) {
    await this.prisma.video.create({
      data: {
        userId,
        title: metadata.title,
        description: metadata.description,
        originalPath,
        processedPath,
        status: 'READY',
      },
    });
  }
}
```

## 🔄 Fluxo Completo Passo a Passo

### Passo 1: Requisição de Upload
```graphql
mutation {
  uploadVideo(input: {
    file: "video.mp4"
    title: "Meu Vídeo"
    description: "Descrição do vídeo"
  }) {
    success
    message
    jobId
    gcsPath
  }
}
```

**Resposta (202 Accepted):**
```json
{
  "data": {
    "uploadVideo": {
      "success": true,
      "message": "Vídeo recebido e sendo processado",
      "jobId": "123456789",
      "gcsPath": "gs://pixel-queue-videos-raw/user123/1234567890-video.mp4"
    }
  }
}
```

### Passo 2: API → GCS
- Arquivo salvo em: `gs://pixel-queue-videos-raw/user123/1234567890-video.mp4`

### Passo 3: API → Pub/Sub
```json
{
  "gcsPath": "gs://pixel-queue-videos-raw/user123/1234567890-video.mp4",
  "userId": "user123",
  "requestedAt": "2026-02-19T10:30:00.000Z",
  "metadata": {
    "title": "Meu Vídeo",
    "description": "Descrição do vídeo"
  }
}
```

### Passo 4: Scheduler Recebe e Agenda
- Usuário FREE → Delay até 3h da manhã
- Usuário PREMIUM → Prioridade 1 (imediato)
- Usuário STANDARD → Prioridade 5 (normal)

### Passo 5: BullMQ Aguarda
- Job fica na fila aguardando o delay ou prioridade

### Passo 6: Worker Processa
- Download do GCS
- FFmpeg transcodificação
- Upload do resultado
- Atualização do banco
- Notificação ao usuário

## 📊 Tabela Comparativa de Tecnologias

| Tecnologia | Papel na Aplicação | Responsabilidade |
|------------|-------------------|------------------|
| **NestJS (API)** | Ponto de Entrada | Recebe upload, salva no GCS, publica no Pub/Sub |
| **Google Pub/Sub** | O "Carteiro" (Ingestão) | Fila de ingestão global, assíncrona e desacoplada |
| **NestJS (Scheduler)** | O "Organizador" | Escuta Pub/Sub, aplica regras de negócio, agenda no BullMQ |
| **BullMQ / Redis** | O "Gerente" | Fila de processamento interna com prioridades e delays |
| **NestJS (Worker)** | O "Trabalhador" | Escuta BullMQ, executa FFmpeg, salva resultados |
| **PostgreSQL** | Fonte da Verdade | Histórico persistente de jobs e vídeos |
| **GCS** | Armazenamento | Vídeos brutos e processados |

## 🎯 Benefícios da Arquitetura Híbrida

### 1. **Escalabilidade Massiva**
- Pub/Sub aguenta milhões de eventos/segundo
- Workers podem escalar horizontalmente

### 2. **Desacoplamento Total**
- API não sabe do BullMQ
- Scheduler não sabe do Worker
- Cada componente pode evoluir independentemente

### 3. **Resiliência**
- Pub/Sub garante entrega de mensagens
- BullMQ faz retentativas automáticas
- Circuit breaker protege de falhas em cascata

### 4. **Flexibilidade de Negócio**
- Fácil implementar regras de prioridade
- Agendamento por horário
- Diferentes SLAs por plano de usuário

### 5. **Observabilidade**
- Cada etapa registra logs
- Métricas em tempo real
- Rastreamento end-to-end

## 🚀 Próximos Passos

- [Configurar Infraestrutura](./infrastructure.md)
- [Entender Estrutura de Módulos](./modules.md)
- [Implementar Workflows](../guides/01-workflows.md)
- [Configurar WebSockets](../guides/05-websockets.md)

