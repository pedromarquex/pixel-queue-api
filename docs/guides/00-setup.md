# 00 - Setup Completo

## 📖 Visão Geral

Guia passo-a-passo completo para configurar o ambiente de desenvolvimento do Pixel Queue API do zero.

## 📋 Pré-requisitos

### Software Necessário

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Yarn** 1.22+ ([Instalação](https://yarnpkg.com/getting-started/install))
- **Docker** & **Docker Compose** ([Download](https://www.docker.com/products/docker-desktop))
- **Git** ([Download](https://git-scm.com/))
- **Google Cloud SDK** (gcloud CLI) ([Instalação](https://cloud.google.com/sdk/docs/install))
- **FFmpeg** (opcional para testes locais) ([Download](https://ffmpeg.org/download.html))

### Contas Necessárias

- ✅ **Google Cloud Platform** (com projeto criado)
- ✅ **Conta com cartão de crédito** (para GCP - período grátis disponível)

## 🚀 Passo 1: Clonar o Repositório

```bash
# Clone o projeto
git clone https://github.com/your-org/pixel-queue-api.git
cd pixel-queue-api

# Verifique a branch
git checkout main
```

## 📦 Passo 2: Instalar Dependências

```bash
# Instalar dependências com Yarn
yarn install

# Ou com npm
npm install
```

## 🐳 Passo 3: Configurar Docker (Infraestrutura Local)

### 3.1 Subir PostgreSQL e Redis

```bash
# Subir apenas infraestrutura (PostgreSQL + Redis)
make up-dev

# Ou manualmente:
docker-compose -f infra/docker-compose.dev.yaml up -d
```

### 3.2 Verificar se os serviços estão rodando

```bash
# Verificar containers ativos
docker ps

# Deve mostrar:
# - postgres:16-alpine (porta 5432)
# - redis:7-alpine (porta 6379)
```

### 3.3 Testar conexões

```bash
# Testar PostgreSQL
docker exec -it pixel-queue-postgres psql -U pixel_queue -d pixel_queue_db -c "SELECT 1;"

# Testar Redis
docker exec -it pixel-queue-redis redis-cli ping
# Resposta esperada: PONG
```

## ☁️ Passo 4: Configurar Google Cloud Platform

### 4.1 Criar Projeto GCP

```bash
# Login no GCP
gcloud auth login

# Criar novo projeto
gcloud projects create pixel-queue-project --name="Pixel Queue API"

# Configurar projeto padrão
gcloud config set project pixel-queue-project

# Habilitar faturamento (necessário!)
# Acesse: https://console.cloud.google.com/billing
```

### 4.2 Habilitar APIs Necessárias

```bash
# Habilitar APIs
gcloud services enable storage.googleapis.com
gcloud services enable pubsub.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable compute.googleapis.com
```

### 4.3 Criar Service Accounts

#### Storage Service Account

```bash
# Criar service account para Storage
gcloud iam service-accounts create pixel-queue-storage \
  --display-name="Pixel Queue Storage"

# Dar permissões de Storage Admin
gcloud projects add-iam-policy-binding pixel-queue-project \
  --member="serviceAccount:pixel-queue-storage@pixel-queue-project.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Gerar chave JSON
gcloud iam service-accounts keys create ./credentials/gcs-key.json \
  --iam-account=pixel-queue-storage@pixel-queue-project.iam.gserviceaccount.com

echo "✅ Chave salva em: ./credentials/gcs-key.json"
```

#### Pub/Sub Service Account

```bash
# Criar service account para Pub/Sub
gcloud iam service-accounts create pixel-queue-pubsub \
  --display-name="Pixel Queue Pub/Sub"

# Dar permissões de Publisher e Subscriber
gcloud projects add-iam-policy-binding pixel-queue-project \
  --member="serviceAccount:pixel-queue-pubsub@pixel-queue-project.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding pixel-queue-project \
  --member="serviceAccount:pixel-queue-pubsub@pixel-queue-project.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"

# Gerar chave JSON
gcloud iam service-accounts keys create ./credentials/pubsub-key.json \
  --iam-account=pixel-queue-pubsub@pixel-queue-project.iam.gserviceaccount.com

echo "✅ Chave salva em: ./credentials/pubsub-key.json"
```

### 4.4 Criar Buckets no Google Cloud Storage

```bash
# Criar diretório de credenciais
mkdir -p credentials

# Bucket para vídeos RAW
gsutil mb -p pixel-queue-project -c STANDARD -l us-central1 gs://pixel-queue-videos-raw

# Bucket para vídeos PROCESSADOS
gsutil mb -p pixel-queue-project -c STANDARD -l us-central1 gs://pixel-queue-videos-processed

# Configurar CORS no bucket de processados
cat > cors.json << EOF
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
EOF

gsutil cors set cors.json gs://pixel-queue-videos-processed

# Configurar lifecycle (deletar vídeos raw após 30 dias)
cat > lifecycle-raw.json << EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": 30}
      }
    ]
  }
}
EOF

gsutil lifecycle set lifecycle-raw.json gs://pixel-queue-videos-raw

echo "✅ Buckets criados com sucesso"
```

### 4.5 Criar Tópicos e Subscriptions no Pub/Sub

```bash
# Criar tópico principal
gcloud pubsub topics create video-received

# Criar subscription para o Scheduler
gcloud pubsub subscriptions create video-received-scheduler \
  --topic=video-received \
  --ack-deadline=60 \
  --message-retention-duration=7d \
  --expiration-period=never

# Criar tópico para vídeos processados
gcloud pubsub topics create video-processed

# Criar subscriptions para Fan-Out
gcloud pubsub subscriptions create video-processed-notifications \
  --topic=video-processed \
  --ack-deadline=30

gcloud pubsub subscriptions create video-processed-analytics \
  --topic=video-processed \
  --ack-deadline=30

echo "✅ Pub/Sub configurado com sucesso"
```

## 🔐 Passo 5: Configurar Variáveis de Ambiente

### 5.1 Copiar arquivo de exemplo

```bash
cp .env.example .env
```

### 5.2 Editar .env

```bash
# Abrir arquivo para edição
nano .env
# ou
code .env
```

### 5.3 Preencher variáveis

```bash
# Application
NODE_ENV=development
APP_PORT=3002

# Database (Docker local)
DATABASE_URL="postgresql://pixel_queue:dev_password@localhost:5432/pixel_queue_db?schema=public"

# Redis (Docker local)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=super-secret-change-me-in-production-$(openssl rand -base64 32)
JWT_EXPIRATION_TIME=86400

# Google Cloud Platform
GCP_PROJECT_ID=pixel-queue-project
GCS_KEY_FILE=./credentials/gcs-key.json
PUBSUB_KEY_FILE=./credentials/pubsub-key.json

# Google Cloud Storage
GCS_BUCKET_RAW=pixel-queue-videos-raw
GCS_BUCKET_PROCESSED=pixel-queue-videos-processed

# Pub/Sub
PUBSUB_TOPIC_VIDEO_RECEIVED=video-received
PUBSUB_SUBSCRIPTION_SCHEDULER=video-received-scheduler
PUBSUB_TOPIC_VIDEO_PROCESSED=video-processed

# BullMQ
BULLMQ_CONCURRENCY=5

# FFmpeg (deixe vazio para usar do PATH)
FFMPEG_PATH=/usr/local/bin/ffmpeg
```

### 5.4 Validar credenciais

```bash
# Testar credenciais do GCS
export GOOGLE_APPLICATION_CREDENTIALS=./credentials/gcs-key.json
gsutil ls gs://pixel-queue-videos-raw

# Testar credenciais do Pub/Sub
gcloud pubsub topics list --project=pixel-queue-project
```

## 🗄️ Passo 6: Configurar Banco de Dados

### 6.1 Gerar Cliente Prisma

```bash
npx prisma generate
```

### 6.2 Executar Migrations

```bash
# Criar e aplicar migrations
npx prisma migrate dev

# Ou apenas aplicar migrations existentes
npx prisma migrate deploy
```

### 6.3 (Opcional) Seed do Banco

```bash
# Popular banco com dados de teste
yarn seed

# Ou
npm run seed
```

### 6.4 Abrir Prisma Studio (GUI)

```bash
# Abre interface web para visualizar dados
npx prisma studio

# Acesse: http://localhost:5555
```

## 🎬 Passo 7: Instalar FFmpeg (Opcional)

### macOS

```bash
brew install ffmpeg
```

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install ffmpeg -y
```

### Windows

```bash
# Baixe de: https://ffmpeg.org/download.html
# Adicione ao PATH do sistema
```

### Verificar Instalação

```bash
ffmpeg -version
```

## 🏃 Passo 8: Executar a Aplicação

### 8.1 Modo Desenvolvimento

```bash
# Inicia aplicação em modo watch
yarn dev

# Ou
npm run dev
```

### 8.2 Verificar se está funcionando

```bash
# Teste de saúde
curl http://localhost:3002/health

# Acesse GraphQL Playground
open http://localhost:3002/graphql
```

## 🧪 Passo 9: Testar GraphQL API

### 9.1 Registrar Usuário

```graphql
mutation {
  register(input: {
    email: "teste@example.com"
    password: "senha123"
    name: "Usuário Teste"
  }) {
    accessToken
    user {
      id
      email
      name
    }
  }
}
```

### 9.2 Fazer Login

```graphql
mutation {
  login(input: {
    email: "teste@example.com"
    password: "senha123"
  }) {
    accessToken
    user {
      id
      email
    }
  }
}
```

### 9.3 Configurar Headers de Autenticação

No GraphQL Playground, adicione no painel "HTTP HEADERS":

```json
{
  "Authorization": "Bearer SEU_TOKEN_AQUI"
}
```

## 🔍 Passo 10: Verificar Infraestrutura

### Checklist Final

```bash
# ✅ PostgreSQL rodando
docker ps | grep postgres

# ✅ Redis rodando
docker ps | grep redis

# ✅ GCS acessível
gsutil ls gs://pixel-queue-videos-raw

# ✅ Pub/Sub configurado
gcloud pubsub topics list

# ✅ Aplicação rodando
curl http://localhost:3002/health

# ✅ GraphQL acessível
curl -X POST http://localhost:3002/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { types { name } } }"}'
```

## 🛠️ Comandos Úteis

### Docker

```bash
# Ver logs dos containers
docker-compose -f infra/docker-compose.dev.yaml logs -f

# Parar todos os containers
make down-dev

# Limpar volumes (CUIDADO: deleta dados)
docker-compose -f infra/docker-compose.dev.yaml down -v

# Reconstruir containers
docker-compose -f infra/docker-compose.dev.yaml up -d --build
```

### Prisma

```bash
# Criar nova migration
npx prisma migrate dev --name nome_da_migration

# Resetar banco (CUIDADO!)
npx prisma migrate reset

# Formatar schema
npx prisma format

# Validar schema
npx prisma validate
```

### Google Cloud

```bash
# Ver projeto atual
gcloud config get-value project

# Listar buckets
gsutil ls

# Ver tópicos Pub/Sub
gcloud pubsub topics list

# Ver subscriptions
gcloud pubsub subscriptions list

# Publicar mensagem de teste
gcloud pubsub topics publish video-received --message='{"test": true}'
```

## ❌ Troubleshooting

### Problema: Erro ao conectar no PostgreSQL

```bash
# Verificar se container está rodando
docker ps | grep postgres

# Verificar logs
docker logs pixel-queue-postgres

# Recriar container
docker-compose -f infra/docker-compose.dev.yaml restart postgres
```

### Problema: Erro ao conectar no Redis

```bash
# Testar conexão
docker exec -it pixel-queue-redis redis-cli ping

# Reiniciar Redis
docker-compose -f infra/docker-compose.dev.yaml restart redis
```

### Problema: Erro de autenticação GCP

```bash
# Re-autenticar
gcloud auth login

# Verificar service accounts
gcloud iam service-accounts list

# Recriar chaves
gcloud iam service-accounts keys create ./credentials/gcs-key.json \
  --iam-account=pixel-queue-storage@pixel-queue-project.iam.gserviceaccount.com
```

### Problema: Porta 3002 já está em uso

```bash
# Matar processo na porta 3002
lsof -ti:3002 | xargs kill -9

# Ou mudar porta no .env
APP_PORT=3003
```

## 🎯 Próximos Passos

Agora que o ambiente está configurado:

1. ✅ [Entender o Fluxo Híbrido](../architecture/hybrid-flow.md)
2. ✅ [Ver Estrutura de Módulos](../architecture/modules.md)
3. ✅ [Implementar Upload de Vídeos](../api/graphql-schema.md)
4. ✅ [Configurar Workflows](./01-workflows.md)
5. ✅ [Implementar WebSockets](./05-websockets.md)

## 📚 Recursos Adicionais

- [Documentação NestJS](https://docs.nestjs.com/)
- [Documentação Prisma](https://www.prisma.io/docs)
- [Documentação GCP](https://cloud.google.com/docs)
- [Documentação BullMQ](https://docs.bullmq.io/)
- [Documentação GraphQL](https://graphql.org/learn/)

---

**🎉 Parabéns! Seu ambiente está configurado e pronto para desenvolvimento!**

