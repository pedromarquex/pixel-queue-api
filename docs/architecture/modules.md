# Estrutura de Módulos

## 📖 Visão Geral

Documento que define a organização e estrutura dos módulos futuros da aplicação Pixel Queue API.

## 🏗️ Arquitetura de Módulos

```
src/
├── @shared/                    # Código compartilhado
│   ├── entities/              # Entidades do domínio
│   ├── events/                # Eventos do sistema
│   ├── exceptions/            # Exceções customizadas
│   ├── helpers/               # Funções auxiliares
│   └── interceptors/          # Interceptadores
├── @types/                    # Definições de tipos TypeScript
├── decorators/                # Decoradores customizados
├── modules/                   # Módulos da aplicação
│   ├── auth/                 # ✅ IMPLEMENTADO
│   ├── video/                # 🔨 A IMPLEMENTAR
│   ├── scheduler/            # 🔨 A IMPLEMENTAR
│   ├── worker/               # 🔨 A IMPLEMENTAR
│   ├── notification/         # 🔨 A IMPLEMENTAR
│   └── user/                 # 🔨 A IMPLEMENTAR
├── providers/                 # Provedores de serviços
│   ├── prisma/               # ✅ IMPLEMENTADO
│   ├── storage/              # 🔨 A IMPLEMENTAR (GCS)
│   ├── pubsub/               # 🔨 A IMPLEMENTAR
│   ├── redis/                # 🔨 A IMPLEMENTAR
│   └── notification/         # ⚠️ PARCIALMENTE IMPLEMENTADO
├── app.module.ts
└── main.ts
```

## 📦 Módulos Detalhados

### ✅ 1. Auth Module (Implementado)

**Localização:** `src/modules/auth/`

**Responsabilidade:** Autenticação e autorização de usuários

**Estrutura Atual:**
```
auth/
├── auth.module.ts
├── auth.resolver.ts
├── auth.service.ts
├── gql-auth.guard.ts
├── jwt-auth.guard.ts
├── jwt.strategy.ts
├── dto/
│   ├── create-auth.dto.ts
│   ├── login-auth.dto.ts
│   └── update-auth.dto.ts
└── graphql/
    ├── inputs/
    │   ├── login.input.ts
    │   └── register.input.ts
    └── types/
        ├── auth.payload.ts
        └── user.type.ts
```

**Funcionalidades:**
- ✅ Registro de usuários
- ✅ Login com JWT
- ✅ Guards para GraphQL
- ✅ Strategy JWT Passport

---

### 🔨 2. Video Module (A Implementar)

**Localização:** `src/modules/video/`

**Responsabilidade:** Gerenciamento de uploads e consultas de vídeos

**Estrutura Proposta:**
```
video/
├── video.module.ts
├── video.resolver.ts
├── video.service.ts
├── graphql/
│   ├── inputs/
│   │   ├── upload-video.input.ts
│   │   ├── update-video.input.ts
│   │   └── video-filter.input.ts
│   └── types/
│       ├── video.type.ts
│       ├── video-upload.payload.ts
│       ├── video-list.payload.ts
│       └── video-status.enum.ts
└── dto/
    ├── upload-video.dto.ts
    └── video-metadata.dto.ts
```

**GraphQL Schema Proposto:**

```typescript
// graphql/types/video.type.ts
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { VideoStatus } from './video-status.enum';

@ObjectType()
export class VideoType {
  @Field(() => ID)
  id: string;

  @Field()
  title: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  originalPath: string;

  @Field({ nullable: true })
  processedPath?: string;

  @Field({ nullable: true })
  thumbnailPath?: string;

  @Field(() => VideoStatus)
  status: VideoStatus;

  @Field({ nullable: true })
  duration?: number;

  @Field({ nullable: true })
  fileSize?: number;

  @Field({ nullable: true })
  resolution?: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field({ nullable: true })
  processingProgress?: number; // 0-100
}

@ObjectType()
export class VideoUploadPayload {
  @Field()
  success: boolean;

  @Field()
  message: string;

  @Field()
  jobId: string;

  @Field()
  gcsPath: string;
}

@ObjectType()
export class VideoListPayload {
  @Field(() => [VideoType])
  videos: VideoType[];

  @Field()
  total: number;

  @Field()
  page: number;

  @Field()
  pageSize: number;
}
```

```typescript
// graphql/inputs/upload-video.input.ts
import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { GraphQLUpload, FileUpload } from 'graphql-upload';

@InputType()
export class UploadVideoInput {
  @Field(() => GraphQLUpload)
  @IsNotEmpty()
  file: FileUpload;

  @Field()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(1000)
  description?: string;
}

@InputType()
export class VideoFilterInput {
  @Field({ nullable: true })
  @IsOptional()
  status?: string;

  @Field({ nullable: true })
  @IsOptional()
  search?: string;

  @Field({ nullable: true })
  @IsOptional()
  page?: number;

  @Field({ nullable: true })
  @IsOptional()
  pageSize?: number;
}
```

**Resolver Proposto:**

