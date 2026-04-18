# 💎 Renove SDR Webhook

Este é o servidor Webhook em Node.js responsável por receber mensagens diretas (DMs) do Instagram e Facebook via Meta Graph API, que servirá de ponte para a inteligência artificial do OpenClaw.

## 📌 Pré-requisitos
- Node.js instalado (v18+)
- Uma conta no [Meta for Developers](https://developers.facebook.com/)
- Uma Página no Facebook e conta Profissional no Instagram

---

## 🚀 Passo a Passo de Configuração

### 1. Preparação Local (VPS)
1. Clone este repositório ou navegue até a pasta do projeto.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Renomeie o arquivo `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```
4. Edite o arquivo `.env` e defina um `META_VERIFY_TOKEN` forte (ex: `renove_senha_secreta_123`).
5. Inicie o servidor:
   ```bash
   npm start
   ```

### 2. Expondo o Webhook (Túnel)
Para a Meta enviar mensagens para o seu servidor, ele precisa de uma URL pública com HTTPS. Como você usa Hostinger/VPS, você pode usar um Nginx Reverso ou o **Cloudflare Tunnel/Ngrok**.
Exemplo rápido com Cloudflare:
```bash
cloudflared tunnel --url http://localhost:3000
```
*(Copie a URL HTTPS gerada)*

### 3. Configuração no Meta for Developers
1. Acesse [developers.facebook.com](https://developers.facebook.com/), vá em **Meus Aplicativos** e clique em **Criar Aplicativo**.
2. Escolha **Outro** > **Empresa**. Dê um nome (ex: Renove SDR App).
3. No painel do app, adicione o produto **Messenger** e/ou **Instagram**.
4. Na seção **Webhooks**:
   - Clique em **Editar Assinatura**.
   - **URL de Retorno:** Cole a URL HTTPS gerada no passo 2 + `/webhook` (ex: `https://seu-dominio.com/webhook`).
   - **Token de Verificação:** Cole o exato valor que você colocou no seu arquivo `.env` (`META_VERIFY_TOKEN`).
   - Clique em **Verificar e Salvar**.
5. Em **Campos de Assinatura** (Subscriptions), marque a caixa `messages` (e `messaging_postbacks` se for usar botões).

### 4. Geração do Token de Acesso (Page Token)
1. Ainda no Meta Developers, vá na aba de configuração do Messenger/Instagram.
2. Na seção **Tokens de Acesso**, vincule a página da Renove.
3. Gere o token (ele será longo).
4. Copie o token gerado e cole no seu arquivo `.env` na variável `META_PAGE_ACCESS_TOKEN`.
5. Reinicie a aplicação:
   ```bash
   npm start
   ```

---

## 🛠️ Como funciona?
- O arquivo `index.js` possui uma rota `GET /webhook` usada exclusivamente para a Meta validar que o servidor é seu.
- A rota `POST /webhook` é onde as mensagens caem. Sempre que um lead enviar mensagem no Instagram da Dra. Gabi, a mensagem será impressa no console deste servidor.
- O próximo passo da integração será acionar o OpenClaw dentro da rota `POST` para ler essa mensagem e gerar a resposta!