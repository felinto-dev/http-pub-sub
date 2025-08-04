# 📚 @felinto-dev/http-pub-sub

Uma biblioteca NodeJS que permite escutar mensagens via polling de um endpoint HTTP definido por variável de ambiente. As mensagens são identificadas por uma chave (ex: e-mail) e podem ser filtradas por tipo.

## 🚀 Instalação

```bash
npm install github:felinto-dev/http-pub-sub
```

## ⚙️ Configuração

Configure a variável de ambiente com o endpoint da sua API:

```bash
export HTTP_PUB_SUB_ENDPOINT=https://sua-api.com/messages
```

Ou no arquivo `.env`:
```env
HTTP_PUB_SUB_ENDPOINT=https://sua-api.com/messages
```

## 📖 Uso Básico

```javascript
const { listenFrom } = require('@felinto-dev/http-pub-sub');

async function exemplo() {
  try {
    const result = await listenFrom("user+freepikaccount01@gmail.com.noreply@freepik.com", {
      type: "verification-code"
      // Os seguintes parâmetros são opcionais e têm valores padrão:
      // timeout: 120,      // tempo total de espera em segundos (padrão: 120)
      // retroBack: 60,     // busca mensagens emitidas nos últimos X segundos (padrão: 60)
      // interval: 5        // intervalo de polling em segundos (padrão: 5)
    });

    if (result.success) {
      console.log('✅ Mensagem encontrada!');
      console.log('📄 Dados:', result.data);
      console.log('⏱️ Tempo decorrido:', result.elapsedTime, 'segundos');
      console.log('🔄 Tentativas:', result.attempts);
    } else {
      console.log('❌ Timeout atingido - nenhuma mensagem encontrada');
    }
  } catch (error) {
    console.error('💥 Erro:', error.message);
  }
}

exemplo();
```

## 📥 Formato Esperado do JSON do Endpoint

O endpoint HTTP deve retornar um JSON no seguinte formato:

```json
{
  "user+freepikaccount01@gmail.com.noreply@freepik.com": {
    "type": "verification-code",
    "data": "414141",
    "meta": {
      "timestamp": 1690931823,
      "expiration": 300
    }
  },
  "outro-usuario@exemplo.com": {
    "type": "login-link",
    "data": { "url": "https://app.com/login?token=abc123" },
    "meta": {
      "timestamp": 1690931900,
      "expiration": 600
    }
  }
}
```

### Estrutura da Mensagem:
- **`type`**: Tipo da mensagem (ex: `"verification-code"`, `"login-link"`, etc.)
- **`data`**: Pode ser um valor primitivo (string, number) ou um objeto JSON
- **`meta.timestamp`**: Timestamp UNIX em segundos da emissão da mensagem
- **`meta.expiration`**: Quantidade de segundos de validade após o timestamp

## 📤 Formato de Retorno

A função `listenFrom()` retorna uma Promise que resolve com:

```javascript
{
  success: true,           // boolean - true se encontrou mensagem, false se timeout
  data: "414141",          // dados da mensagem (conforme campo "data" do JSON)
  meta: {                  // metadados da mensagem
    timestamp: 1690931823,
    expiration: 300
  },
  elapsedTime: 23.5,       // tempo decorrido em segundos até encontrar
  attempts: 3              // número de tentativas de polling realizadas
}
```

Em caso de timeout:
```javascript
{
  success: false,
  error: "Timeout atingido",
  elapsedTime: 60.0,
  attempts: 6
}
```

## 🛠️ Opções Avançadas

```javascript
const result = await listenFrom("usuario@exemplo.com", {
  // Opções obrigatórias
  type: "verification-code",        // tipo da mensagem a buscar
  
  // Opções opcionais com valores padrão
  timeout: 120,                     // timeout total em segundos (padrão: 120)
  retroBack: 60,                    // buscar mensagens dos últimos X segundos (padrão: 60)
  interval: 5,                      // intervalo de polling (padrão: 5s, mínimo: 1s)
  debug: true,                      // ativar logs de debug no console
  endpoint: "https://api.custom.com", // override da variável de ambiente
  headers: {                        // headers customizados para autenticação
    "Authorization": "Bearer seu-token",
    "X-API-Key": "sua-api-key"
  },
  requestTimeout: 5000              // timeout por requisição HTTP em ms (padrão: 5000)
});
```

## 🔍 Como Funciona

1. **Polling**: A biblioteca faz requisições HTTP para o endpoint a cada `interval` segundos
2. **Busca**: Procura por uma mensagem com a `key` fornecida
3. **Validação**: Verifica se a mensagem:
   - É do `type` especificado
   - Ainda está dentro do tempo de validade (`timestamp + expiration`)
   - Foi emitida nos últimos `retroBack` segundos
4. **Retorno**: Retorna imediatamente quando encontra uma mensagem válida
5. **Timeout**: Para após `timeout` segundos se não encontrar nenhuma mensagem

## 💡 Exemplos de Uso

### Código de Verificação
```javascript
// Usando valores padrão (timeout: 120s, retroBack: 60s, interval: 5s)
const codigo = await listenFrom("usuario@gmail.com", {
  type: "verification-code"
});

// Ou customizando os valores
const codigoCustom = await listenFrom("usuario@gmail.com", {
  type: "verification-code",
  timeout: 180,     // aguarda até 3 minutos
  retroBack: 300,   // busca códigos dos últimos 5 minutos
  interval: 3       // verifica a cada 3 segundos
});

if (codigo.success) {
  console.log('Código recebido:', codigo.data);
}
```

### Link de Login com Autenticação
```javascript
const link = await listenFrom("admin@empresa.com", {
  type: "login-link",
  retroBack: 120,   // customiza apenas o retroBack (mantém timeout: 120s e interval: 5s)
  headers: {
    "Authorization": "Bearer " + process.env.API_TOKEN
  },
  debug: true
});

if (link.success && typeof link.data === 'object') {
  window.location.href = link.data.url;
}
```

### Override de Endpoint
```javascript
const notificacao = await listenFrom("app@sistema.com", {
  type: "push-notification",
  timeout: 30,     // customiza o timeout (mantém retroBack: 60s)
  endpoint: "https://staging-api.empresa.com/messages", // usar API de staging
  interval: 2      // polling mais frequente
});
```

## ⚠️ Tratamento de Erros

```javascript
try {
  const result = await listenFrom("usuario@exemplo.com", options);
  // processo normal...
} catch (error) {
  // Possíveis erros:
  // - Parâmetros inválidos (key e type são obrigatórios)
  // - Endpoint não configurado
  // - Erro de parsing JSON
  // - Problemas críticos de rede
  console.error('Erro:', error.message);
}
```

## 🔧 Variáveis de Ambiente

```bash
# Obrigatória
HTTP_PUB_SUB_ENDPOINT=https://sua-api.com/messages

# Opcionais para debug
DEBUG=true
NODE_ENV=development
```

## 📋 Requisitos

- **Node.js**: >= 14.0.0
- **Dependências**: Nenhuma (usa apenas módulos nativos do Node.js)

## 📄 Licença

MIT

---

**Desenvolvido com ❤️ por Felinto**