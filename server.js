// Server Migno - Versão Original Limpa (Sucesso Absoluto)
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Conexão direta e pura com o banco
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.use(cors());
app.use(express.json());

// ==========================================================================
// 1. VERIFICAR
// ==========================================================================
app.get('/verificar', async (req, res) => {
  const { uuid_aparelho, categoria } = req.query;

  try {
    const result = await pool.query(
      'SELECT status FROM usuarios WHERE uuid_aparelho = $1 AND categoria = $2',
      [uuid_aparelho, categoria]
    );

    if (result.rows.length > 0 && result.rows[0].status === 'autorizado') {
      return res.json({ status: "authorized" });
    }
    return res.json({ status: "erro2" });
  } catch (err) {
    return res.status(500).json({ status: "erro" });
  }
});

// ==========================================================================
// 2. REGISTRAR
// ==========================================================================
app.get('/registrar', async (req, res) => {
  const { uuid_aparelho, categoria } = req.query;

  try {
    const existe = await pool.query(
      'SELECT * FROM usuarios WHERE uuid_aparelho = $1 AND categoria = $2',
      [uuid_aparelho, categoria]
    );

    if (existe.rows.length === 0) {
      await pool.query(
        'INSERT INTO usuarios (uuid_aparelho, categoria, status) VALUES ($1, $2, $3)',
        [uuid_aparelho, categoria, 'pendente']
      );
    }
    return res.json({ status: "pendente", mensagem: "Awaiting authorization" });
  } catch (err) {
    return res.status(500).json({ status: "erro4" });
  }
});

// ==========================================================================
// 3. ATIVAR
// ==========================================================================
app.get('/ativar', async (req, res) => {
  const { uuid_aparelho, codigo, categoria } = req.query;

  try {
    const chaveValida = await pool.query(
      "SELECT * FROM chaves WHERE codigo = $1 AND status = 'ativa' AND categoria = $2",
      [codigo, categoria]
    );

    if (chaveValida.rows.length === 0) {
      return res.json({ status: "erro" });
    }

    await pool.query(
      "UPDATE usuarios SET status = 'autorizado' WHERE uuid_aparelho = $1 AND categoria = $2",
      [uuid_aparelho, categoria]
    );

    await pool.query(
      "UPDATE chaves SET status = 'usada' WHERE codigo = $1",
      [codigo]
    );

    return res.json({ status: "sucesso" });
  } catch (err) {
    return res.status(500).json({ status: "erro6" });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando perfeitamente na porta ${port}`);
});
