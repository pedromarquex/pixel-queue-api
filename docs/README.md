# Documentação Pixel Queue API

## 📚 Índice Geral da Documentação

Bem-vindo à documentação completa do **Pixel Queue API** - um sistema de processamento assíncrono de vídeos com arquitetura híbrida utilizando Google Pub/Sub e BullMQ.

---

## 🎯 Início Rápido

1. **[README Principal](../README.md)** - Visão geral do projeto e quick start
2. **[Setup Completo](./guides/00-setup.md)** - Configuração passo-a-passo detalhada do ambiente

---

## 🏗️ Arquitetura

### Conceitos Fundamentais
- **[Fluxo Híbrido Pub/Sub + BullMQ](./architecture/hybrid-flow.md)**
  - Entenda o "pulo do gato" da arquitetura
  - Componentes principais (API, Pub/Sub, Scheduler, BullMQ, Workers)
  - Fluxo completo passo a passo
  - Tabela comparativa de tecnologias

### Infraestrutura
- **[Infraestrutura](./architecture/infrastructure.md)**
  - Google Cloud Storage (GCS)
  - Google Pub/Sub
  - Redis / BullMQ
  - PostgreSQL / Prisma
  - Variáveis de ambiente
  - Monitoramento

### Organização do Código
- **[Estrutura de Módulos](./architecture/modules.md)**
  - Módulos implementados (Auth)
  - Módulos a implementar (Video, Scheduler, Worker, etc.)
  - Estrutura de pastas e arquivos
  - Ordem de implementação sugerida

---

## 📖 Guias Práticos

### Setup e Configuração
- **[00 - Setup Completo](./guides/00-setup.md)**
  - Pré-requisitos
  - Instalação de dependências
  - Configuração Docker
  - Configuração Google Cloud Platform
  - Variáveis de ambiente
  - Troubleshooting

### Conceitos Avançados
- **[01 - Workflows com BullMQ](./guides/01-workflows.md)**
  - Orquestração de jobs em cadeia
  - Jobs parent/child
  - Processamento paralelo (transcodificação múltiplas resoluções)
  - Monitoramento de workflows

- **[02 - Fan-Out / Fan-In](./guides/02-fan-out-fan-in.md)**
  - Múltiplas subscriptions Pub/Sub
  - Processamento paralelo por subscribers
  - Agregação de resultados
  - Casos de uso (notificações, analytics, audit)

- **[03 - Back-Pressure e Controle de Carga](./guides/03-back-pressure.md)**
  - Controle de concorrência
  - Rate limiting
  - Pausar/retomar filas
  - Auto-scaling baseado em carga
  - Métricas de saúde

- **[04 - Circuit Breaker](./guides/04-circuit-breaker.md)**
  - Prevenção de falhas em cascata
  - Estados do circuit breaker
  - Proteção de serviços externos (GCS, Pub/Sub)
  - Alertas automáticos
  - Recuperação gradual

- **[05 - WebSockets e Notificações em Tempo Real](./guides/05-websockets.md)**
  - Implementação de WebSocket Gateway
  - Autenticação via JWT
  - Eventos de progresso e conclusão
  - Cliente JavaScript
  - GraphQL Subscriptions

- **[06 - Filas Prioritárias](./guides/06-priority-queues.md)**
  - Prioridades por plano (FREE, STANDARD, PREMIUM)
  - Múltiplas filas
  - Workers com concorrência diferenciada
  - SLA tracking
  - Agendamento por horário

---

## 🔌 API Reference

### GraphQL
- **[GraphQL Schema](./api/graphql-schema.md)**
  - Types completos
  - Mutations (register, login, uploadVideo)
  - Queries (me, myVideos, video, videoDownloadUrl)
  - Subscriptions (videoProgress, videoCompleted)
  - Scalar types customizados

- **[Exemplos de Requests](./api/examples.md)**
  - Fluxo completo de uso
  - Upload de vídeo
  - Listagem e filtros
  - WebSocket subscriptions
  - Tratamento de erros

---

## 📊 Diagramas

### Visualizações da Arquitetura
- **[Fluxo Completo](./diagrams/flow.md)**
  - Diagrama Mermaid do fluxo principal
  - Fluxo de retentativas
  - Fluxo de circuit breaker
  - Fluxo de prioridades
  - Fluxo de fan-out
  - Workflow de jobs em cadeia

- **[Componentes](./diagrams/components.md)**
  - Arquitetura de componentes
  - Camadas (Frontend, API Gateway, Application, Providers, External)
  - Relações e dependências
  - Padrões arquiteturais utilizados

