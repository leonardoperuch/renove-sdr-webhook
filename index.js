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
// INTEGRAÇÃO COM OPENCLAW (Cérebro do Agente)
// =========================================================================
async function askOpenClaw(user_message, user_id) {
    // Usamos a API REST embutida do OpenClaw para acionar o Agente
    const openclawUrl = process.env.OPENCLAW_API_URL || "http://openclaw:18789/api/v1/agent/run";
    const openclawToken = process.env.OPENCLAW_TOKEN;

    const system_prompt = `
    Você é a Renove, assistente de inteligência artificial da Dra. Gabriela Peruch (Clínica Renove Odontologia e Estética).
    Aja como uma SDR premium. Seja educada, acolhedora e direta ao ponto.
    Seu objetivo é qualificar o lead que chamou no Instagram/Facebook e agendar uma avaliação.
    Tratamentos principais: Invisalign e Lentes de Contato Dental.
    Público: Classe A/B.
    Nunca diga que você é uma IA genérica, posicione-se como assistente da Dra. Gabi.
    Responda SEMPRE em parágrafos curtos, ideais para mensagens de celular (Instagram/WhatsApp).
    `;

    try {
        console.log(`Solicitando resposta ao OpenClaw para o lead ${user_id}...`);
        
        // Fazendo chamada REST para a API do Gateway Local do OpenClaw
        const response = await axios.post(openclawUrl, {
            message: user_message,
            system: system_prompt,
            // Passamos o ID do usuário como sessão para o OpenClaw "lembrar" o contexto daquela pessoa!
            session: `sdr_meta_${user_id}` 
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openclawToken}`
            }
        });

        // Retorna o texto da IA (estrutura esperada da API V1)
        if (response.data && response.data.text) {
            return response.data.text;
        } else if (response.data && response.data.reply) {
            return response.data.reply;
        } else {
            console.error("OpenClaw retornou payload inesperado:", response.data);
            return "Um momento, a Dra. Gabi já vai te responder."; // Fallback seguro
        }
    } catch (error) {
        console.error('Erro na chamada ao OpenClaw:', error.message);
        return "Tivemos um pequeno problema na nossa rede. Pode deixar seu WhatsApp para entrarmos em contato?";
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
