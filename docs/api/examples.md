# Exemplos de Requests GraphQL

## 📖 Visão Geral

Exemplos práticos e completos de uso da API GraphQL do Pixel Queue.

## 🚀 Fluxo Completo de Uso

### 1. Registro de Novo Usuário

**Request:**
```graphql
mutation {
  register(input: {
    email: "joao@example.com"
    password: "senha@123"
    name: "João Silva"
  }) {
    accessToken
    user {
      id
      email
      name
      plan
      createdAt
    }
  }
}
```

**Response:**
```json
{
  "data": {
    "register": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbHh4eDEyMzQ1Njc4OSIsImVtYWlsIjoiam9hb0BleGFtcGxlLmNvbSIsImlhdCI6MTcwODQ1MjAwMCwiZXhwIjoxNzA4NTM4NDAwfQ.xyz123",
      "user": {
        "id": "clxxx123456789",
        "email": "joao@example.com",
        "name": "João Silva",
        "plan": "FREE",
        "createdAt": "2026-02-20T10:00:00.000Z"
      }
    }
  }
}
```

### 2. Login

**Request:**
```graphql
mutation {
  login(input: {
    email: "joao@example.com"
    password: "senha@123"
  }) {
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

**Response:**
```json
{
  "data": {
    "login": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": "clxxx123456789",
        "email": "joao@example.com",
        "name": "João Silva",
        "plan": "FREE"
      }
    }
  }
}
```

### 3. Obter Dados do Usuário Logado

**Request:**
```graphql
query {
  me {
    id
    email
    name
    plan
    createdAt
    updatedAt
  }
}
```

**Headers:**
```json
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "data": {
    "me": {
      "id": "clxxx123456789",
      "email": "joao@example.com",
      "name": "João Silva",
      "plan": "FREE",
      "createdAt": "2026-02-20T10:00:00.000Z",
      "updatedAt": "2026-02-20T10:00:00.000Z"
    }
  }
}
```

### 4. Upload de Vídeo

**GraphQL Playground não suporta upload diretamente. Use:**

#### Opção A: curl

```bash
curl 'http://localhost:3002/graphql' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -F operations='{
    "query": "mutation($file: Upload!, $title: String!, $description: String) { uploadVideo(input: {file: $file, title: $title, description: $description}) { success message jobId gcsPath } }",
    "variables": {
      "file": null,
      "title": "Tutorial de NestJS",
      "description": "Vídeo tutorial sobre NestJS e GraphQL"
    }
  }' \
  -F map='{"0":["variables.file"]}' \
  -F 0=@./videos/tutorial.mp4
```

#### Opção B: JavaScript/TypeScript (Frontend)

```typescript
const UPLOAD_VIDEO = gql`
  mutation UploadVideo($file: Upload!, $title: String!, $description: String) {
    uploadVideo(input: {
      file: $file
      title: $title
      description: $description
    }) {
      success
      message
      jobId
      gcsPath
    }
  }
`;

// Com Apollo Client
const [uploadVideo] = useMutation(UPLOAD_VIDEO);

