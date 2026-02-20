# Infraestrutura

## 📖 Visão Geral

Documentação completa de configuração e provisionamento de toda a infraestrutura necessária para o Pixel Queue API.

## 🗄️ Google Cloud Storage (GCS)

### Buckets Necessários

#### 1. `pixel-queue-videos-raw`
**Propósito:** Armazenar vídeos brutos enviados pelos usuários

**Configuração:**
```bash
# Criar bucket
gsutil mb -p pixel-queue-project -c STANDARD -l us-central1 gs://pixel-queue-videos-raw

# Configurar lifecycle (deletar após 30 dias)
gsutil lifecycle set lifecycle-raw.json gs://pixel-queue-videos-raw
```

**lifecycle-raw.json:**
```json
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {
          "age": 30,
          "matchesPrefix": [""]
        }
      }
    ]
  }
}
```

**Estrutura de Paths:**
```
gs://pixel-queue-videos-raw/
  └── {userId}/
      └── {timestamp}-{filename}.mp4
```

#### 2. `pixel-queue-videos-processed`
**Propósito:** Armazenar vídeos processados

**Configuração:**
```bash
# Criar bucket
gsutil mb -p pixel-queue-project -c STANDARD -l us-central1 gs://pixel-queue-videos-processed

# Configurar CORS para acesso direto
gsutil cors set cors.json gs://pixel-queue-videos-processed
```

**cors.json:**
```json
[
  {
    "origin": ["https://yourdomain.com"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

**Estrutura de Paths:**
```
gs://pixel-queue-videos-processed/
  └── processed/
      └── {userId}/
          ├── {timestamp}-1080p.mp4
          ├── {timestamp}-720p.mp4
          ├── {timestamp}-480p.mp4
          └── {timestamp}-thumbnail.jpg
```

### Service Account

```bash
# Criar service account
gcloud iam service-accounts create pixel-queue-storage \
  --display-name="Pixel Queue Storage Account"

# Dar permissões aos buckets
gsutil iam ch serviceAccount:pixel-queue-storage@pixel-queue-project.iam.gserviceaccount.com:objectAdmin \
  gs://pixel-queue-videos-raw

gsutil iam ch serviceAccount:pixel-queue-storage@pixel-queue-project.iam.gserviceaccount.com:objectAdmin \
  gs://pixel-queue-videos-processed

# Gerar chave JSON
gcloud iam service-accounts keys create gcs-key.json \
  --iam-account=pixel-queue-storage@pixel-queue-project.iam.gserviceaccount.com
```

### Código de Integração

```typescript
// src/providers/storage/storage.provider.ts
import { Injectable } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageProvider {
  private storage: Storage;
  private rawBucket: string;
  private processedBucket: string;

  constructor(private configService: ConfigService) {
    this.storage = new Storage({
      keyFilename: this.configService.get('GCS_KEY_FILE'),
      projectId: this.configService.get('GCP_PROJECT_ID'),
    });

    this.rawBucket = 'pixel-queue-videos-raw';
    this.processedBucket = 'pixel-queue-videos-processed';
  }

  async uploadRaw(userId: string, file: Buffer, filename: string): Promise<string> {
    const destination = `${userId}/${Date.now()}-${filename}`;
    const bucket = this.storage.bucket(this.rawBucket);
    
    await bucket.file(destination).save(file, {
      metadata: {
        contentType: 'video/mp4',
        metadata: { userId },
      },
    });

    return `gs://${this.rawBucket}/${destination}`;
  }

  async downloadRaw(gcsPath: string, destPath: string): Promise<void> {
    const [bucketName, ...filePath] = gcsPath.replace('gs://', '').split('/');
    await this.storage
      .bucket(bucketName)
      .file(filePath.join('/'))
      .download({ destination: destPath });
  }

  async uploadProcessed(userId: string, localPath: string, filename: string): Promise<string> {
    const destination = `processed/${userId}/${filename}`;
    await this.storage
      .bucket(this.processedBucket)
      .upload(localPath, { destination });

    return `gs://${this.processedBucket}/${destination}`;
  }

  async getSignedUrl(gcsPath: string, expiresIn: number = 3600): Promise<string> {
    const [bucketName, ...filePath] = gcsPath.replace('gs://', '').split('/');
    const [url] = await this.storage
      .bucket(bucketName)
      .file(filePath.join('/'))
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresIn * 1000,
      });

    return url;
  }
}
```

## 📮 Google Pub/Sub

### Tópicos e Subscriptions

#### 1. Tópico: `video-received`

```bash
# Criar tópico
gcloud pubsub topics create video-received \
  --project=pixel-queue-project

