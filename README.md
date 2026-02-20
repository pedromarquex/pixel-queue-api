# Pixel Queue API

[![CI](https://github.com/pedromarquex/pixel-queue-api/workflows/CI/badge.svg)](https://github.com/pedromarquex/pixel-queue-api/actions)

API de processamento assíncrono de vídeos utilizando arquitetura híbrida com **Google Pub/Sub** para ingestão e **BullMQ** para processamento. Sistema escalável construído com NestJS, GraphQL, Redis e Google Cloud Platform.

## 🎯 Visão Geral

Sistema de processamento de vídeos que combina o melhor de dois mundos:
- **Google Pub/Sub**: Ingestão global e massivamente escalável de eventos
- **BullMQ**: Gerenciamento inteligente de processamento com prioridades, agendamento e retentativas
- **GraphQL**: Interface moderna e tipada para comunicação com a API

## 🚀 Tech Stack Principal

- **[NestJS](https://nestjs.com/)** - Framework Node.js progressivo com TypeScript
- **[GraphQL](https://graphql.org/)** - API tipada e eficiente com Apollo Server
- **[Google Pub/Sub](https://cloud.google.com/pubsub)** - Sistema de mensageria distribuído para ingestão
- **[BullMQ](https://docs.bullmq.io/)** - Fila de processamento com Redis
- **[Prisma](https://www.prisma.io/)** - ORM moderno para TypeScript/PostgreSQL
- **[Google Cloud Storage](https://cloud.google.com/storage)** - Armazenamento de vídeos (raw e processados)
- **[Redis](https://redis.io/)** - Cache e gerenciamento de filas
- **[PostgreSQL](https://www.postgresql.org/)** - Banco de dados relacional

## 📦 Quick Start

```bash
# 1. Clone e instale dependências
git clone <repository-url>
cd pixel-queue-api
yarn install

# 2. Configure ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# 3. Suba infraestrutura (Docker)
make up-dev

# 4. Execute migrações
npx prisma migrate dev

# 5. Inicie a aplicação
yarn dev
```

Acesse: `http://localhost:3002/graphql` para o GraphQL Playground

## 📚 Documentação Completa

Toda a documentação técnica está organizada na pasta [`docs/`](./docs):

### Arquitetura
- [**Fluxo Híbrido Pub/Sub + BullMQ**](./docs/architecture/hybrid-flow.md) - Entenda o fluxo completo da arquitetura
- [**Infraestrutura**](./docs/architecture/infrastructure.md) - Configuração de GCP, Redis, PostgreSQL
- [**Estrutura de Módulos**](./docs/architecture/modules.md) - Organização dos módulos da aplicação

### Guias Práticos
- [**00 - Setup Completo**](./docs/guides/00-setup.md) - Configuração passo-a-passo detalhada
- [**01 - Workflows com BullMQ**](./docs/guides/01-workflows.md) - Orquestração de jobs em cadeia
- [**02 - Fan-Out/Fan-In**](./docs/guides/02-fan-out-fan-in.md) - Múltiplas subscriptions Pub/Sub
- [**03 - Back-Pressure**](./docs/guides/03-back-pressure.md) - Controle de carga e concorrência
- [**04 - Circuit Breaker**](./docs/guides/04-circuit-breaker.md) - Resiliência e tratamento de falhas
- [**05 - WebSockets**](./docs/guides/05-websockets.md) - Notificações em tempo real
- [**06 - Filas Prioritárias**](./docs/guides/06-priority-queues.md) - Gerenciamento de prioridades

### API
- [**GraphQL Schema**](./docs/api/graphql-schema.md) - Queries, Mutations e Types
- [**Exemplos de Requests**](./docs/api/examples.md) - Exemplos práticos de uso

### Diagramas
- [**Fluxo Completo**](./docs/diagrams/flow.md) - Diagrama Mermaid do fluxo de processamento
- [**Componentes**](./docs/diagrams/components.md) - Arquitetura de componentes
- [**Deployment**](./docs/diagrams/deployment.md) - Arquitetura de deployment

## 🔑 Principais Recursos

- ✅ **Ingestão Massivamente Escalável** via Google Pub/Sub
- ✅ **Processamento Inteligente** com BullMQ (prioridades, agendamento, retentativas)
- ✅ **API GraphQL** tipada e moderna
- ✅ **Autenticação JWT** com sistema de permissões
- ✅ **Processamento de Vídeo** com FFmpeg
- ✅ **Armazenamento em Cloud** (Google Cloud Storage)
- ✅ **Notificações em Tempo Real** via WebSockets
- ✅ **Filas Prioritárias** (Premium vs Free users)
- ✅ **Circuit Breaker** para resiliência
- ✅ **Monitoramento** e observabilidade

## 🏗️ Arquitetura

```
┌─────────────┐      ┌──────────────┐      ┌───────────┐      ┌───────────┐
│   Client    │─────▶│     API      │─────▶│  Pub/Sub  │─────▶│ Scheduler │
│  (GraphQL)  │◀─────│   (NestJS)   │      │  (Topic)  │      │ (NestJS)  │
└─────────────┘      └──────────────┘      └───────────┘      └─────┬─────┘
                            │                                        │
                            ▼                                        ▼
                     ┌─────────────┐                         ┌──────────┐
                     │     GCS     │                         │  BullMQ  │
                     │  (Storage)  │                         │  (Redis) │
                     └─────────────┘                         └────┬─────┘
                            ▲                                      │
                            │                                      ▼
                     ┌──────┴──────┐                        ┌──────────┐
                     │   Worker    │◀───────────────────────│PostgreSQL│
                     │  (Process)  │                        │   (DB)   │
                     └─────────────┘                        └──────────┘
```

## 🤝 Contribuindo

Veja [CONTRIBUTING.md](./CONTRIBUTING.md) para detalhes sobre o processo de contribuição.

## 📄 Licença

Este projeto está sob a licença UNLICENSED - veja [LICENSE](./LICENSE) para detalhes.

---

**📖 Leia a [documentação completa](./docs) para entender todos os detalhes da arquitetura e implementação.**