- **[Deployment](./diagrams/deployment.md)**
  - Arquitetura de produção (GCP)
  - Arquitetura de desenvolvimento local
  - Especificações de recursos
  - CI/CD pipeline
  - Monitoramento e observabilidade
  - Estimativa de custos

---

## 🗺️ Navegação por Objetivo

### Quero entender a arquitetura
1. [Fluxo Híbrido](./architecture/hybrid-flow.md) - Comece aqui
2. [Diagrama de Fluxo](./diagrams/flow.md) - Visualização
3. [Componentes](./diagrams/components.md) - Organização
4. [Infraestrutura](./architecture/infrastructure.md) - Tecnologias

### Quero configurar o ambiente
1. [Setup Completo](./guides/00-setup.md) - Passo-a-passo
2. [Infraestrutura](./architecture/infrastructure.md) - Detalhes técnicos
3. [Estrutura de Módulos](./architecture/modules.md) - Organização do código

### Quero usar a API
1. [GraphQL Schema](./api/graphql-schema.md) - Referência completa
2. [Exemplos de Requests](./api/examples.md) - Casos práticos
3. [WebSockets](./guides/05-websockets.md) - Notificações em tempo real

### Quero implementar features avançadas
1. [Workflows](./guides/01-workflows.md) - Jobs em cadeia
2. [Fan-Out/Fan-In](./guides/02-fan-out-fan-in.md) - Processamento distribuído
3. [Back-Pressure](./guides/03-back-pressure.md) - Controle de carga
4. [Circuit Breaker](./guides/04-circuit-breaker.md) - Resiliência
5. [Filas Prioritárias](./guides/06-priority-queues.md) - SLAs diferenciados

### Quero fazer deploy em produção
1. [Deployment](./diagrams/deployment.md) - Arquitetura GCP
2. [Infraestrutura](./architecture/infrastructure.md) - Configurações
3. [Monitoramento](./architecture/infrastructure.md#monitoramento) - Observabilidade

---

## 🔑 Conceitos-Chave

### Google Pub/Sub (O "Carteiro")
- **Função:** Ingestão de eventos
- **Características:** Massivamente escalável, assíncrono, desacoplado
- **Uso:** Receber notificação de upload, distribuir para múltiplos subscribers

### BullMQ (O "Gerente")
- **Função:** Processamento e agendamento
- **Características:** Prioridades, delays, retentativas, concorrência
- **Uso:** Gerenciar execução de jobs de processamento de vídeo

### Arquitetura Híbrida
- **Pub/Sub:** Ingestão rápida e distribuição
- **BullMQ:** Controle fino de processamento
- **Benefício:** Melhor dos dois mundos - escalabilidade + controle

---

## 📦 Tecnologias Principais

| Tecnologia | Função |
|------------|--------|
| **NestJS** | Framework Node.js/TypeScript |
| **GraphQL** | API tipada e eficiente |
| **Google Pub/Sub** | Mensageria distribuída |
| **BullMQ** | Sistema de filas |
| **Redis** | Cache e persistência de filas |
| **PostgreSQL** | Banco de dados relacional |
| **Prisma** | ORM moderno |
| **Google Cloud Storage** | Armazenamento de arquivos |
| **FFmpeg** | Processamento de vídeo |
| **Socket.IO** | WebSockets |
| **Docker** | Containerização |

---

## 🎓 Recursos de Aprendizado

### Para Iniciantes
1. Leia o [README](../README.md)
2. Siga o [Setup Completo](./guides/00-setup.md)
3. Entenda o [Fluxo Híbrido](./architecture/hybrid-flow.md)
4. Teste a [API GraphQL](./api/examples.md)

### Para Desenvolvedores
1. Estude a [Estrutura de Módulos](./architecture/modules.md)
2. Implemente [Workflows](./guides/01-workflows.md)
3. Configure [WebSockets](./guides/05-websockets.md)
4. Adicione [Filas Prioritárias](./guides/06-priority-queues.md)

### Para Arquitetos
1. Analise os [Componentes](./diagrams/components.md)
2. Revise o [Deployment](./diagrams/deployment.md)
3. Implemente [Circuit Breaker](./guides/04-circuit-breaker.md)
4. Configure [Back-Pressure](./guides/03-back-pressure.md)

---

## 📞 Suporte

- **Issues:** [GitHub Issues](https://github.com/your-org/pixel-queue-api/issues)
- **Documentação:** Este diretório `/docs`
- **API:** `http://localhost:3002/graphql` (GraphQL Playground)

---

## 📝 Contribuindo

Veja [CONTRIBUTING.md](../CONTRIBUTING.md) para detalhes sobre como contribuir com o projeto.

---

**Última atualização:** Fevereiro 2026

