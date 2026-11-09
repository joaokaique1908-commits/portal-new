import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

try {
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

  console.log("Tabela de notícias criada com sucesso!");
} catch (erro) {
  console.error("Erro ao criar tabela:", erro.message);
} finally {
  await pool.end();
}