```typescript
// video.resolver.ts
import { Resolver, Mutation, Query, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { VideoService } from './video.service';
import { UploadVideoInput, VideoFilterInput } from './graphql/inputs';
import { VideoType, VideoUploadPayload, VideoListPayload } from './graphql/types';

@Resolver(() => VideoType)
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

  @Query(() => VideoListPayload)
  @UseGuards(GqlAuthGuard)
  async myVideos(
    @Args('filter', { nullable: true }) filter: VideoFilterInput,
    @CurrentUser() user: any,
  ): Promise<VideoListPayload> {
    return this.videoService.getUserVideos(user.id, filter);
  }

  @Query(() => VideoType)
  @UseGuards(GqlAuthGuard)
  async video(
    @Args('id') id: string,
    @CurrentUser() user: any,
  ): Promise<VideoType> {
    return this.videoService.getVideo(id, user.id);
  }

  @Query(() => String)
  @UseGuards(GqlAuthGuard)
  async videoDownloadUrl(
    @Args('id') id: string,
    @CurrentUser() user: any,
  ): Promise<string> {
    return this.videoService.getDownloadUrl(id, user.id);
  }
}
```

**Service Proposto:**

```typescript
// video.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../providers/prisma/prisma.service';
import { StorageProvider } from '../../providers/storage/storage.provider';
import { PubSubProvider } from '../../providers/pubsub/pubsub.provider';
import { UploadVideoInput } from './graphql/inputs/upload-video.input';

@Injectable()
export class VideoService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageProvider,
    private pubsub: PubSubProvider,
  ) {}

  async initiateUpload(input: UploadVideoInput, userId: string) {
    const { createReadStream, filename, mimetype } = await input.file;
    
    // 1. Upload para GCS
    const buffer = await this.streamToBuffer(createReadStream());
    const gcsPath = await this.storage.uploadRaw(userId, buffer, filename);

    // 2. Publica evento no Pub/Sub
    const messageId = await this.pubsub.publishVideoReceived({
      gcsPath,
      userId,
      requestedAt: new Date().toISOString(),
      metadata: {
        title: input.title,
        description: input.description,
      },
    });

    // 3. Cria registro inicial no banco
    await this.prisma.video.create({
      data: {
        userId,
        title: input.title,
        description: input.description,
        originalPath: gcsPath,
        status: 'PENDING',
      },
    });

    return {
      success: true,
      message: 'Vídeo recebido e sendo processado',
      jobId: messageId,
      gcsPath,
    };
  }

  async getUserVideos(userId: string, filter: any) {
    const page = filter?.page || 1;
    const pageSize = filter?.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: any = { userId };

    if (filter?.status) {
      where.status = filter.status;
    }

    if (filter?.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const [videos, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.video.count({ where }),
    ]);

    return {
      videos,
      total,
      page,
      pageSize,
    };
  }

  async getVideo(id: string, userId: string): Promise<VideoType> {
    const video = await this.prisma.video.findFirst({
      where: { id, userId },
    });

    if (!video) {
      throw new NotFoundException('Vídeo não encontrado');
    }

    return video;
  }

  async getDownloadUrl(id: string, userId: string): Promise<string> {
    const video = await this.getVideo(id, userId);
    
    if (!video.processedPath) {
      throw new BusinessException('Vídeo ainda não foi processado');
    }

    return this.storage.getSignedUrl(video.processedPath);
  }

  private async streamToBuffer(stream: any): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}
```

**Module Configuration:**

```typescript
// video.module.ts
import { Module } from '@nestjs/common';
import { VideoResolver } from './video.resolver';
import { VideoService } from './video.service';
import { PrismaModule } from '../../providers/prisma/prisma.module';
import { StorageModule } from '../../providers/storage/storage.module';
import { PubSubModule } from '../../providers/pubsub/pubsub.module';

@Module({
  imports: [PrismaModule, StorageModule, PubSubModule],
  providers: [VideoResolver, VideoService],
  exports: [VideoService],
})
export class VideoModule {}
```

---

### 🔨 3. Scheduler Module (A Implementar)

**Localização:** `src/modules/scheduler/`

**Responsabilidade:** Recebe eventos do Pub/Sub e agenda jobs no BullMQ

**Estrutura Proposta:**
```
scheduler/
├── scheduler.module.ts
├── scheduler.service.ts
├── scheduler.controller.ts  # Para health checks
└── strategies/
    ├── priority.strategy.ts
    └── delay.strategy.ts
```

**Service Proposto:**

