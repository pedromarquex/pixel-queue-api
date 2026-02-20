# 05 - WebSockets e Notificações em Tempo Real

## 📖 Visão Geral

Implementar notificações em tempo real para informar usuários sobre o progresso e conclusão do processamento de vídeos via WebSocket.

## 🎯 Fluxo

```
Worker processa vídeo → Emite evento → Gateway WebSocket → Cliente recebe notificação
```

## 💻 Implementação

### Passo 1: Instalar Dependências

```bash
yarn add @nestjs/websockets @nestjs/platform-socket.io socket.io
yarn add -D @types/socket.io
```

### Passo 2: Criar WebSocket Gateway

```typescript
// src/modules/notification/notification.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: '*', // Em produção, especifique o domínio
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Mapa de userId → Set de socketIds
  private userConnections = new Map<string, Set<string>>();

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      // Autenticação via token no handshake
      const token = client.handshake.auth.token || client.handshake.headers.authorization;
      
      if (!token) {
        console.warn('[WS] Cliente sem token, desconectando');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token.replace('Bearer ', ''));
      const userId = payload.sub;

      // Associa socket ao userId
      client.data.userId = userId;

      // Adiciona ao mapa de conexões
      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Set());
      }
      this.userConnections.get(userId).add(client.id);

      // Adiciona cliente a uma "room" específica do usuário
      client.join(`user:${userId}`);

      console.log(`[WS] Cliente conectado: userId=${userId}, socketId=${client.id}`);
      
      // Envia confirmação de conexão
      client.emit('connected', {
        message: 'Conectado com sucesso',
        userId,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('[WS] Erro na autenticação:', error.message);
      client.emit('error', { message: 'Autenticação falhou' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    
    if (userId) {
      const connections = this.userConnections.get(userId);
      if (connections) {
        connections.delete(client.id);
        if (connections.size === 0) {
          this.userConnections.delete(userId);
        }
      }
      console.log(`[WS] Cliente desconectado: userId=${userId}, socketId=${client.id}`);
    }
  }

  // Método para enviar notificação para um usuário específico
  notifyUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
    
    console.log(`[WS] Notificação enviada: userId=${userId}, event=${event}`);
  }

  // Método para broadcast para todos
  broadcast(event: string, data: any) {
    this.server.emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  // Obter número de usuários conectados
  getConnectedUsersCount(): number {
    return this.userConnections.size;
  }

  // Verificar se usuário está conectado
  isUserConnected(userId: string): boolean {
    return this.userConnections.has(userId) && this.userConnections.get(userId).size > 0;
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    return { event: 'pong', data: { timestamp: Date.now() } };
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { videoId: string },
  ) {
    // Permite cliente se inscrever em updates de vídeo específico
    client.join(`video:${data.videoId}`);
    return { event: 'subscribed', data: { videoId: data.videoId } };
  }
}
```

### Passo 3: Event Listener para Vídeos Processados

```typescript
// src/modules/notification/listeners/video-processed.listener.ts
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationGateway } from '../notification.gateway';
import { PrismaService } from '../../../providers/prisma/prisma.service';

@Injectable()
export class VideoProcessedListener {
  constructor(
    private notificationGateway: NotificationGateway,
    private prisma: PrismaService,
  ) {}

  @OnEvent('video.processed')
  async handleVideoProcessed(payload: any) {
    const { userId, videoId, processedPaths } = payload;

    console.log(`[Listener] Vídeo processado: ${videoId}`);

    // Busca detalhes do vídeo
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, title: true, status: true },
    });

    // Envia notificação via WebSocket
    this.notificationGateway.notifyUser(userId, 'video.completed', {
      videoId,
      title: video.title,
      message: 'Seu vídeo foi processado com sucesso!',
      status: 'READY',
      processedPaths,
      thumbnail: processedPaths.thumbnail,
    });
  }

  @OnEvent('video.progress')
  async handleVideoProgress(payload: any) {
    const { userId, videoId, progress } = payload;

    // Notifica progresso em tempo real
    this.notificationGateway.notifyUser(userId, 'video.progress', {
      videoId,
      progress, // 0-100
      message: `Processando vídeo: ${progress}%`,
    });
  }

  @OnEvent('video.failed')
  async handleVideoFailed(payload: any) {
    const { userId, videoId, error } = payload;

    this.notificationGateway.notifyUser(userId, 'video.failed', {
      videoId,
      message: 'Falha ao processar vídeo',
      error,
      status: 'FAILED',
    });
  }
}
```

### Passo 4: Atualizar Worker para Emitir Eventos