# Criar subscription para o Scheduler
gcloud pubsub subscriptions create video-received-scheduler \
  --topic=video-received \
  --ack-deadline=60 \
  --message-retention-duration=7d \
  --expiration-period=never
```

#### 2. Tópico: `video-processed` (para Fan-Out)

```bash
# Criar tópico
gcloud pubsub topics create video-processed \
  --project=pixel-queue-project

# Subscription 1: Notificações
gcloud pubsub subscriptions create video-processed-notifications \
  --topic=video-processed \
  --ack-deadline=30

# Subscription 2: Analytics
gcloud pubsub subscriptions create video-processed-analytics \
  --topic=video-processed \
  --ack-deadline=30

# Subscription 3: Audit Log
gcloud pubsub subscriptions create video-processed-audit \
  --topic=video-processed \
  --ack-deadline=30
```

### Service Account

```bash
# Criar service account
gcloud iam service-accounts create pixel-queue-pubsub \
  --display-name="Pixel Queue Pub/Sub Account"

# Dar permissões
gcloud projects add-iam-policy-binding pixel-queue-project \
  --member="serviceAccount:pixel-queue-pubsub@pixel-queue-project.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding pixel-queue-project \
  --member="serviceAccount:pixel-queue-pubsub@pixel-queue-project.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"

# Gerar chave
gcloud iam service-accounts keys create pubsub-key.json \
  --iam-account=pixel-queue-pubsub@pixel-queue-project.iam.gserviceaccount.com
```

### Código de Integração

```typescript
// src/providers/pubsub/pubsub.provider.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PubSub, Topic, Subscription } from '@google-cloud/pubsub';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PubSubProvider implements OnModuleInit, OnModuleDestroy {
  private client: PubSub;
  private topics: Map<string, Topic> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();

  constructor(private configService: ConfigService) {
    this.client = new PubSub({
      keyFilename: this.configService.get('PUBSUB_KEY_FILE'),
      projectId: this.configService.get('GCP_PROJECT_ID'),
    });
  }

  async onModuleInit() {
    // Inicializa tópicos
    this.topics.set('video-received', this.client.topic('video-received'));
    this.topics.set('video-processed', this.client.topic('video-processed'));
  }

  async publishVideoReceived(data: any): Promise<string> {
    const topic = this.topics.get('video-received');
    const messageId = await topic.publishMessage({
      json: data,
      attributes: {
        eventType: 'video.received',
        timestamp: new Date().toISOString(),
      },
    });
    return messageId;
  }

  async publishVideoProcessed(data: any): Promise<string> {
    const topic = this.topics.get('video-processed');
    const messageId = await topic.publishMessage({
      json: data,
      attributes: {
        eventType: 'video.processed',
        timestamp: new Date().toISOString(),
      },
    });
    return messageId;
  }

  subscribe(subscriptionName: string, handler: (message: any) => Promise<void>) {
    const subscription = this.client.subscription(subscriptionName);
    
    subscription.on('message', async (message) => {
      try {
        const data = JSON.parse(message.data.toString());
        await handler(data);
        message.ack();
      } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        message.nack();
      }
    });

    subscription.on('error', (error) => {
      console.error('Erro na subscription:', error);
    });

    this.subscriptions.set(subscriptionName, subscription);
  }

  async onModuleDestroy() {
    // Fecha todas as subscriptions
    for (const [name, subscription] of this.subscriptions) {
      await subscription.close();
      console.log(`Subscription ${name} fechada`);
    }
  }
}
```

## 🔴 Redis

### Configuração Docker (Desenvolvimento)

```yaml
# infra/docker-compose.dev.yaml (já existe)
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

volumes:
  redis_data:
```

### Configuração Produção (Google Cloud Memorystore)

```bash
# Criar instância Redis
gcloud redis instances create pixel-queue-redis \
  --size=5 \
  --region=us-central1 \
  --redis-version=redis_7_0 \
  --tier=standard

# Obter IP de conexão
gcloud redis instances describe pixel-queue-redis \
  --region=us-central1 \
  --format="get(host)"
```

### Código de Integração

```typescript
// src/providers/redis/redis.provider.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisProvider {
  private client: Redis;

  constructor(private configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get('REDIS_HOST'),
      port: this.configService.get('REDIS_PORT'),
      password: this.configService.get('REDIS_PASSWORD'),
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('connect', () => {
      console.log('Redis conectado com sucesso');
    });

    this.client.on('error', (err) => {
      console.error('Erro no Redis:', err);
    });
  }

  getClient(): Redis {
    return this.client;
  }
}
```

## 🐂 BullMQ

### Configuração de Filas

```typescript
// src/modules/video/video.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VideoProcessorWorker } from './video-processor.worker';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'video-processing',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 86400, // 24 horas
          count: 1000,
        },
        removeOnFail: {
          age: 604800, // 7 dias
        },
      },
    }),
  ],
  providers: [VideoProcessorWorker],
})
export class VideoModule {}
```

### Configuração do Worker

```typescript
// src/config/bullmq.config.ts
import { ConfigService } from '@nestjs/config';
import { BullModuleOptions } from '@nestjs/bullmq';

