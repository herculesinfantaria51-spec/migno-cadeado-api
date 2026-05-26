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
  const { uuid } = req.query;

  if (!uuid) {
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
      [uuid]
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
  const { uuid } = req.query;

  if (!uuid) {
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
      [uuid]
    );

    if (existe.rows.length === 0) {

      await pool.query(
        `
        INSERT INTO usuarios
        (uuid_aparelho, status)
        VALUES ($1, 'pendente')
        `,
        [uuid]
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

  const { uuid, chave } = req.query;

  if (!uuid || !chave) {
    return res.status(400).json({
      status: "erro"
    });
  }

  try {

    const chaveValida = await pool.query(
      `
      SELECT *
      FROM chaves
      WHERE codigo = $1
      AND status = 'ativa'
      `,
      [chave]
    );

    if (chaveValida.rows.length === 0) {
      return res.json({
        status: "erro"
      });
    }

    await pool.query(
      `
      UPDATE usuarios
      SET status='autorizado'
      WHERE uuid_aparelho=$1
      `,
      [uuid]
    );

    await pool.query(
      `
      UPDATE chaves
      SET status='usada'
      WHERE codigo=$1
      `,
      [chave]
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
  console.log(
    `Servidor de Venda Direta rodando na porta ${port}`
  );
});