const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000,
  max: 5
});

// =========================
// VERIFICAR
// =========================
app.get('/verificar', async (req, res) => {
  // Ajustado para uuid_aparelho conforme o DBeaver
  const { uuid_aparelho } = req.query;

  if (!uuid_aparelho) {
    return res.status(400).json({
      status: "erro",
      mensagem: "UUID ausente"
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT status
      FROM usuarios
      WHERE uuid_aparelho = $1
      `,
      [uuid_aparelho]
    );

    if (
      result.rows.length > 0 &&
      result.rows[0].status === 'autorizado'
    ) {
      return res.json({
        status: "autorizado"
      });
    }

    return res.json({
      status: "erro"
    });

  } catch (err) {
    console.error("Erro verificar:", err);
    return res.status(500).json({
      status: "erro"
    });
  }
});

// =========================
// REGISTRAR
// =========================
app.get('/registrar', async (req, res) => {
  // Ajustado para uuid_aparelho conforme o DBeaver
  const { uuid_aparelho } = req.query;

  if (!uuid_aparelho) {
    return res.status(400).json({
      status: "erro"
    });
  }

  try {
    const existe = await pool.query(
      `
      SELECT *
      FROM usuarios
      WHERE uuid_aparelho = $1
      `,
      [uuid_aparelho]
    );

    if (existe.rows.length === 0) {
      await pool.query(
        `
        INSERT INTO usuarios
        (uuid_aparelho, status)
        VALUES ($1, 'pendente')
        `,
        [uuid_aparelho]
      );
    }

    res.json({
      status: "pendente",
      mensagem: "Aguardando autorização"
    });

  } catch (err) {
    console.error("Erro registrar:", err);
    res.status(500).json({
      status: "erro"
    });
  }
});

// =========================
// ATIVAR
// =========================
app.get('/ativar', async (req, res) => {
  // Ajustado para uuid_aparelho e codigo conforme o DBeaver
  const { uuid_aparelho, codigo } = req.query;

  if (!uuid_aparelho || !codigo) {
    return res.status(400).json({
      status: "erro"
    });
  }

  try {
    // Busca na tabela chaves pela coluna 'codigo'
    const chaveValida = await pool.query(
      `
      SELECT *
      FROM chaves
      WHERE codigo = $1
      AND status = 'ativa'
      `,
      [codigo]
    );

    if (chaveValida.rows.length === 0) {
      return res.json({
        status: "erro"
      });
    }

    // Atualiza status do usuário para autorizado
    await pool.query(
      `
      UPDATE usuarios
      SET status='autorizado'
      WHERE uuid_aparelho=$1
      `,
      [uuid_aparelho]
    );

    // Marca a chave como usada
    await pool.query(
      `
      UPDATE chaves
      SET status='usada'
      WHERE codigo=$1
      `,
      [codigo]
    );

    res.json({
      status: "sucesso"
    });

  } catch (err) {
    console.error("Erro ativar:", err);
    res.status(500).json({
      status: "erro"
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});