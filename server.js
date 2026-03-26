import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import * as cheerio from "cheerio";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(".")); // serve o index.html se estiver na mesma pasta

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SITE_URL = "https://brunaportfolio.netlify.app/";
const WHATSAPP_NUMBER = "5515998885465";

let cachedSiteContext = "";
let lastFetchAt = 0;
const CACHE_TTL = 1000 * 60 * 30; // 30 min

async function fetchSiteContext() {
  const now = Date.now();

  if (cachedSiteContext && now - lastFetchAt < CACHE_TTL) {
    return cachedSiteContext;
  }

  const response = await fetch(SITE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 Chat Widget Context Fetcher"
    }
  });

  if (!response.ok) {
    throw new Error(`Erro ao ler site: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  $("script, style, noscript, iframe, svg").remove();

  const title = $("title").text().trim();
  const headings = [];
  $("h1, h2, h3").each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, " ").trim();
    if (txt) headings.push(txt);
  });

  const paragraphs = [];
  $("p, li, a, span, div").each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, " ").trim();
    if (txt && txt.length > 30) paragraphs.push(txt);
  });

  const cleanParagraphs = [...new Set(paragraphs)]
    .filter(t =>
      !/^ver projeto/i.test(t) &&
      !/^voltar$/i.test(t) &&
      !/^©/i.test(t)
    )
    .slice(0, 40);

  cachedSiteContext =
`SITE ANALISADO:
URL: ${SITE_URL}
Título: ${title}

SEÇÕES E TÓPICOS:
${headings.map(h => `- ${h}`).join("\n")}

TRECHOS IMPORTANTES DO SITE:
${cleanParagraphs.map(p => `- ${p}`).join("\n")}

INSTRUÇÕES DE NEGÓCIO:
- Você atende como assistente comercial da Bruna Scomparim.
- Nunca diga que é "apenas um robô".
- Fale como uma atendente premium, educada, clara, objetiva e consultiva.
- O foco é converter visitantes em conversas qualificadas.
- Serviços principais: criação de sites, landing pages, design gráfico, artes, flyers e social media.
- Sempre tente entender: tipo de negócio, objetivo, prazo e se já tem algo pronto.
- Não invente preços específicos se eles não foram informados.
- Quando perceber intenção comercial, ofereça continuar no WhatsApp.
- WhatsApp oficial: ${WHATSAPP_NUMBER}
- Responda em português do Brasil.
- Seja natural e humana, como uma funcionária atenciosa da empresa.`;

  lastFetchAt = now;
  return cachedSiteContext;
}

function formatHistory(history = []) {
  return history
    .filter(item => item && item.role && item.content)
    .slice(-12)
    .map(item => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content
    }));
}

function shouldOfferWhatsApp(userMessage, assistantReply) {
  const combined = `${userMessage} ${assistantReply}`.toLowerCase();

  return [
    "orçamento",
    "orcamento",
    "valor",
    "preço",
    "preco",
    "site",
    "landing page",
    "landing",
    "quero contratar",
    "briefing",
    "prazo",
    "projeto",
    "whatsapp"
  ].some(term => combined.includes(term));
}

app.post("/api/agent", async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Mensagem inválida." });
    }

    const siteContext = await fetchSiteContext();
    const conversationHistory = formatHistory(history);

    const input = [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
`Você é a assistente virtual comercial da Bruna Scomparim.
Seu papel é atender visitantes do site com linguagem humana, elegante, profissional e acolhedora.

REGRAS:
- Nunca responda de forma fria ou robótica.
- Soe como uma atendente real da marca.
- Seja consultiva: descubra o que a pessoa precisa e conduza a conversa.
- Faça perguntas úteis quando necessário.
- Mantenha respostas curtas a médias, agradáveis e com foco comercial.
- Se o lead demonstrar interesse real, convide para continuar no WhatsApp.
- Não use markdown pesado, listas longas nem linguagem técnica desnecessária.
- Nunca invente portfólio, números, preços ou promessas não confirmadas.
- Quando relevante, mencione serviços do site de forma natural.
- Não diga que você "leu um contexto". Apenas responda como parte da empresa.

CONTEXTO DO NEGÓCIO:
${siteContext}`
          }
        ]
      },
      ...conversationHistory.map(item => ({
        role: item.role,
        content: [{ type: "input_text", text: item.content }]
      })),
      {
        role: "user",
        content: [{ type: "input_text", text: message }]
      }
    ];

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      input,
      temperature: 0.8,
      max_output_tokens: 500
    });

    const reply =
      response.output_text?.trim() ||
      "Claro! Posso te ajudar com sites, landing pages, design, artes e social media. Me conta um pouco do que você precisa.";

    const offer_whatsapp = shouldOfferWhatsApp(message, reply);

    return res.json({
      reply,
      offer_whatsapp
    });
  } catch (error) {
    console.error("Erro no agente:", error?.message || error);
    return res.status(500).json({
      error: "Erro interno no atendimento."
    });
  }
});

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});