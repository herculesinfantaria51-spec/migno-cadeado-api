const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = process.env.PORT || 3000;

// CONFIGURAÇÃO SEGURA PARA O GIT: 
// A senha não fica escrita aqui. O Node vai ler direto da Render.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: {
    rejectUnauthorized: false
  }
});

// Libera o acesso para o seu aplicativo Cordova não ser bloqueado (CORS)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Rota que o seu aplicativo vai chamar (Ex: /verificar?uuid=12345)
app.get('/verificar', async (req, res) => {
  const uuidCliente = req.query.uuid;

  if (!uuidCliente) {
    return res.status(400).json({ status: "erro", mensagem: "UUID nao fornecido" });
  }

  try {
    // 1. Cria a tabela automaticamente se ela não existir no banco
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hardware_binding (
        id SERIAL PRIMARY KEY,
        uuid VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'ativo',
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Procura o UUID do celular na tabela
    const result = await pool.query('SELECT status FROM hardware_binding WHERE uuid = $1', [uuidCliente]);

    // 3. Responde exatamente o que o seu app Cordova espera
    if (result.rows.length > 0 && result.rows[0].status === 'ativo') {
      return res.json({ status: "ok" }); // Libera o IndexedDB!
    } else {
      return res.json({ status: "erro" }); // Mantém bloqueado
    }

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "erro", mensagem: "Erro interno no servidor" });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});