```typescript
// scheduler.service.ts
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
    // Escuta subscription do Pub/Sub
    this.pubsub.subscribe('video-received-scheduler', (data) =>
      this.handleVideoReceived(data),
    );
  }

  private async handleVideoReceived(data: any) {
    const { gcsPath, userId, requestedAt, metadata } = data;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, email: true },
    });

    if (!user) {
      console.error(`Usuário ${userId} não encontrado`);
      return;
    }

    const jobOptions = this.calculateJobOptions(user.plan);

    await this.videoQueue.add(
      'process-video',
      {
        gcsPath,
        userId,
        userEmail: user.email,
        userPlan: user.plan,
        metadata,
        requestedAt,
      },
      jobOptions,
    );

    console.log(
      `[Scheduler] Job adicionado: ${gcsPath} (${user.plan})`,
    );
  }

  private calculateJobOptions(plan: string) {
    const baseOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 5000,
      },
    };

    switch (plan) {
      case 'FREE':
        return {
          ...baseOptions,
          delay: this.calculateDelayUntil3AM(),
          priority: 10,
        };
      case 'PREMIUM':
        return {
          ...baseOptions,
          priority: 1,
        };
      default:
        return {
          ...baseOptions,
          priority: 5,
        };
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

---

### 🔨 4. Worker Module (A Implementar)

**Localização:** `src/modules/worker/`

**Responsabilidade:** Processa vídeos (FFmpeg) e salva resultados

**Estrutura Proposta:**
```
worker/
├── worker.module.ts
├── processors/
│   ├── video-processor.worker.ts
│   └── thumbnail-processor.worker.ts
└── services/
    ├── ffmpeg.service.ts
    └── video-metadata.service.ts
```

**Worker Proposto:**

```typescript
// processors/video-processor.worker.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../providers/prisma/prisma.service';
import { StorageProvider } from '../../../providers/storage/storage.provider';
import { FFmpegService } from '../services/ffmpeg.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Processor('video-processing', { concurrency: 5 })
export class VideoProcessorWorker extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private storage: StorageProvider,
    private ffmpeg: FFmpegService,
    private eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    const { gcsPath, userId, userEmail, metadata } = job.data;

    console.log(`[Worker] Processando: ${gcsPath}`);

    try {
      await this.updateStatus(gcsPath, 'PROCESSING');

      // Download
      const inputPath = `/tmp/${job.id}-input.mp4`;
      await this.storage.downloadRaw(gcsPath, inputPath);

      // Processar múltiplas resoluções
      const outputs = await this.ffmpeg.processVideo(inputPath, job);

      // Upload dos processados
      const uploadPromises = outputs.map((output) =>
        this.storage.uploadProcessed(userId, output.path, output.filename),
      );
      const processedPaths = await Promise.all(uploadPromises);

      // Atualizar banco
      await this.prisma.video.updateMany({
        where: { originalPath: gcsPath },
        data: {
          processedPath: processedPaths[0],
          status: 'READY',
        },
      });

      await this.updateStatus(gcsPath, 'COMPLETED');

      // Notificar
      this.eventEmitter.emit('video.processed', {
        userId,
        email: userEmail,
        originalPath: gcsPath,
        processedPaths,
      });

      return { success: true, processedPaths };
    } catch (error) {
      console.error(`[Worker] Erro:`, error);
      await this.updateStatus(gcsPath, 'FAILED', error.message);
      throw error;
    }
  }

  private async updateStatus(gcsPath: string, status: string, error?: string) {
    await this.prisma.videoJob.upsert({
      where: { gcsPath },
      update: { status, error, updatedAt: new Date() },
      create: { gcsPath, status, error },
    });
  }
}
```

---

### 🔨 5. Notification Module (A Implementar)

**Localização:** `src/modules/notification/`

**Responsabilidade:** Notificações em tempo real via WebSocket

**Estrutura Proposta:**
```
notification/
├── notification.module.ts
├── notification.gateway.ts
├── notification.service.ts
└── events/
    └── video-processed.handler.ts
```

**Gateway Proposto:**

```typescript
// notification.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({ cors: true })
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets: Map<string, Set<string>> = new Map();

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(client.id);

      client.join(`user:${userId}`);
      console.log(`Cliente conectado: ${userId}`);
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, sockets] of this.userSockets) {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
    }
  }

  notifyUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
```

---

### 🔨 6. User Module (A Implementar)

**Localização:** `src/modules/user/`

**Responsabilidade:** Gerenciamento de perfil e planos

**Estrutura Proposta:**
```
user/
├── user.module.ts
├── user.resolver.ts
├── user.service.ts
└── graphql/
    ├── inputs/
    │   └── update-profile.input.ts
    └── types/
        ├── user.type.ts
        └── user-stats.type.ts
```

## 🔌 Providers (A Implementar)

### StorageProvider
- `src/providers/storage/storage.provider.ts`
- Integração com Google Cloud Storage

### PubSubProvider
- `src/providers/pubsub/pubsub.provider.ts`
- Integração com Google Pub/Sub

### RedisProvider
- `src/providers/redis/redis.provider.ts`
- Cliente Redis compartilhado

## 🚀 Ordem de Implementação Sugerida

1. **StorageProvider** → Base para upload/download
2. **PubSubProvider** → Base para mensageria
3. **Video Module** → API de entrada
4. **Scheduler Module** → Orquestração
5. **Worker Module** → Processamento
6. **Notification Module** → Feedback ao usuário
7. **User Module** → Gerenciamento de perfil

## 📝 Próximos Passos

- [Ver Setup Completo](../guides/00-setup.md)
- [GraphQL Schema Detalhado](../api/graphql-schema.md)
- [Implementar Workflows](../guides/01-workflows.md)