export const getBullMQConfig = (configService: ConfigService): BullModuleOptions => ({
  connection: {
    host: configService.get('REDIS_HOST'),
    port: configService.get('REDIS_PORT'),
    password: configService.get('REDIS_PASSWORD'),
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});
```

## 🐘 PostgreSQL

### Schema Prisma

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String?
  plan      UserPlan @default(FREE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  videos    Video[]
  
  @@map("users")
}

enum UserPlan {
  FREE
  STANDARD
  PREMIUM
}

model Video {
  id             String      @id @default(uuid())
  userId         String
  title          String
  description    String?
  originalPath   String      // gs://bucket/path
  processedPath  String?     // gs://bucket/path
  thumbnailPath  String?
  status         VideoStatus @default(PENDING)
  duration       Int?        // segundos
  fileSize       Int?        // bytes
  resolution     String?     // ex: "1920x1080"
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  
  user           User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobs           VideoJob[]
  
  @@map("videos")
  @@index([userId])
  @@index([status])
}

enum VideoStatus {
  PENDING
  PROCESSING
  READY
  FAILED
}

model VideoJob {
  id        String   @id @default(uuid())
  videoId   String?
  gcsPath   String   @unique
  status    String
  error     String?
  progress  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  video     Video?   @relation(fields: [videoId], references: [id], onDelete: SetNull)
  
  @@map("video_jobs")
  @@index([status])
  @@index([gcsPath])
}
```

### Migrations

```bash
# Criar migration
npx prisma migrate dev --name add_video_tables

# Aplicar em produção
npx prisma migrate deploy
```

### Configuração Docker (Desenvolvimento)

```yaml
# infra/docker-compose.dev.yaml (complemento)
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pixel_queue
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: pixel_queue_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pixel_queue"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### Configuração Produção (Cloud SQL)

```bash
# Criar instância
gcloud sql instances create pixel-queue-db \
  --database-version=POSTGRES_16 \
  --tier=db-custom-2-7680 \
  --region=us-central1

# Criar database
gcloud sql databases create pixel_queue_db \
  --instance=pixel-queue-db

# Criar usuário
gcloud sql users create pixel_queue \
  --instance=pixel-queue-db \
  --password=STRONG_PASSWORD
```

## 🔐 Variáveis de Ambiente

```bash
# .env.example
# Application
NODE_ENV=development
APP_PORT=3002

# Database
DATABASE_URL="postgresql://pixel_queue:dev_password@localhost:5432/pixel_queue_db?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRATION_TIME=86400

# Google Cloud Platform
GCP_PROJECT_ID=pixel-queue-project
GCS_KEY_FILE=/path/to/gcs-key.json
PUBSUB_KEY_FILE=/path/to/pubsub-key.json

# Google Cloud Storage
GCS_BUCKET_RAW=pixel-queue-videos-raw
GCS_BUCKET_PROCESSED=pixel-queue-videos-processed

# Pub/Sub
PUBSUB_TOPIC_VIDEO_RECEIVED=video-received
PUBSUB_SUBSCRIPTION_SCHEDULER=video-received-scheduler

# BullMQ
BULLMQ_CONCURRENCY=5

# FFmpeg (opcional)
FFMPEG_PATH=/usr/bin/ffmpeg
```

## 📊 Monitoramento

### Google Cloud Monitoring

```bash
# Habilitar APIs
gcloud services enable monitoring.googleapis.com
gcloud services enable logging.googleapis.com

# Criar dashboard
gcloud monitoring dashboards create --config-from-file=dashboard.json
```

### Métricas Importantes

1. **Pub/Sub:**
   - Mensagens não confirmadas
   - Taxa de publicação
   - Latência de entrega

2. **BullMQ:**
   - Jobs ativos
   - Jobs falhados
   - Taxa de processamento
   - Latência média

3. **GCS:**
   - Uso de armazenamento
   - Requisições/segundo
   - Latência de upload/download

4. **PostgreSQL:**
   - Conexões ativas
   - Tempo de query
   - Uso de disco

## 🚀 Próximos Passos

- [Estrutura de Módulos](./modules.md)
- [Setup Completo Local](../guides/00-setup.md)
- [Implementar Circuit Breaker](../guides/04-circuit-breaker.md)

