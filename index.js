/**
 * @felinto-dev/http-pub-sub
 * 
 * Uma biblioteca NodeJS que permite escutar mensagens via polling de um endpoint HTTP
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Função principal para escutar mensagens via polling HTTP
 * @param {string} key - Chave da mensagem (ex: e-mail)
 * @param {Object} options - Opções de configuração
 * @param {string} options.type - Tipo da mensagem
 * @param {number} options.timeout - Tempo total de espera em segundos
 * @param {number} options.retroBack - Busca mensagens emitidas nos últimos X segundos
 * @param {number} [options.interval=10] - Intervalo de polling em segundos
 * @param {boolean} [options.debug=false] - Ativar logs de debug
 * @param {string} [options.endpoint] - Override da variável de ambiente
 * @param {Object} [options.headers={}] - Headers customizados
 * @param {number} [options.requestTimeout=5000] - Timeout por requisição HTTP
 * @returns {Promise<Object>} Resultado da operação
 */
async function listenFrom(key, options = {}) {
  if (!key || typeof key !== 'string') {
    throw new Error('Key deve ser uma string não vazia');
  }

  if (!options.type || typeof options.type !== 'string') {
    throw new Error('options.type deve ser uma string não vazia');
  }

  if (!options.timeout || typeof options.timeout !== 'number') {
    throw new Error('options.timeout deve ser um número maior que 0');
  }

  if (!options.retroBack || typeof options.retroBack !== 'number') {
    throw new Error('options.retroBack deve ser um número maior que 0');
  }

  // Configurações padrão
  const config = {
    interval: options.interval || 10,
    debug: options.debug || false,
    endpoint: options.endpoint || process.env.HTTP_PUB_SUB_ENDPOINT,
    headers: options.headers || {},
    requestTimeout: options.requestTimeout || 5000,
    type: options.type,
    timeout: options.timeout,
    retroBack: options.retroBack
  };

  if (!config.endpoint) {
    throw new Error('Endpoint HTTP não definido. Configure a variável de ambiente HTTP_PUB_SUB_ENDPOINT ou passe via options.endpoint');
  }

  // Validar intervalo mínimo
  if (config.interval < 1) {
    config.interval = 1;
    if (config.debug) {
      console.log('[HTTP-PUB-SUB] Intervalo ajustado para mínimo de 1 segundo');
    }
  }

  const startTime = Date.now();
  const timeoutMs = config.timeout * 1000;
  let attempts = 0;

  if (config.debug) {
    console.log(`[HTTP-PUB-SUB] Iniciando polling para key: ${key}, type: ${config.type}`);
    console.log(`[HTTP-PUB-SUB] Timeout: ${config.timeout}s, RetroBack: ${config.retroBack}s, Interval: ${config.interval}s`);
  }

  return new Promise((resolve, reject) => {
    const intervalId = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      
      // Verificar timeout global
      if (elapsed >= timeoutMs) {
        clearInterval(intervalId);
        resolve({
          success: false,
          error: 'Timeout atingido',
          elapsedTime: Math.round(elapsed / 1000 * 10) / 10,
          attempts: attempts
        });
        return;
      }

      attempts++;
      
      try {
        if (config.debug) {
          console.log(`[HTTP-PUB-SUB] Tentativa ${attempts} - Fazendo requisição para ${config.endpoint}`);
        }

        const response = await makeHttpRequest(config.endpoint, config.headers, config.requestTimeout);
        const messages = JSON.parse(response);

        if (config.debug) {
          console.log(`[HTTP-PUB-SUB] Resposta recebida:`, Object.keys(messages));
        }

        // Verificar se a mensagem existe
        if (!messages[key]) {
          if (config.debug) {
            console.log(`[HTTP-PUB-SUB] Mensagem com key '${key}' não encontrada`);
          }
          return;
        }

        const message = messages[key];

        // Validar estrutura da mensagem
        if (!message.type || !message.data || !message.meta || 
            typeof message.meta.timestamp !== 'number' || 
            typeof message.meta.expiration !== 'number') {
          if (config.debug) {
            console.log(`[HTTP-PUB-SUB] Mensagem com estrutura inválida:`, message);
          }
          return;
        }

        // Verificar tipo
        if (message.type !== config.type) {
          if (config.debug) {
            console.log(`[HTTP-PUB-SUB] Tipo não corresponde. Esperado: ${config.type}, Recebido: ${message.type}`);
          }
          return;
        }

        const now = Math.floor(Date.now() / 1000);
        const messageTime = message.meta.timestamp;
        const expirationTime = messageTime + message.meta.expiration;

        // Verificar se ainda está válida
        if (now > expirationTime) {
          if (config.debug) {
            console.log(`[HTTP-PUB-SUB] Mensagem expirada. Now: ${now}, Expira em: ${expirationTime}`);
          }
          return;
        }

        // Verificar retroBack
        const retroBackLimit = now - config.retroBack;
        if (messageTime < retroBackLimit) {
          if (config.debug) {
            console.log(`[HTTP-PUB-SUB] Mensagem fora do período retroBack. Timestamp: ${messageTime}, Limite: ${retroBackLimit}`);
          }
          return;
        }

        // Mensagem válida encontrada!
        clearInterval(intervalId);
        
        const finalElapsed = Math.round((Date.now() - startTime) / 1000 * 10) / 10;
        
        if (config.debug) {
          console.log(`[HTTP-PUB-SUB] Mensagem válida encontrada! Elapsed: ${finalElapsed}s, Attempts: ${attempts}`);
        }

        resolve({
          success: true,
          data: message.data,
          meta: message.meta,
          elapsedTime: finalElapsed,
          attempts: attempts
        });

      } catch (error) {
        if (config.debug) {
          console.log(`[HTTP-PUB-SUB] Erro na tentativa ${attempts}:`, error.message);
        }
        
        // Para erros críticos (não de rede), parar imediatamente
        if (error.message.includes('JSON') || error.message.includes('parse')) {
          clearInterval(intervalId);
          reject(new Error(`Erro ao processar resposta: ${error.message}`));
          return;
        }
        
        // Para erros de rede, continuar tentando até o timeout
      }
    }, config.interval * 1000);

    // Fazer a primeira tentativa imediatamente
    setTimeout(() => {
      // Trigger da primeira execução do interval
    }, 0);
  });
}

/**
 * Faz uma requisição HTTP e retorna a resposta como string
 * @param {string} url - URL do endpoint
 * @param {Object} headers - Headers customizados
 * @param {number} timeout - Timeout da requisição em ms
 * @returns {Promise<string>} Resposta da requisição
 */
function makeHttpRequest(url, headers = {}, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': '@felinto-dev/http-pub-sub',
        'Accept': 'application/json',
        ...headers
      },
      timeout: timeout
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Erro de rede: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout da requisição (${timeout}ms)`));
    });

    req.end();
  });
}

module.exports = {
  listenFrom
};