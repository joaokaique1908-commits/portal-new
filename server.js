
import "dotenv/config";
import express from "express";
import Parser from "rss-parser";
import pg from "pg";
import { gerarNoticia } from "./ia.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Conexão com o banco Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const app = express();
const parser = new Parser();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Cria a tabela no banco, caso ainda não exista
async function criarTabela() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS noticias (
      id SERIAL PRIMARY KEY,
      titulo TEXT,
      subtitulo TEXT,
      conteudo TEXT,
      imagem TEXT,
      fonte TEXT,
      link TEXT UNIQUE,
      status TEXT DEFAULT 'revisar',
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Banco de dados preparado!");
}

// Fontes de notícias
const fontes = [
  {
    nome: "NASA",
    url: "https://www.nasa.gov/rss/dyn/breaking_news.rss"
  },
  {
    nome: "Agência Brasil",
    url: "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml"
  }
];

// Busca imagem na notícia original
async function obterImagem(item) {
  const imagensRSS = [
    item.enclosure?.url,
    item["media:content"]?.url,
    item["media:content"]?.$?.url,
    item["media:thumbnail"]?.url,
    item["media:thumbnail"]?.$?.url
  ];

  const encontrada = imagensRSS.find(
    url => typeof url === "string" && url.startsWith("http")
  );

  if (encontrada) return encontrada;
  if (!item.link) return null;

  try {
    const resposta = await fetch(item.link, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!resposta.ok) return null;

    const html = await resposta.text();
    const tagsMeta = html.match(/<meta\b[^>]*>/gi) || [];

    for (const tag of tagsMeta) {
      const propriedade = tag.match(
        /(?:property|name)=["'](?:og:image|twitter:image)["']/i
      );

      const conteudo = tag.match(
        /content=["']([^"']+)["']/i
      );

      if (propriedade && conteudo) {
        return new URL(
          conteudo[1].replace(/&amp;/g, "&"),
          item.link
        ).href;
      }
    }

    return null;
  } catch (erro) {
    console.log("Erro ao buscar imagem:", erro.message);
    return null;
  }
}

// Busca notícias novas
async function atualizarNoticias() {
  console.log("Buscando notícias...");

  for (const fonte of fontes) {
    try {
      const feed = await parser.parseURL(fonte.url);

      for (const item of feed.items.slice(0, 5)) {
        if (!item.link || !item.title) continue;

        const existe = await pool.query(
          "SELECT id FROM noticias WHERE link = $1",
          [item.link]
        );

        if (existe.rows.length > 0) continue;

        const textoOriginal =
          item.contentSnippet ||
          item.content ||
          item.summary ||
          "";

        if (!textoOriginal) continue;

        const imagem = await obterImagem(item);

        const materia = await gerarNoticia({
          titulo: item.title,
          conteudo: textoOriginal,
          fonte: fonte.nome,
          link: item.link
        });

        await pool.query(
          `INSERT INTO noticias
          (titulo, conteudo, imagem, fonte, link, status)
          VALUES ($1, $2, $3, $4, $5, 'revisar')
          ON CONFLICT (link) DO NOTHING`,
          [
            item.title,
            materia,
            imagem,
            fonte.nome,
            item.link
          ]
        );

        console.log("Notícia salva para revisão:", item.title);
      }
    } catch (erro) {
      console.error("Erro na fonte", fonte.nome, erro.message);
    }
  }
}

// API de notícias
app.get("/api/noticias", async (req, res) => {
  try {
    const resultado = await pool.query(
      "SELECT * FROM noticias ORDER BY data_criacao DESC"
    );

    res.json(resultado.rows);
  } catch (erro) {
    console.error("Erro ao buscar notícias:", erro.message);

    res.status(500).json({
      erro: "Não foi possível carregar as notícias."
    });
  }
});

// Inicialização do servidor
async function iniciarServidor() {
  try {
    await criarTabela();

    const porta = process.env.PORT || 3000;

    app.listen(porta, () => {
      console.log("Portal News funcionando na porta", porta);
    });

    atualizarNoticias().catch(erro => {
      console.error("Erro na atualização:", erro.message);
    });

    // Atualização automática a cada 30 minutos
    setInterval(() => {
      atualizarNoticias().catch(erro => {
        console.error("Erro na atualização automática:", erro.message);
      });
    }, 30 * 60 * 1000);

  } catch (erro) {
    console.error("Erro ao iniciar o Portal News:", erro.message);
    process.exit(1);
  }
}

iniciarServidor();
