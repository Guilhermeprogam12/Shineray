# 🏍️ Shineray Dispatcher

Disparador humanizado de mensagens WhatsApp via **CallMeBot**, com delay configurável, lógica `~nome`, e servidor local em Node.js puro (zero dependências de produção).

---

## ✨ Funcionalidades

- **Envio real** via API CallMeBot (sem Selenium, sem WhatsApp Web)
- **Delay humanizado**: 16s base + variação aleatória de 0–10s por mensagem
- **Lógica `~nome`**: contatos não presentes em `contacts.json` aparecem como `~NomeDigitado` (idêntico ao WhatsApp)
- **Fila de disparo** com pause/resume, progresso e timer ao vivo
- **Templates personalizáveis** com `{nome}`
- **Ação em falha**: pular, retry automático, ou parar
- **Auto-sync**: contatos salvos na UI sincronizam com `contacts.json` automaticamente
- **Histórico de mensagens** por contato (máx. 50 por contato, evita estouro de localStorage)

---

## 🚀 Como usar

### Pré-requisitos

- Node.js 16+ instalado
- Conta no [CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/) com API key ativa

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/shineray-dispatcher.git
cd shineray-dispatcher
```

### 2. Configure suas credenciais

Abra `webservice.js` e edite o bloco `CONFIG`:

```js
const CONFIG = {
  PORT         : 3000,
  CALLMEBOT_KEY: '1333116',       // ← sua API key CallMeBot
  MY_PHONE     : '5516992719558', // ← seu número com DDI (55 = Brasil)
  ...
};
```

### 3. Inicie o servidor

```bash
node webservice.js
```

Você verá:

```
╔══════════════════════════════════════════════╗
║        🏍️  SHINERAY DISPATCHER               ║
╠══════════════════════════════════════════════╣
║  URL    → http://localhost:3000              ║
║  Número → +5516992719558                    ║
║  ApiKey → 1333116                            ║
╚══════════════════════════════════════════════╝
```

### 4. Abra o browser

Acesse `http://localhost:3000` — clique em **Verificar Serviço** e o sistema conecta automaticamente.

---

## 📁 Estrutura

```
shineray-dispatcher/
├── index.html        ← Frontend completo (UI WhatsApp-like)
├── webservice.js     ← Servidor Node.js (proxy CallMeBot + API)
├── contacts.json     ← Agenda de números salvos (source of truth)
├── package.json
└── README.md
```

---

## 📋 Formato do contacts.json

```json
[
  { "name": "João Silva", "phone": "5511999990001", "tags": ["cliente"] },
  { "name": "Maria",      "phone": "5521988880002", "tags": ["lead"]    }
]
```

> **Dica:** Números adicionados pela UI que **não estejam** no `contacts.json` são exibidos como `~Nome` — igual ao WhatsApp para contatos não salvos. O sistema os envia normalmente.

---

## 📱 Rotas da API

| Método | Rota             | Descrição                              |
|--------|------------------|----------------------------------------|
| GET    | `/api/status`    | Status do serviço + lista de números   |
| GET    | `/api/contacts`  | Retorna contacts.json                  |
| POST   | `/api/contacts`  | Salva/atualiza contacts.json           |
| POST   | `/api/send`      | Envia mensagem via CallMeBot           |
| GET    | `/`              | Serve o index.html                     |

### Exemplo de envio manual

```bash
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"5511999990001","text":"Olá João!"}'
```

---

## ⚠️ Sobre o CallMeBot

- O CallMeBot tem limite de mensagens por hora (geralmente ~30/hora no plano gratuito)
- O delay mínimo de 16s entre mensagens ajuda a respeitar esse limite
- Certifique-se que seu número está registrado em [callmebot.com](https://www.callmebot.com)

---

## 🔧 Dicas de uso no dia a dia

1. **Importe seus contatos** em Importar → formato `Nome;Telefone;tags`
2. **Crie templates** na aba Mensagens com `{nome}` para personalização
3. **Selecione contatos** → clique em **Agendar** → defina o template
4. Na aba **Fila**, clique em ▶ para iniciar
5. O sistema envia automaticamente com delay humanizado

---

## 💡 Sobre o ESP32

Se quiser rodar em ESP32, a arquitetura ideal é:

```
[Browser] ──HTTP──> [ESP32 servidor] ──HTTPS──> [CallMeBot]
```

O ESP32 atuaria como proxy local (sem CDN de Tailwind, que requer internet no browser de qualquer jeito). Para isso, compile o Tailwind localmente e incorpore o CSS no HTML antes de transferir para o ESP32.

Para cargas maiores, um **Raspberry Pi Zero 2W** (~R$90) rodando este mesmo `webservice.js` com Node.js é mais estável e tem 512MB de RAM.

---

## 📄 Licença

MIT — use à vontade.
