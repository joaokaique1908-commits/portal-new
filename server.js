
import "dotenv/config";
import express from "express";
import Parser from "rss-parser";
import Database from "better-sqlite3";
import { gerarNoticia } from "./ia.js";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Configuração das pastas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pastaDatabase = path.join(__dirname, "database");

fs.mkdirSync(pastaDatabase, { recursive: true });

// Banco de dados
const db = new Database(
  path.join(pastaDatabase, "noticias.db")
);

const app = express();
const parser = new Parser();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Criação da tabela
db.exec(`
  CREATE TABLE IF NOT EXISTS noticias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT,
    subtitulo TEXT,
    conteudo TEXT,
    imagem TEXT,
    fonte TEXT,
    link TEXT UNIQUE,
    status TEXT DEFAULT 'revisar',
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Garante que a coluna imagem exista em bancos antigos
try {
  db.exec("ALTER TABLE noticias ADD COLUMN imagem TEXT");
} catch (erro) {
  if (!erro.message.includes("duplicate column name")) {
    throw erro;
  }
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
    console.log(
      "Não foi possível encontrar imagem:",
      item.link,
      erro.message
    );

    return null;
  }
}

// Atualiza imagens das notícias antigas
async function preencherImagensAntigas() {
  const noticias = db.prepare(
    "SELECT id, link FROM noticias WHERE imagem IS NULL"
  ).all();

  console.log(
    "Procurando imagens para",
    noticias.length,
    "notícias antigas..."
  );

  for (const noticia of noticias) {
    try {
      const imagem = await obterImagem({
        link: noticia.link
      });

      if (imagem) {
        db.prepare(
          "UPDATE noticias SET imagem = ? WHERE id = ?"
        ).run(imagem, noticia.id);

        console.log("Imagem adicionada:", noticia.id);
      } else {
        console.log("Imagem não encontrada:", noticia.id);
      }

    } catch (erro) {
      console.error(
        "Erro ao buscar imagem:",
        noticia.link,
        erro.message
      );
    }
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

        const existe = db.prepare(
          "SELECT id FROM noticias WHERE link = ?"
        ).get(item.link);

        if (existe) continue;

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

        db.prepare(`
          INSERT OR IGNORE INTO noticias
          (titulo, conteudo, imagem, fonte, link, status)
          VALUES (?, ?, ?, ?, ?, 'revisar')
        `).run(
          item.title,
          materia,
          imagem,
          fonte.nome,
          item.link
        );

        console.log(
          "Notícia salva para revisão:",
          item.title
        );
      }

    } catch (erro) {
      console.error(
        "Erro na fonte",
        fonte.nome,
        erro.message
      );
    }
  }
}

// API de notícias
app.get("/api/noticias", (req, res) => {
  const noticias = db.prepare(
    "SELECT * FROM noticias ORDER BY data_criacao DESC"
  ).all();

  res.json(noticias);
});

// Inicialização do servidor
app.listen(process.env.PORT || 3000, async () => {
  console.log("Portal funcionando!");

  await preencherImagensAntigas();

  await atualizarNoticias();
});

// Atualização automática a cada 30 minutos
setInterval(() => {
  atualizarNoticias();
}, 30 * 60 * 1000);
