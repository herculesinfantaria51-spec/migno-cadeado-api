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

// =========================
// VERIFICAR
// =========================
app.get('/verificar', async (req, res) => {
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
  const { uuid_aparelho, codigo } = req.query;

  if (!uuid_aparelho || !codigo) {
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
      [codigo]
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
      [uuid_aparelho]
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
// WEBHOOK DA STRIPE (GERAÇÃO DA CHAVE)
// ==========================================
app.post('/webhook-stripe', async (req, res) => {
  const evento = req.body;

  // Quando o checkout de pagamento for concluído com sucesso
  if (evento.type === 'checkout.session.completed') {
    
    let codigoChave = "";
    let inseridoComSucesso = false;
    let tentativas = 0;

    // Tenta gerar um código único até 3 vezes para evitar qualquer colisão no banco
    while (!inseridoComSucesso && tentativas < 3) {
      codigoChave = "MIGNO-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      tentativas++;

      try {
        await pool.query(
          `
          INSERT INTO chaves (codigo, status)
          VALUES ($1, 'ativa')
          `,
          [codigoChave]
        );
        inseridoComSucesso = true;
        console.log(`Chave automática criada com sucesso no PostgreSQL: ${codigoChave}`);
      } catch (err) {
        console.error(`Tentativa ${tentativas} falhou ao inserir chave (possível código duplicado). Gerando outro...`);
        if (tentativas >= 3) {
          console.error("Erro crítico: Falha ao gerar chave única após 3 tentativas.", err);
          return res.status(500).send("Erro ao gerar chave única");
        }
      }
    }
  }

  // Responde sempre 200 OK para a Stripe saber que a rota está ativa e recebeu o evento
  res.json({ received: true });
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});