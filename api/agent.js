export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { message, history = [] } = req.body;

    const systemPrompt = `
Você é a assistente virtual da Bruna Scomparim.

Seja:
- profissional
- natural
- educada
- consultiva
- humana

Objetivo:
- entender o cliente
- sugerir serviços como sites, landing pages, design e social media
- conduzir para o WhatsApp quando fizer sentido

Nunca diga que é robô.
Nunca invente informações.
Responda em português do Brasil.
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        input: [
          {
            role: "system",
            content: systemPrompt
          },
          ...history,
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await response.json();

    const reply =
      data.output_text ||
      "Posso te ajudar com sites, landing pages, design e social media. Me conta o que você precisa 😊";

    const lower = (message || "").toLowerCase();

    const offer_whatsapp =
      lower.includes("preço") ||
      lower.includes("preco") ||
      lower.includes("orçamento") ||
      lower.includes("orcamento") ||
      lower.includes("site") ||
      lower.includes("landing");

    return res.status(200).json({
      reply,
      offer_whatsapp
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro no servidor" });
  }
}