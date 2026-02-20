# Diagrama de Fluxo Completo

## 📖 Visão Geral

Diagrama Mermaid mostrando o fluxo completo de processamento de vídeos na arquitetura híbrida Pub/Sub + BullMQ.

## 🔄 Fluxo Principal

```mermaid
graph TD
    %% Definição dos Grupos
    subgraph "Cliente"
        User[("👤 Usuário")]
    end

    subgraph "API Gateway (NestJS)"
        API[API GraphQL]
        Auth[Auth Guard]
        VideoResolver[Video Resolver]
        VideoService[Video Service]
    end

    subgraph "Google Cloud Storage"
        GCSRaw[(GCS Bucket: videos-raw)]
        GCSProcessed[(GCS Bucket: videos-processed)]
    end

    subgraph "Google Pub/Sub"
        TopicReceived[(Tópico: video-received)]
        TopicProcessed[(Tópico: video-processed)]
        SubScheduler[Subscription: scheduler]
        SubNotif[Subscription: notifications]
        SubAnalytics[Subscription: analytics]
        SubAudit[Subscription: audit]
    end

    subgraph "Scheduler Service (NestJS)"
        Scheduler[Scheduler Service]
        PriorityLogic[Lógica de Prioridade]
    end

    subgraph "BullMQ + Redis"
        QueuePremium[(Fila: premium)]
        QueueStandard[(Fila: standard)]
        QueueFree[(Fila: free)]
        Redis[(Redis)]
    end

    subgraph "Workers (NestJS)"
        WorkerPremium[Premium Worker]
        WorkerStandard[Standard Worker]
        WorkerFree[Free Worker]
        FFmpeg[FFmpeg Processor]
    end

    subgraph "Banco de Dados"
        PostgreSQL[(PostgreSQL)]
    end

    subgraph "Notificações"
        WSGateway[WebSocket Gateway]
        EventEmitter[Event Emitter]
    end

    %% Fluxo de Upload
    User -->|1. Upload vídeo| API
    API --> Auth
    Auth -->|Token válido| VideoResolver
    VideoResolver --> VideoService
    VideoService -->|2. Salva vídeo bruto| GCSRaw
    VideoService -->|3. Publica evento| TopicReceived
    VideoService -->|4. Retorna 202 Accepted| User

    %% Fluxo de Agendamento
    TopicReceived --> SubScheduler
    SubScheduler --> Scheduler
    Scheduler --> PriorityLogic
    PriorityLogic -->|Premium| QueuePremium
    PriorityLogic -->|Standard| QueueStandard
    PriorityLogic -->|Free delay 3AM| QueueFree
    QueuePremium --> Redis
    QueueStandard --> Redis
    QueueFree --> Redis

    %% Fluxo de Processamento
    Redis --> WorkerPremium
    Redis --> WorkerStandard
    Redis --> WorkerFree
    WorkerPremium --> FFmpeg
    WorkerStandard --> FFmpeg
    WorkerFree --> FFmpeg
    FFmpeg -->|5. Download| GCSRaw
    FFmpeg -->|6. Processa| FFmpeg
    FFmpeg -->|7. Upload processado| GCSProcessed
    FFmpeg -->|8. Atualiza status| PostgreSQL

    %% Fluxo de Notificação
    FFmpeg --> EventEmitter
    EventEmitter -->|9. Emite evento| TopicProcessed
    TopicProcessed --> SubNotif
    TopicProcessed --> SubAnalytics
    TopicProcessed --> SubAudit
    SubNotif --> WSGateway
    WSGateway -->|10. Notifica WebSocket| User

    %% Estilos
    classDef userStyle fill:#e1f5ff,stroke:#0066cc,stroke-width:2px
    classDef apiStyle fill:#fff4e6,stroke:#ff9800,stroke-width:2px
    classDef storageStyle fill:#f3e5f5,stroke:#9c27b0,stroke-width:2px
    classDef pubsubStyle fill:#e8f5e9,stroke:#4caf50,stroke-width:2px
    classDef queueStyle fill:#fff3e0,stroke:#ff6f00,stroke-width:2px
    classDef workerStyle fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef dbStyle fill:#fce4ec,stroke:#e91e63,stroke-width:2px
    
    class User userStyle
    class API,Auth,VideoResolver,VideoService,Scheduler,PriorityLogic apiStyle
    class GCSRaw,GCSProcessed storageStyle
    class TopicReceived,TopicProcessed,SubScheduler,SubNotif,SubAnalytics,SubAudit pubsubStyle
    class QueuePremium,QueueStandard,QueueFree,Redis queueStyle
    class WorkerPremium,WorkerStandard,WorkerFree,FFmpeg workerStyle
    class PostgreSQL,WSGateway,EventEmitter dbStyle
```

## 📊 Detalhamento por Etapa

### Etapa 1-4: Ingestão (API → Pub/Sub)
- Usuário faz upload via GraphQL
- API valida autenticação
- Vídeo salvo no GCS raw
- Evento publicado no Pub/Sub
- Resposta rápida (202) ao usuário

