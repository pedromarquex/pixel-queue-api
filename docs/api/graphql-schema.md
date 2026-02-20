# GraphQL Schema

## 📖 Visão Geral

Documentação completa do schema GraphQL da Pixel Queue API. Toda comunicação de entrada na API é feita via GraphQL.

## 🔐 Autenticação

Todas as mutations e queries (exceto `register` e `login`) requerem autenticação via JWT.

**Header:**
```
Authorization: Bearer <seu_token_jwt>
```

## 📋 Types

### User

```graphql
type User {
  id: ID!
  email: String!
  name: String
  plan: UserPlan!
  createdAt: DateTime!
  updatedAt: DateTime!
}

enum UserPlan {
  FREE
  STANDARD
  PREMIUM
}
```

### Video

```graphql
type Video {
  id: ID!
  userId: ID!
  title: String!
  description: String
  originalPath: String!
  processedPath: String
  thumbnailPath: String
  status: VideoStatus!
  duration: Int
  fileSize: Int
  resolution: String
  progress: Int
  createdAt: DateTime!
  updatedAt: DateTime!
  
  # Relações
  user: User!
}

enum VideoStatus {
  PENDING
  PROCESSING
  READY
  FAILED
}
```

### Payloads

```graphql
type AuthPayload {
  accessToken: String!
  user: User!
}

type VideoUploadPayload {
  success: Boolean!
  message: String!
  jobId: String!
  gcsPath: String!
}

type VideoListPayload {
  videos: [Video!]!
  total: Int!
  page: Int!
  pageSize: Int!
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
}

type QueueStatus {
  name: String!
  waiting: Int!
  active: Int!
  delayed: Int!
  failed: Int!
  total: Int!
}
```

## 🔑 Mutations

### Autenticação

#### register
Registra um novo usuário

```graphql
mutation Register($input: RegisterInput!) {
  register(input: $input) {
    accessToken
    user {
      id
      email
      name
      plan
    }
  }
}
```

**Input:**
```graphql
input RegisterInput {
  email: String!
  password: String!
  name: String
}
```

**Variáveis:**
```json
{
  "input": {
    "email": "user@example.com",
    "password": "senha123",
    "name": "João Silva"
  }
}
```

#### login
Faz login e retorna token JWT

```graphql
mutation Login($input: LoginInput!) {
  login(input: $input) {
    accessToken
    user {
      id
      email
      name
      plan
    }
  }
}
```

**Input:**
```graphql
input LoginInput {
  email: String!
  password: String!
}
```

**Variáveis:**
```json
{
  "input": {
    "email": "user@example.com",
    "password": "senha123"
  }
}
```

### Vídeos

#### uploadVideo
Faz upload de um vídeo para processamento

```graphql
mutation UploadVideo($input: UploadVideoInput!) {
  uploadVideo(input: $input) {
    success
    message
    jobId
    gcsPath
  }
}
```

**Input:**
```graphql
input UploadVideoInput {
  file: Upload!
  title: String!
  description: String
}
```

**Exemplo usando curl (multipart/form-data):**
```bash
curl 'http://localhost:3002/graphql' \
  -H 'Authorization: Bearer <seu_token>' \
  -F operations='{"query":"mutation($file: Upload!, $title: String!) { uploadVideo(input: {file: $file, title: $title}) { success message jobId } }","variables":{"file":null,"title":"Meu Vídeo"}}' \
  -F map='{"0":["variables.file"]}' \
  -F 0=@video.mp4
```

#### deleteVideo
Deleta um vídeo

```graphql
mutation DeleteVideo($id: ID!) {
  deleteVideo(id: $id) {
    success
    message
  }
}
```

**Variáveis:**
```json
{
  "id": "clxxx123456789"
}
```

## 🔍 Queries

### Usuário

#### me
Retorna dados do usuário autenticado

```graphql
query Me {
  me {
    id
    email
    name
    plan
    createdAt
  }
}
```

### Vídeos

#### myVideos
Lista vídeos do usuário autenticado com paginação e filtros

```graphql
query MyVideos($filter: VideoFilterInput) {
  myVideos(filter: $filter) {
    videos {
      id
      title
      description
      status
      progress
      duration
      thumbnailPath
      createdAt
    }
    total
    page
    pageSize
    hasNextPage
  }
}
```

**Input:**
```graphql
input VideoFilterInput {
  status: VideoStatus
  search: String
  page: Int
  pageSize: Int
  sortBy: String
  sortOrder: SortOrder
}

enum SortOrder {
  ASC
  DESC
}
```

**Variáveis:**
```json
{
  "filter": {
    "status": "READY",
    "search": "tutorial",
    "page": 1,
    "pageSize": 20,
    "sortBy": "createdAt",
    "sortOrder": "DESC"
  }
}
```

#### video
Retorna detalhes de um vídeo específico

