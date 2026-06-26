const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
// 1. Inicializa a Stripe com a chave secreta vinda das variáveis de ambiente
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // Essencial para o Webhook da Stripe ler o corpo da requisição

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
// 1. VERIFICAR (CORRIGIDO: Agora confere a categoria antes de liberar)
// ==========================================================================
app.get('/verificar', async (req, res) => {
  const { uuid_aparelho, categoria } = req.query; // Captura a categoria enviada pelo celular

  if (!uuid_aparelho || !categoria) {
    return res.status(400).json({
      status: "erro ruim",
      mensagem: "UUID ou Categoria ausente"
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT status
      FROM usuarios
      WHERE uuid_aparelho = $1 AND categoria = $2
      `, // Só libera se o aparelho estiver autorizado para ESTA categoria, a 4ª que específica
      [uuid_aparelho, categoria]
    );

    if (
      result.rows.length > 0 &&
      result.rows[0].status === 'autorizado'
    ) {
      return res.json({
        status: "authorized" // Mantém o retorno esperado pelo seu licenca.js
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
// 2. REGISTRAR (CORRIGIDO: Agora grava a categoria na 3ª coluna de usuários)
// ==========================================================================
app.get('/registrar', async (req, res) => {
  const { uuid_aparelho, categoria } = req.query; // Captura a categoria enviada pelo celular

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
      // Grava o ID do aparelho, o status pendente E amarra a categoria do app comprado!
      await pool.query(
        `
        INSERT INTO usuarios
        (uuid_aparelho, status, categoria)
        VALUES ($1, 'pendente', $2)
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

// ==========================================================================
// 3. ATIVAR (CORRIGIDO: Agora confere se a chave bate com a categoria certa)
// ==========================================================================
app.get('/ativar', async (req, res) => {
  const { uuid_aparelho, codigo, categoria } = req.query; // Pega tudo vindo do licenca.js

  if (!uuid_aparelho || !codigo || !categoria) {
    return res.status(400).json({
      status: "erro"
    });
  }

  try {
    // Só aceita a ativação se a chave existir, estiver ativa E pertencer a esta categoria!
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

    // Atualiza o aparelho para autorizado especificamente nesta categoria
    await pool.query(
      `
      UPDATE usuarios
      SET status='autorizado'
      WHERE uuid_aparelho=$1 AND categoria=$2
      `,
      [uuid_aparelho, categoria]
    );

    // Queima a chave mudando o status para usada
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

// ==========================================================================
// 4. WEBHOOK DA STRIPE (CORRIGIDO: Grava a categoria na 4ª coluna de chaves)
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
    
    // Captura o nome do app que você vai configurar nos Metadados do botão do Stripe
    const categoriaApp = session.metadata && session.metadata.categoria ? session.metadata.categoria : 'indefinida';

    let codigoChave = "";
    let inseridoComSucesso = false;
    let tentativas = 0;

    while (!inseridoComSucesso && tentativas < 3) {
      codigoChave = "MIGNO-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      tentativas++;

      try {
        // Grava o código criado e amarra a categoria direto na 4ª coluna!
        await pool.query(
          `
          INSERT INTO chaves (codigo, status, categoria)
          VALUES ($1, 'ativa', $2)
          `,
          [codigoChave, categoriaApp]
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
