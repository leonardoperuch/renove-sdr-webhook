require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

// Rota raiz de teste
app.get('/', (req, res) => {
    res.send('Renove SDR Webhook está online! 💎');
});

// =========================================================================
// 1. ENDPOINT DE VALIDAÇÃO (Usado pela Meta para confirmar o Webhook)
// =========================================================================
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.status(400).send('Faltando parâmetros de verificação.');
    }
});

// =========================================================================
// 2. ENDPOINT DE RECEBIMENTO DE MENSAGENS
// =========================================================================
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page' || body.object === 'instagram') {
        
        // Responde rápido para a Meta não dar timeout
        res.status(200).send('EVENT_RECEIVED');

        body.entry.forEach(async function(entry) {
            let webhook_event = entry.messaging[0];
            
            // Ignora mensagens de 'eco' (enviadas pela própria página)
            if (webhook_event.message && webhook_event.message.is_echo) return;

            const sender_psid = webhook_event.sender.id; // ID de quem enviou

            if (webhook_event.message && webhook_event.message.text) {
                const received_message = webhook_event.message.text;
                console.log(`Mensagem recebida de ${sender_psid}: ${received_message}`);

                // Chama a inteligência do OpenClaw para processar a mensagem
                const ai_response = await askOpenClaw(received_message, sender_psid);
                
                // Envia a resposta da IA de volta para o cliente
                if (ai_response) {
                    await sendTextMessage(sender_psid, ai_response);
                }
            }
        });
    } else {
        res.sendStatus(404);
    }
});

// =========================================================================
// INTEGRAÇÃO COM OPENCLAW (Cérebro do Agente) - Via API WebSocket / Webhook Plugin
// =========================================================================
async function askOpenClaw(user_message, user_id) {
    // Usamos o IP do host (gateway) visto por dentro do container docker default bridge (172.17.0.1) ou o host real do Traefik.
    // Como os containers estão na rede "openclaw-thcz_default", a forma mais segura de chegar no container do openclaw é pelo seu nome interno da rede docker do openclaw.
    // Se o nome real for "openclaw", a url base é http://openclaw:18789.
    // A API Webhook nativa do OpenClaw para receber mensagens de canais externos (como webhook genérico) é a /api/webhooks/trigger
    // Nós podemos mandar a mensagem para o Gateway usando o Plugin de Webhook.
    
    // Outra forma garantida e recomendada é via "openclaw agent --message..." mas como estamos dentro de outro docker (node:18-alpine),
    // o binário "openclaw" não existe lá dentro. 
    
    // Vamos usar a API HTTP do Webhook que aciona a automação interna (TaskFlow ou Agent).
    // Rota da API padrão para injeção de mensagem via Gateway é a POST /api/v1/message (se habilitada) ou disparar um workflow.
    
    const openclawUrl = process.env.OPENCLAW_API_URL || "http://172.17.0.1:18789/api/v1/sessions/send";
    const openclawToken = process.env.OPENCLAW_TOKEN;

    const system_prompt = `[MENSAGEM DO INSTAGRAM/FACEBOOK - LEAD: ${user_id}]\n\nVocê é a Renove, assistente de inteligência artificial da Dra. Gabriela Peruch (Clínica Renove Odontologia e Estética).\nAja como uma SDR premium. Seja educada, acolhedora e direta ao ponto.\nSeu objetivo é qualificar o lead que chamou no Instagram/Facebook e agendar uma avaliação.\nTratamentos principais: Invisalign e Lentes de Contato Dental. Público: Classe A/B.\nResponda em parágrafos curtos, ideais para mensagens de celular.\nMensagem do paciente:\n\n${user_message}`;

    try {
        console.log(`Solicitando resposta ao OpenClaw para o lead ${user_id}...`);
        
        // Chamada à API WebSocket/HTTP do OpenClaw (Injeção de sessão)
        const response = await axios.post(openclawUrl, {
            sessionKey: `agent:sdr_meta_${user_id}:main`,
            message: system_prompt,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openclawToken}`
            }
        });

        // O endpoint sessions/send retorna a reply do assistente na propriedade "reply"
        if (response.data && response.data.reply) {
            return response.data.reply;
        } else if (response.data && response.data.text) {
            return response.data.text;
        } else {
            console.error("OpenClaw retornou payload inesperado:", response.data);
            return "Um momento, a Dra. Gabi já vai te responder."; // Fallback seguro
        }
    } catch (error) {
        console.error('Erro na chamada ao OpenClaw:', error.response ? error.response.data : error.message);
        
        // Tentativa de fallback usando o webhook genérico do OpenClaw caso o sessions/send falhe
        try {
            console.log("Tentando fallback de Webhook no OpenClaw...");
            const fallbackUrl = openclawUrl.replace('/api/v1/sessions/send', '/api/webhooks/trigger/sdr');
            await axios.post(fallbackUrl, {
                userId: user_id,
                text: user_message
            }, {
                headers: { 'Authorization': `Bearer ${openclawToken}` }
            });
            // O webhook é assíncrono e não retorna texto direto, então retornamos null para não dar erro
            return null;
        } catch (e) {
            console.error('Falha também no fallback:', e.message);
            return "Tivemos um pequeno problema na nossa rede. Pode deixar seu WhatsApp para entrarmos em contato?";
        }
    }
}

// =========================================================================
// FUNÇÃO AUXILIAR: Enviar Mensagem de Volta
// =========================================================================
async function sendTextMessage(sender_psid, text) {
    const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    const payload = {
        recipient: { id: sender_psid },
        message: { text: text }
    };

    try {
        await axios.post(url, payload);
        console.log(`Mensagem enviada para ${sender_psid}`);
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error.response ? error.response.data : error.message);
    }
}

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Token esperado para validação Meta: ${VERIFY_TOKEN}`);
});