```graphql
query Video($id: ID!) {
  video(id: $id) {
    id
    title
    description
    originalPath
    processedPath
    thumbnailPath
    status
    progress
    duration
    fileSize
    resolution
    createdAt
    updatedAt
    user {
      id
      name
    }
  }
}
```

**Variáveis:**
```json
{
  "id": "clxxx123456789"
}
```

#### videoDownloadUrl
Gera URL assinada temporária para download do vídeo processado

```graphql
query VideoDownloadUrl($id: ID!) {
  videoDownloadUrl(id: $id)
}
```

**Resposta:**
```json
{
  "data": {
    "videoDownloadUrl": "https://storage.googleapis.com/pixel-queue-videos-processed/..."
  }
}
```

### Monitoramento (Admin apenas)

#### queueStatus
Status de todas as filas de processamento

```graphql
query QueueStatus {
  queueStatus {
    name
    waiting
    active
    delayed
    failed
    total
  }
}
```

**Resposta:**
```json
{
  "data": {
    "queueStatus": [
      {
        "name": "premium",
        "waiting": 5,
        "active": 3,
        "delayed": 0,
        "failed": 1,
        "total": 8
      },
      {
        "name": "standard",
        "waiting": 15,
        "active": 5,
        "delayed": 2,
        "failed": 0,
        "total": 22
      },
      {
        "name": "free",
        "waiting": 100,
        "active": 0,
        "delayed": 50,
        "failed": 2,
        "total": 152
      }
    ]
  }
}
```

## 📡 Subscriptions (WebSocket)

### videoProgress
Recebe atualizações de progresso em tempo real

```graphql
subscription VideoProgress($videoId: ID!) {
  videoProgress(videoId: $videoId) {
    videoId
    progress
    message
    timestamp
  }
}
```

### videoCompleted
Notificação quando vídeo é processado

```graphql
subscription VideoCompleted {
  videoCompleted {
    videoId
    title
    message
    processedPaths
    thumbnailPath
    timestamp
  }
}
```

## 🔧 Scalar Types Customizados

```graphql
scalar DateTime
scalar Upload
scalar JSON
```

## 📝 Schema Completo (SDL)

```graphql
# Scalars
scalar DateTime
scalar Upload
scalar JSON

# Enums
enum UserPlan {
  FREE
  STANDARD
  PREMIUM
}

enum VideoStatus {
  PENDING
  PROCESSING
  READY
  FAILED
}

enum SortOrder {
  ASC
  DESC
}

# Types
type User {
  id: ID!
  email: String!
  name: String
  plan: UserPlan!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Video {
  id: ID!
  userId: ID!
  title: String!
  description: String
  originalPath: String!
  processedPath: String
  thumbnailPath: String
  status: VideoStatus!
  duration: Int
  fileSize: Int
  resolution: String
  progress: Int
  createdAt: DateTime!
  updatedAt: DateTime!
  user: User!
}

type AuthPayload {
  accessToken: String!
  user: User!
}

type VideoUploadPayload {
  success: Boolean!
  message: String!
  jobId: String!
  gcsPath: String!
}

type VideoListPayload {
  videos: [Video!]!
  total: Int!
  page: Int!
  pageSize: Int!
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
}

type QueueStatus {
  name: String!
  waiting: Int!
  active: Int!
  delayed: Int!
  failed: Int!
  total: Int!
}

# Inputs
input RegisterInput {
  email: String!
  password: String!
  name: String
}

input LoginInput {
  email: String!
  password: String!
}

input UploadVideoInput {
  file: Upload!
  title: String!
  description: String
}

input VideoFilterInput {
  status: VideoStatus
  search: String
  page: Int
  pageSize: Int
  sortBy: String
  sortOrder: SortOrder
}

# Queries
type Query {
  me: User!
  myVideos(filter: VideoFilterInput): VideoListPayload!
  video(id: ID!): Video!
  videoDownloadUrl(id: ID!): String!
  queueStatus: [QueueStatus!]!
}

# Mutations
type Mutation {
  register(input: RegisterInput!): AuthPayload!
  login(input: LoginInput!): AuthPayload!
  uploadVideo(input: UploadVideoInput!): VideoUploadPayload!
  deleteVideo(id: ID!): GenericPayload!
}

# Subscriptions
type Subscription {
  videoProgress(videoId: ID!): VideoProgressPayload!
  videoCompleted: VideoCompletedPayload!
}
```

## 🌐 GraphQL Playground

Acesse `http://localhost:3002/graphql` para testar as queries interativamente.

### Configurar Headers de Autenticação

No painel "HTTP HEADERS" do Playground:

```json
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## 🚀 Próximos Passos

- [Exemplos de Requests Completos](./examples.md)
- [Estrutura de Módulos](../architecture/modules.md)
- [WebSockets](../guides/05-websockets.md)