### Etapa 5: Agendamento (Pub/Sub → BullMQ)
- Scheduler escuta subscription
- Aplica lógica de prioridade baseada em:
  - Plano do usuário (FREE/STANDARD/PREMIUM)
  - Tamanho do arquivo
  - Horário do dia
- Adiciona job na fila apropriada

### Etapa 6-8: Processamento (Workers)
- Worker pega job da fila
- Download do vídeo bruto
- Processamento com FFmpeg
- Upload do vídeo processado
- Atualização do status no PostgreSQL

### Etapa 9-10: Notificação
- Worker emite evento de conclusão
- Pub/Sub distribui para múltiplos subscribers
- WebSocket notifica usuário em tempo real

## 🔀 Fluxo de Retentativas

```mermaid
graph TD
    Worker[Worker] -->|Processa| Success{Sucesso?}
    Success -->|Sim| Complete[Completa Job]
    Success -->|Não| CheckAttempts{Tentativas < 3?}
    CheckAttempts -->|Sim| Delay[Aguarda backoff]
    Delay --> Worker
    CheckAttempts -->|Não| Failed[Move para Failed]
    Failed --> Alert[Alerta Admin]
    Failed --> NotifyUser[Notifica Usuário]
```

## 🚦 Fluxo de Circuit Breaker

```mermaid
stateDiagram-v2
    [*] --> Closed: Estado Normal
    Closed --> Open: 50% de erros
    Open --> HalfOpen: Timeout (2 min)
    HalfOpen --> Closed: Sucesso
    HalfOpen --> Open: Falha
    
    Closed: ✅ Processa normalmente
    Open: 🚫 Bloqueia chamadas
    HalfOpen: 🔄 Testa recuperação
```

## 📈 Fluxo de Prioridades

```mermaid
graph LR
    subgraph "Entrada"
        Upload[Upload de Vídeo]
    end
    
    subgraph "Decisão de Prioridade"
        Upload --> CheckPlan{Plano?}
        CheckPlan -->|Premium| P1[Prioridade 1]
        CheckPlan -->|Standard| P5[Prioridade 5]
        CheckPlan -->|Free| P10[Prioridade 10]
        
        P10 --> CheckTime{Horário?}
        CheckTime -->|3h-6h| Process[Processa]
        CheckTime -->|Outro| Delay[Delay até 3h]
    end
    
    subgraph "Processamento"
        P1 --> QueuePremium[Fila Premium]
        P5 --> QueueStandard[Fila Standard]
        Delay --> QueueFree[Fila Free]
        Process --> QueueFree
        
        QueuePremium --> WorkerP[10 workers]
        QueueStandard --> WorkerS[5 workers]
        QueueFree --> WorkerF[2 workers]
    end
```

## 🌐 Fluxo de Fan-Out

```mermaid
graph TD
    Worker[Worker] -->|Publica| Topic[Tópico: video-processed]
    
    Topic -->|Fan-Out| Sub1[Subscription: notifications]
    Topic -->|Fan-Out| Sub2[Subscription: analytics]
    Topic -->|Fan-Out| Sub3[Subscription: audit]
    
    Sub1 --> Service1[Notification Service]
    Sub2 --> Service2[Analytics Service]
    Sub3 --> Service3[Audit Service]
    
    Service1 --> WS[WebSocket]
    Service1 --> Email[Email]
    
    Service2 --> BigQuery[(BigQuery)]
    
    Service3 --> AuditDB[(Audit Database)]
```

## 🔄 Fluxo de Workflow (Jobs em Cadeia)

```mermaid
graph TD
    Start[Job Parent: process-video] --> Download[Download do GCS]
    
    Download --> Parallel{Processamento Paralelo}
    
    Parallel -->|Child 1| Trans1080[Transcode 1080p]
    Parallel -->|Child 2| Trans720[Transcode 720p]
    Parallel -->|Child 3| Trans480[Transcode 480p]
    Parallel -->|Child 4| Audio[Extrair Áudio MP3]
    
    Trans1080 --> Wait{Aguarda Filhos}
    Trans720 --> Wait
    Trans480 --> Wait
    Audio --> Wait
    
    Wait -->|Todos Concluídos| Thumbs[Gerar Thumbnails]
    Thumbs -->|Child 5| Thumb0[Thumbnail 0%]
    Thumbs -->|Child 6| Thumb50[Thumbnail 50%]
    Thumbs -->|Child 7| Thumb100[Thumbnail 100%]
    
    Thumb0 --> Final{Finalizar}
    Thumb50 --> Final
    Thumb100 --> Final
    
    Final --> UpdateDB[Atualizar Database]
    UpdateDB --> Notify[Notificar Usuário]
```

## 🚀 Próximos Passos

- [Diagrama de Componentes](./components.md)
- [Diagrama de Deployment](./deployment.md)
- [Voltar para Arquitetura](../architecture/hybrid-flow.md)

