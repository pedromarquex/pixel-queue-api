# GitHub Actions Workflows

Este diretório contém os workflows de CI/CD do projeto.

## 📋 Workflow: CI

**Arquivo:** `ci.yml`

### Triggers

O workflow é executado automaticamente:
- ✅ A cada **push** na branch `main`
- ✅ A cada **pull request** para a branch `main`

### O que o workflow faz

1. **Setup do Ambiente**
   - Checkout do código
   - Configuração do Node.js 20.x
   
2. **Cache de Dependências**
   - Cache do Yarn (acelera instalação de pacotes)
   - Cache do Prisma Client (acelera geração do cliente)

3. **Instalação e Geração**
   - `yarn install --frozen-lockfile` - Instala dependências de forma determinística
   - `yarn prisma generate` - Gera o Prisma Client

4. **Testes com Cobertura**
   - Executa `yarn test:cov` com threshold de **85%** de cobertura
   - Se a cobertura for menor que 85%, o workflow **falha**
   - Métricas verificadas:
     - Branches: 85%
     - Functions: 85%
     - Lines: 85%
     - Statements: 85%

5. **Upload de Relatórios**
   - Faz upload do relatório de cobertura como artifact
   - Disponível por 30 dias na aba "Actions" do GitHub
   - Executado sempre, mesmo se os testes falharem

### Como Visualizar Resultados

1. Acesse a aba **Actions** no repositório GitHub
2. Clique no workflow mais recente
3. Visualize os logs de cada step
4. Baixe o relatório de cobertura em "Artifacts"

### Badge de Status

O README.md principal do projeto possui uma badge que mostra o status do CI:

[![CI](https://github.com/pedromarquex/pixel-queue-api/workflows/CI/badge.svg)](https://github.com/pedromarquex/pixel-queue-api/actions)

- 🟢 Verde: Testes passando
- 🔴 Vermelho: Testes falhando

### Configurações de Testes

Os testes usam configurações mockadas:
- **Prisma**: Mockado nos testes (ver `auth.service.spec.ts`)
- **Redis/BullMQ**: Não usado em testes unitários
- **Variáveis de ambiente**: Configuradas em `src/test/setupEnv.js`

### Otimizações

- ⚡ **Cache do Yarn**: Reduz tempo de instalação de ~2min para ~10s
- ⚡ **Cache do Prisma**: Evita regeneração desnecessária do client
- ⚡ **Frozen Lockfile**: Garante instalações determinísticas e rápidas

### Troubleshooting

**Workflow falhando devido à cobertura?**
- Verifique o relatório de cobertura nos artifacts
- Adicione mais testes unitários para aumentar a cobertura
- Se necessário, ajuste o threshold no arquivo `ci.yml` (linha 50)

**Cache não funcionando?**
- O cache é invalidado quando `yarn.lock` ou `schema.prisma` mudam
- Isso é esperado e garante que dependências estejam sempre atualizadas

**Testes passando localmente mas falhando no CI?**
- Certifique-se de que todos os mocks estão configurados
- Verifique se não há dependências de arquivos locais
- Confirme que variáveis de ambiente estão configuradas em `setupEnv.js`