```typescript
// src/modules/worker/processors/video-processor.worker.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Processor('video-processing', { concurrency: 5 })
export class VideoProcessorWorker extends WorkerHost {
  constructor(private eventEmitter: EventEmitter2) {
    super();
  }

  async process(job: Job): Promise<any> {
    const { userId, videoId, gcsPath } = job.data;

    try {
      // Emite evento de início
      this.eventEmitter.emit('video.started', { userId, videoId });

      // Download
      await this.downloadVideo(gcsPath);
      job.updateProgress(20);
      this.eventEmitter.emit('video.progress', { userId, videoId, progress: 20 });

      // Processamento
      await this.processVideo();
      job.updateProgress(60);
      this.eventEmitter.emit('video.progress', { userId, videoId, progress: 60 });

      // Upload
      const processedPaths = await this.uploadProcessed();
      job.updateProgress(90);
      this.eventEmitter.emit('video.progress', { userId, videoId, progress: 90 });

      // Finalização
      job.updateProgress(100);
      
      // Emite evento de conclusão
      this.eventEmitter.emit('video.processed', {
        userId,
        videoId,
        processedPaths,
      });

      return { success: true, processedPaths };

    } catch (error) {
      // Emite evento de falha
      this.eventEmitter.emit('video.failed', {
        userId,
        videoId,
        error: error.message,
      });
      throw error;
    }
  }

  private async downloadVideo(gcsPath: string) {
    // ...implementação...
  }

  private async processVideo() {
    // ...implementação...
  }

  private async uploadProcessed() {
    // ...implementação...
  }
}
```

### Passo 5: Módulo de Notificações

```typescript
// src/modules/notification/notification.module.ts
import { Module } from '@nestjs/common';
import { NotificationGateway } from './notification.gateway';
import { VideoProcessedListener } from './listeners/video-processed.listener';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../providers/prisma/prisma.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
  ],
  providers: [NotificationGateway, VideoProcessedListener],
  exports: [NotificationGateway],
})
export class NotificationModule {}
```

### Passo 6: Cliente WebSocket (Frontend)

```typescript
// Frontend Example (React/Vue/Angular)
import { io } from 'socket.io-client';

class NotificationService {
  private socket;

  connect(token: string) {
    this.socket = io('http://localhost:3002/notifications', {
      auth: {
        token: token, // JWT token
      },
      transports: ['websocket'],
    });

    this.socket.on('connected', (data) => {
      console.log('Conectado ao WebSocket:', data);
    });

    this.socket.on('video.completed', (data) => {
      console.log('Vídeo processado:', data);
      // Mostrar notificação para o usuário
      this.showNotification('Vídeo pronto!', data.message);
    });

    this.socket.on('video.progress', (data) => {
      console.log('Progresso:', data.progress);
      // Atualizar barra de progresso
      this.updateProgressBar(data.videoId, data.progress);
    });

    this.socket.on('video.failed', (data) => {
      console.error('Falha no processamento:', data);
      // Mostrar erro
      this.showError(data.message);
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    this.socket.on('disconnect', () => {
      console.log('Desconectado do WebSocket');
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  subscribeToVideo(videoId: string) {
    this.socket.emit('subscribe', { videoId });
  }

  private showNotification(title: string, message: string) {
    // Implementação de notificação do navegador
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: message });
    }
  }

  private updateProgressBar(videoId: string, progress: number) {
    // Atualizar UI
  }

  private showError(message: string) {
    // Mostrar erro na UI
  }
}

export default new NotificationService();
```

### Passo 7: GraphQL Subscription (Alternativa)

```typescript
// src/modules/video/video.resolver.ts
import { Resolver, Subscription } from '@nestjs/graphql';
import { PubSub } from 'graphql-subscriptions';
import { Inject } from '@nestjs/common';

const pubSub = new PubSub();

@Resolver()
export class VideoResolver {
  @Subscription(() => VideoProgressPayload, {
    filter: (payload, variables) => {
      // Apenas envia para o usuário dono do vídeo
      return payload.videoProgress.userId === variables.userId;
    },
  })
  videoProgress() {
    return pubSub.asyncIterator('VIDEO_PROGRESS');
  }

  @Subscription(() => VideoCompletedPayload)
  videoCompleted() {
    return pubSub.asyncIterator('VIDEO_COMPLETED');
  }
}

// No Worker, publique:
// pubSub.publish('VIDEO_PROGRESS', { videoProgress: { userId, videoId, progress } });
```

## 📊 Monitoramento de Conexões

```typescript
// src/modules/notification/notification.controller.ts
import { Controller, Get } from '@nestjs/common';
import { NotificationGateway } from './notification.gateway';

@Controller('notifications')
export class NotificationController {
  constructor(private gateway: NotificationGateway) {}

  @Get('stats')
  getStats() {
    return {
      connectedUsers: this.gateway.getConnectedUsersCount(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('test/:userId')
  testNotification(@Param('userId') userId: string) {
    this.gateway.notifyUser(userId, 'test', {
      message: 'Teste de notificação',
    });
    return { sent: true };
  }
}
```

## 🎯 Eventos Disponíveis

| Evento | Direção | Descrição |
|--------|---------|-----------|
| `connected` | Server → Client | Confirmação de conexão |
| `video.started` | Server → Client | Processamento iniciado |
| `video.progress` | Server → Client | Progresso (0-100%) |
| `video.completed` | Server → Client | Vídeo processado |
| `video.failed` | Server → Client | Falha no processamento |
| `ping` | Client → Server | Health check |
| `pong` | Server → Client | Resposta ao ping |
| `subscribe` | Client → Server | Inscrever em vídeo específico |

## 🚀 Próximos Passos

- [Filas Prioritárias](./06-priority-queues.md)
- [GraphQL Schema](../api/graphql-schema.md)

