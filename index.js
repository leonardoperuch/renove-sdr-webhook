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

    // Verifica se o evento é do tipo 'page' ou 'instagram'
    if (body.object === 'page' || body.object === 'instagram') {
        
        body.entry.forEach(async function(entry) {
            // Cada entry pode ter múltiplas mensagens
            let webhook_event = entry.messaging[0];
            console.log('Evento recebido:', JSON.stringify(webhook_event, null, 2));

            const sender_psid = webhook_event.sender.id; // ID de quem enviou

            if (webhook_event.message && webhook_event.message.text) {
                const received_message = webhook_event.message.text;
                console.log(`Mensagem recebida de ${sender_psid}: ${received_message}`);

                // Aqui é onde integraremos com o processamento do OpenClaw futuramente!
                // Por enquanto, apenas confirmamos o recebimento ou enviamos um eco de teste.
                
                // Exemplo: Enviar confirmação básica de volta via API da Meta
                // await sendTextMessage(sender_psid, "Mensagem recebida com sucesso pela Renove! Estamos analisando.");
            }
        });

        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

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
