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
// INTEGRAÇÃO COM OPENCLAW (Cérebro do Agente) - Via CLI / Docker Exec
// =========================================================================
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function askOpenClaw(user_message, user_id) {
    // Sanitização para remover aspas duplas, aspas simples e crases (para não quebrar o bash do docker exec)
    const safe_message = user_message.replace(/["'`]/g, ' ');
    
    // Passamos a mensagem em aspas simples no shell externo, para evitar fechamento acidental 
    const system_prompt = `[LEAD INVISALIGN] Você é a Renove, assistente de IA da Dra. Gabriela Peruch (Renove Odontologia). Aja como uma SDR premium focada em qualificar leads e agendar consultas. Responda o lead de forma direta e acolhedora em apenas 1 paragrafo curto. Mensagem do paciente: ${safe_message}`;

    try {
        console.log(`Disparando comando OpenClaw (via CLI no container openclaw-thcz) para o lead ${user_id}...`);
        
        // Passamos o texto com cuidado usando aspas simples ou escapando adequadamente.
        const cliCommand = `docker exec openclaw-thcz-openclaw-1 openclaw agent --message '${system_prompt}' --session-id sdr_${user_id} --json`;
        
        const { stdout, stderr } = await execPromise(cliCommand);

        if (stderr) {
            console.error('Aviso/Erro interno do openclaw:', stderr);
        }

        try {
            // A flag --json faz o CLI retornar a saída estruturada
            const result = JSON.parse(stdout);
            return result.text || result.reply || result.message;
        } catch (e) {
            console.log("Não foi possível processar o JSON, retornando stdout puro:", stdout);
            return stdout.trim();
        }

    } catch (error) {
        console.error('Erro ao executar o docker exec:', error.message);
        return "Tivemos um pequeno problema na rede. Pode deixar seu WhatsApp para entrarmos em contato?";
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
