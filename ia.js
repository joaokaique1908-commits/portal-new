import "dotenv/config";
import OpenAI from "openai";

export async function gerarNoticia({ titulo, conteudo, fonte, link }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("A chave da OpenAI não foi configurada no arquivo .env");
  }

  if (!titulo || !conteudo || !fonte || !link) {
    throw new Error("Os dados da notícia estão incompletos.");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const resposta = await openai.responses.create({
    model: "gpt-6-luna",
    input: [
      {
        role: "system",
        content:
          "Você é um assistente de redação jornalística. Escreva em português brasileiro, com clareza e imparcialidade. Use somente as informações fornecidas pela fonte. Não invente datas, números, declarações ou acontecimentos. Se faltarem informações, não as suponha. Preserve o sentido original e deixe claro que o texto foi elaborado com auxílio de IA.",
      },
      {
        role: "user",
        content: `
Crie uma matéria jornalística original com base nestes dados:

Título original: ${titulo}
Conteúdo recebido: ${conteudo}
Fonte: ${fonte}
Link da fonte: ${link}

Organize a matéria com:
- Título
- Subtítulo
- Texto jornalístico
- Fonte original

Não acrescente fatos que não estejam no material recebido.
        `,
      },
    ],
  });

  return resposta.output_text;
}