const handleUpload = async (file: File) => {
  try {
    const { data } = await uploadVideo({
      variables: {
        file,
        title: 'Meu Vídeo',
        description: 'Descrição do vídeo',
      },
    });
    
    console.log('Upload iniciado:', data.uploadVideo);
    // { success: true, message: "Vídeo recebido...", jobId: "123", gcsPath: "gs://..." }
  } catch (error) {
    console.error('Erro no upload:', error);
  }
};
```

**Response:**
```json
{
  "data": {
    "uploadVideo": {
      "success": true,
      "message": "Vídeo recebido e sendo processado",
      "jobId": "1234567890",
      "gcsPath": "gs://pixel-queue-videos-raw/clxxx123456789/1708452000000-tutorial.mp4"
    }
  }
}
```

### 5. Listar Meus Vídeos

**Request:**
```graphql
query {
  myVideos(filter: {
    page: 1
    pageSize: 10
    sortBy: "createdAt"
    sortOrder: DESC
  }) {
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
    hasPreviousPage
  }
}
```

**Response:**
```json
{
  "data": {
    "myVideos": {
      "videos": [
        {
          "id": "clxxx111111111",
          "title": "Tutorial de NestJS",
          "description": "Vídeo tutorial sobre NestJS e GraphQL",
          "status": "PROCESSING",
          "progress": 45,
          "duration": null,
          "thumbnailPath": null,
          "createdAt": "2026-02-20T10:05:00.000Z"
        },
        {
          "id": "clxxx222222222",
          "title": "Introdução ao TypeScript",
          "description": "Primeiros passos com TypeScript",
          "status": "READY",
          "progress": 100,
          "duration": 1200,
          "thumbnailPath": "gs://pixel-queue-videos-processed/processed/clxxx123456789/1708451000000-thumb-50.jpg",
          "createdAt": "2026-02-19T15:30:00.000Z"
        }
      ],
      "total": 2,
      "page": 1,
      "pageSize": 10,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
}
```

### 6. Filtrar Vídeos por Status

**Request:**
```graphql
query {
  myVideos(filter: {
    status: READY
    page: 1
    pageSize: 20
  }) {
    videos {
      id
      title
      status
      processedPath
      thumbnailPath
    }
    total
  }
}
```

**Response:**
```json
{
  "data": {
    "myVideos": {
      "videos": [
        {
          "id": "clxxx222222222",
          "title": "Introdução ao TypeScript",
          "status": "READY",
          "processedPath": "gs://pixel-queue-videos-processed/processed/clxxx123456789/1708451000000-output.mp4",
          "thumbnailPath": "gs://pixel-queue-videos-processed/processed/clxxx123456789/1708451000000-thumb-50.jpg"
        }
      ],
      "total": 1
    }
  }
}
```

### 7. Buscar Vídeos por Texto

**Request:**
```graphql
query {
  myVideos(filter: {
    search: "TypeScript"
    page: 1
    pageSize: 10
  }) {
    videos {
      id
      title
      description
      status
    }
    total
  }
}
```

### 8. Obter Detalhes de um Vídeo

**Request:**
```graphql
query {
  video(id: "clxxx222222222") {
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
      email
    }
  }
}
```

**Response:**
```json
{
  "data": {
    "video": {
      "id": "clxxx222222222",
      "title": "Introdução ao TypeScript",
      "description": "Primeiros passos com TypeScript",
      "originalPath": "gs://pixel-queue-videos-raw/clxxx123456789/1708451000000-typescript.mp4",
      "processedPath": "gs://pixel-queue-videos-processed/processed/clxxx123456789/1708451000000-output.mp4",
      "thumbnailPath": "gs://pixel-queue-videos-processed/processed/clxxx123456789/1708451000000-thumb-50.jpg",
      "status": "READY",
      "progress": 100,
      "duration": 1200,
      "fileSize": 52428800,
      "resolution": "1920x1080",
      "createdAt": "2026-02-19T15:30:00.000Z",
      "updatedAt": "2026-02-19T15:50:00.000Z",
      "user": {
        "id": "clxxx123456789",
        "name": "João Silva",
        "email": "joao@example.com"
      }
    }
  }
}
```

### 9. Obter URL de Download

**Request:**
```graphql
query {
  videoDownloadUrl(id: "clxxx222222222")
}
```

**Response:**
```json
{
  "data": {
    "videoDownloadUrl": "https://storage.googleapis.com/pixel-queue-videos-processed/processed/clxxx123456789/1708451000000-output.mp4?GoogleAccessId=pixel-queue-storage@pixel-queue-project.iam.gserviceaccount.com&Expires=1708455600&Signature=xyz123abc456..."
  }
}
```

### 10. Deletar Vídeo

**Request:**
```graphql
mutation {
  deleteVideo(id: "clxxx222222222") {
    success
    message
  }
}
```

**Response:**
```json
{
  "data": {
    "deleteVideo": {
      "success": true,
      "message": "Vídeo deletado com sucesso"
    }
  }
}
```

### 11. Status das Filas (Admin)

**Request:**
```graphql
query {
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

**Response:**
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

## 📡 WebSocket Subscriptions

### Conectar ao WebSocket (JavaScript)

```javascript
import { io } from 'socket.io-client';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

const socket = io('http://localhost:3002/notifications', {
  auth: { token },
  transports: ['websocket'],
});

// Conectado
socket.on('connected', (data) => {
  console.log('WebSocket conectado:', data);
});

// Progresso do vídeo
socket.on('video.progress', (data) => {
  console.log(`Progresso: ${data.progress}%`);
  // Atualizar UI
  updateProgressBar(data.videoId, data.progress);
});

// Vídeo concluído
socket.on('video.completed', (data) => {
  console.log('Vídeo pronto:', data);
  showNotification('Vídeo processado!', data.message);
});

// Vídeo falhou
socket.on('video.failed', (data) => {
  console.error('Falha no processamento:', data);
  showError(data.message);
});

// Inscrever em vídeo específico
socket.emit('subscribe', { videoId: 'clxxx111111111' });

// Desconectar
socket.disconnect();
```

## 🔍 Tratamento de Erros

### Erro de Autenticação

**Request sem token:**
```graphql
query {
  me {
    id
    email
  }
}
```

**Response:**
```json
{
  "errors": [
    {
      "message": "Não autorizado",
      "extensions": {
        "code": "UNAUTHENTICATED",
        "statusCode": 401
      }
    }
  ],
  "data": null
}
```

### Erro de Validação

**Request:**
```graphql
mutation {
  register(input: {
    email: "email_invalido"
    password: "123"
  }) {
    accessToken
  }
}
```

**Response:**
```json
{
  "errors": [
    {
      "message": "Erro de validação",
      "extensions": {
        "code": "BAD_USER_INPUT",
        "validationErrors": [
          {
            "field": "email",
            "message": "Email inválido"
          },
          {
            "field": "password",
            "message": "Senha deve ter no mínimo 6 caracteres"
          }
        ]
      }
    }
  ]
}
```

### Erro de Recurso Não Encontrado

**Request:**
```graphql
query {
  video(id: "id_inexistente") {
    id
    title
  }
}
```

**Response:**
```json
{
  "errors": [
    {
      "message": "Vídeo não encontrado",
      "extensions": {
        "code": "NOT_FOUND",
        "statusCode": 404
      }
    }
  ],
  "data": null
}
```

## 🚀 Próximos Passos

- [Ver Schema Completo](./graphql-schema.md)
- [Implementar Upload](../guides/00-setup.md)
- [WebSockets](../guides/05-websockets.md)

