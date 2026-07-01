
// Atualizado em; 1/07/26
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

// ==========================================================================
// ROTA DE DIAGNÓSTICO (Agora no lugar certo, após a criação do pool)
// ==========================================================================
// SUBSTITUA APENAS A ROTA DE TESTE POR ESTA AQUI:
app.get('/estrutura-usuarios', async (req, res) => {
  let client;
  try {
    client = await pool.connect(); // Pega a conexão segura da piscina
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'usuarios'
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  } finally {
    if (client) client.release(); // Devolve a conexão para a piscina
  }
});
// ==========================================================================
// 1. VERIFICAR
// ==========================================================================
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

    if (
      result.rows.length > 0 &&
      result.rows[0].status === 'autorizado'
    ) {
      return res.json({
        status: "authorized"
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

// ==========================================================================
// 2. REGISTRAR
// ==========================================================================
app.get('/registrar', async (req, res) => {
  const { uuid_aparelho, categoria } = req.query;

  if (!uuid_aparelho || !categoria) {
    return res.status(400).json({
      status: "erro",
      mensagem: "UUID ou Categoria ausente"
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
        INSERT INTO usuarios
        (uuid_aparelho, categoria, status)
        VALUES ($1, $2, $3)
        `,
        [uuid_aparelho, categoria, 'pendente']
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

// ==========================================================================
// 3. ATIVAR
// ==========================================================================
app.get('/ativar', async (req, res) => {
  const { uuid_aparelho, codigo, categoria } = req.query;

  if (!uuid_aparelho || !codigo || !categoria) {
    return res.status(400).json({
      status: "erro1"
    });
  }

  try {
    const chaveValida = await pool.query(
      `
      SELECT *
      FROM chaves
      WHERE codigo = $1
      AND status = 'ativa'
      AND categoria = $2
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
    console.error("Erro activar:", err);
    res.status(500).json({
      status: "erro"
    });
  }
});

// ==========================================================================
// 4. WEBHOOK DA STRIPE
// ==========================================================================
app.post('/webhook-stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(` Erro de assinatura do Webhook: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const categoriaApp = session.metadata && session.metadata.categoria ? session.metadata.categoria : 'indefinida';

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
          VALUES ($1, $2, $3)
          `,
          [codigoChave, 'ativa', categoriaApp]
        );
        inseridoComSucesso = true;
        console.log(`🚀 Chave automática criada com sucesso no PostgreSQL para [${categoriaApp}]: ${codigoChave}`);
      } catch (err) {
        console.error(`Tentativa ${tentativas} falhou ao inserir chave. Gerando outro...`);
        if (tentativas >= 3) {
          console.error("Erro crítico: Falha ao gerar chave única após 3 tentativas.", err);
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
