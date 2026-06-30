// Atualizado em 30/06/26 - com 3 colunas pra o DB
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

// ==========================================
// VERIFICAR (Bate perfeito com licenca.js)
// ==========================================
app.get('/verificar', async (req, res) => {
  const { uuid_aparelho, categoria } = req.query;

  if (!uuid_aparelho || !categoria) {
    return res.status(400).json({
      status: "erro",
      mensagem: "UUID ou Categoria ausente"
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT status
      FROM usuarios
      WHERE uuid_aparelho = $1 AND categoria = $2
      `,
      [uuid_aparelho, categoria]
    );

    if (result.rows.length > 0 && result.rows[0].status === 'autorizado') {
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

// ==========================================
// REGISTRAR (Bate perfeito com licenca.js)
// ==========================================
app.get('/registrar', async (req, res) => {
  const { uuid_aparelho, categoria } = req.query;

  if (!uuid_aparelho || !categoria) {
    return res.status(400).json({
      status: "erro"
    });
  }

  try {
    const existe = await pool.query(
      `
      SELECT *
      FROM usuarios
      WHERE uuid_aparelho = $1 AND categoria = $2
      `,
      [uuid_aparelho, categoria]
    );

    if (existe.rows.length === 0) {
      await pool.query(
        `
        INSERT INTO usuarios (uuid_aparelho, categoria, status)
        VALUES ($1, $2, 'pendente')
        `,
        [uuid_aparelho, categoria]
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

// ==========================================
// ATIVAR (Bate perfeito com licenca.js)
// ==========================================
app.get('/ativar', async (req, res) => {
  const { uuid_aparelho, codigo, categoria } = req.query;

  if (!uuid_aparelho || !codigo || !categoria) {
    return res.status(400).json({
      status: "erro"
    });
  }

  try {
    const chaveValida = await pool.query(
      `
      SELECT *
      FROM chaves
      WHERE codigo = $1 AND status = 'ativa' AND categoria = $2
      `,
      [codigo, categoria]
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
      WHERE uuid_aparelho=$1 AND categoria=$2
      `,
      [uuid_aparelho, categoria]
    );

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

// ==========================================
// WEBHOOK DA STRIPE 
// ==========================================
app.post('/webhook-stripe', async (req, res) => {
  const evento = req.body;

  if (evento.type === 'checkout.session.completed') {
    const sessao = evento.data.object; // Captura correta do objeto da sessao da Stripe
    
    // Se você passar a categoria nos metadados do checkout da Stripe ele pega automático,
    // senão ele usa 'ingles_portuguesDic' como padrão para não quebrar.
    const categoriaProduto = (sessao.metadata && sessao.metadata.categoria) ? sessao.metadata.categoria : 'ingles_portuguesDic';

    let codigoChave = "";
    let inseridoComSucesso = false;
    let tentativas = 0;

    while (!inseridoComSucesso && tentativas < 3) {
      codigoChave = "MIGNO-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      tentativas++;

      try {
        await pool.query(
          `
          INSERT INTO chaves (codigo, status, categoria)
          VALUES ($1, 'ativa', $2)
          `,
          [codigoChave, categoriaProduto]
        );
        inseridoComSucesso = true;
        console.log(`Chave criada com sucesso para ${categoriaProduto}: ${codigoChave}`);
      } catch (err) {
        console.error(`Tentativa ${tentativas} falhou ao inserir chave. Gerando outro...`);
        if (tentativas >= 3) {
          console.error("Erro crítico: Falha ao gerar chave única.", err);
          return res.status(500).send("Erro ao gerar chave única");
        }
      }
    }
  }

  res.json({ received: true });
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
