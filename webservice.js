/**
 * ============================================================
 *  SHINERAY DISPATCHER — webservice.js
 *  Servidor local: proxy CallMeBot + API de contatos
 *  Uso: node webservice.js
 * ============================================================
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// ─────────────────────────────────────────────
//  CONFIGURAÇÃO  ← edite aqui
// ─────────────────────────────────────────────
const CONFIG = {
  PORT         : 3000,
  CALLMEBOT_KEY: '1333116',          // sua API key CallMeBot
  MY_PHONE     : '5516992719558',    // seu número registrado no CallMeBot (com DDI 55)
  CONTACTS_FILE: path.join(__dirname, 'contacts.json'),
  INDEX_FILE   : path.join(__dirname, 'index.html'),
  REQUEST_TIMEOUT_MS: 15000,
  MAX_RETRY    : 1,                  // tentativas extras em caso de falha
};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function log(label, msg) {
  const t = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${t}] ${label} ${msg}`);
}

function readContacts() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.CONTACTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeContacts(data) {
  fs.writeFileSync(CONFIG.CONTACTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end',  ()    => {
      try { resolve(JSON.parse(raw)); }
      catch(e) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function httpsGet(urlStr) {
  return new Promise((resolve, reject) => {
    const req = https.get(urlStr, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => body += c);
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.setTimeout(CONFIG.REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Timeout na requisição CallMeBot'));
    });
    req.on('error', reject);
  });
}

function json(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type' : 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

// ─────────────────────────────────────────────
//  CALLMEBOT — envio com retry
// ─────────────────────────────────────────────
async function callMeBot(phone, text, attempt = 0) {
  // Remove tudo que não é dígito, garante DDI
  const cleanPhone = phone.replace(/\D/g, '');
  const encodedText = encodeURIComponent(text);
  const apiUrl = `https://api.callmebot.com/whatsapp.php`
    + `?phone=${cleanPhone}&text=${encodedText}&apikey=${CONFIG.CALLMEBOT_KEY}`;

  log('📤', `Enviando para +${cleanPhone} (tentativa ${attempt + 1})`);

  try {
    const { statusCode, body } = await httpsGet(apiUrl);

    // CallMeBot retorna HTML; "Message Sent" indica sucesso
    const ok = statusCode === 200 && /message queued|message sent/i.test(body);

    if (ok) {
      log('✅', `Enviado com sucesso para +${cleanPhone}`);
      return { ok: true, phone: cleanPhone };
    }

    // Erro recuperável → retry
    if (attempt < CONFIG.MAX_RETRY) {
      log('⚠️', `Falha (${statusCode}), aguardando 5s para retry...`);
      await new Promise(r => setTimeout(r, 5000));
      return callMeBot(phone, text, attempt + 1);
    }

    const errMsg = body.substring(0, 120).replace(/<[^>]*>/g, '').trim();
    log('❌', `Falha definitiva +${cleanPhone}: ${errMsg}`);
    return { ok: false, error: errMsg || `HTTP ${statusCode}` };

  } catch(e) {
    if (attempt < CONFIG.MAX_RETRY) {
      log('⚠️', `Erro de rede, retry em 5s: ${e.message}`);
      await new Promise(r => setTimeout(r, 5000));
      return callMeBot(phone, text, attempt + 1);
    }
    log('❌', `Erro definitivo +${cleanPhone}: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// ─────────────────────────────────────────────
//  SERVIDOR HTTP
// ─────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url);
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  // ── GET /api/status ──────────────────────────
  if (pathname === '/api/status' && method === 'GET') {
    const contacts    = readContacts();
    const savedPhones = contacts.map(c => c.phone.replace(/\D/g, ''));
    return json(res, 200, {
      ok         : true,
      version    : '1.0.0',
      myPhone    : CONFIG.MY_PHONE,
      savedPhones,
      totalContacts: contacts.length,
    });
  }

  // ── GET /api/contacts ────────────────────────
  if (pathname === '/api/contacts' && method === 'GET') {
    return json(res, 200, readContacts());
  }

  // ── POST /api/contacts ───────────────────────
  if (pathname === '/api/contacts' && method === 'POST') {
    try {
      const data = await parseBody(req);
      if (!Array.isArray(data)) throw new Error('Esperado array de contatos');
      // Normaliza e salva
      const normalized = data.map(c => ({
        name : (c.name  || '').trim(),
        phone: (c.phone || '').replace(/\D/g, ''),
        tags : Array.isArray(c.tags) ? c.tags : [],
      })).filter(c => c.name && c.phone);
      writeContacts(normalized);
      log('💾', `contacts.json atualizado — ${normalized.length} contatos`);
      return json(res, 200, { ok: true, total: normalized.length });
    } catch(e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  // ── POST /api/send ───────────────────────────
  if (pathname === '/api/send' && method === 'POST') {
    try {
      const { phone, text } = await parseBody(req);
      if (!phone || !text) throw new Error('phone e text são obrigatórios');
      const result = await callMeBot(phone, text);
      return json(res, result.ok ? 200 : 500, result);
    } catch(e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  // ── GET / (servir index.html) ────────────────
  if ((pathname === '/' || pathname === '/index.html') && method === 'GET') {
    try {
      const html = fs.readFileSync(CONFIG.INDEX_FILE);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch(e) {
      res.writeHead(404);
      return res.end('index.html não encontrado');
    }
  }

  // 404
  json(res, 404, { ok: false, error: 'Rota não encontrada' });
});

server.listen(CONFIG.PORT, '127.0.0.1', () => {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        🏍️  SHINERAY DISPATCHER               ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  URL    → http://localhost:${CONFIG.PORT}              ║`);
  console.log(`║  Número → +${CONFIG.MY_PHONE}         ║`);
  console.log(`║  ApiKey → ${CONFIG.CALLMEBOT_KEY}                      ║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  Abra o navegador em http://localhost:3000   ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('\n  Aguardando conexão...\n');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Porta ${CONFIG.PORT} já está em uso. Feche o processo anterior.\n`);
  } else {
    console.error('\n❌ Erro no servidor:', err.message);
  }
  process.exit(1);
});

process.on('SIGINT',  () => { console.log('\n\n👋 Servidor encerrado.\n'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n\n👋 Servidor encerrado.\n'); process.exit(0); });
