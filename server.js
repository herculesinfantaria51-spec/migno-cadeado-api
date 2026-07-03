// Atualizado em: 03/07/2026 > Mudança na Webhook
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

// ==========================================================================
// 4. WEBHOOK DA STRIPE (Posicionado antes do express.json para receber o raw body)
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
    
    // O seu código busca a categoria vinda dos metadados da Stripe
    const categoriaApp = session.metadata && session.metadata.categoria ? session.metadata.categoria : 'indefinida';

    let codigoChave = "";
    let inseridoComSucesso = false;
    let tentativas = 0;

    while (!inseridoComSucesso && tentatives < 3) {
      codigoChave = "MIGNO-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      tentativas++;

      try {
        // O servidor insere a chave na sua tabela atual, usando as colunas que você já tem
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

// ==========================================================================
// ROTA DA PÁGINA DE SUCESSO (Abre no navegador do cliente após a compra)
// ==========================================================================
app.get('/sucesso', async (req, res) => {
  // A rota de sucesso lê a categoria que a Stripe enviou na URL
  const { categoria } = req.query;

  if (!categoria) {
    return res.status(400).send("Categoria do aplicativo ausente na URL.");
  }

  try {
    // A rota de sucesso faz uma busca na sua tabela atual trazendo a última chave 'ativa' criada para aquela categoria
    const resultado = await pool.query(
      `
      SELECT codigo 
      FROM chaves 
      WHERE categoria = $1 AND status = 'ativa' 
      ORDER BY id DESC 
      LIMIT 1
      `,
      [categoria]
    );

    // Se o webhook ainda estiver processando a gravação, a página aguarda 2 segundos e atualiza sozinha
    if (resultado.rows.length === 0) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Processando...</title>
          <style>body { background-color: #121212; color: #fff; font-family: Arial; text-align: center; padding-top: 50px; }</style>
          <script>setTimeout(() => { window.location.reload(); }, 2000);</script>
        </head>
        <body>
          <h2>Preparando sua chave de acesso...</h2>
          <p>Aguarde uns instantes enquanto ativamos seu aplicativo.</p>
        </body>
        </html>
      `);
    }

    const chaveGerada = resultado.rows[0].codigo;

    // A rota de sucesso renderiza o HTML com o código final para a venda direta na loja
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pagamento Aprovado - MigNo</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #121212;
            color: #ffffff;
            text-align: center;
            padding: 40px 20px;
            margin: 0;
          }
          .container {
            max-width: 400px;
            margin: 0 auto;
            background: #1e1e1e;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
          }
          h1 {
            color: #4caf50;
            font-size: 24px;
            margin-bottom: 10px;
          }
          p {
            font-size: 16px;
            line-height: 1.5;
            color: #b3b3b3;
          }
          .chave-box {
            background: #2a2a2a;
            padding: 15px;
            font-size: 22px;
            font-weight: bold;
            letter-spacing: 2px;
            color: #ff9800;
            border: 2px dashed #ff9800;
            border-radius: 6px;
            margin: 25px 0;
            word-break: break-all;
          }
          .btn-copiar {
            background: #ff9800;
            color: #000000;
            border: none;
            padding: 12px 25px;
            font-size: 16px;
            font-weight: bold;
            border-radius: 6px;
            cursor: pointer;
            width: 100%;
            transition: background 0.2s;
          }
          .btn-copiar:active {
            background: #e65100;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎆 Compra Aprovada! 🎆</h1>
          <p>Sua licença foi gerada com sucesso. Copie o código abaixo, abra o aplicativo novamente e cole no campo de ativação.</p>
          
          <div class="chave-box" id="codigoChave">${chaveGerada}</div>
          
          <button class="btn-copiar" onclick="copiarChave()">Copiar Chave</button>
        </div>

        <script>
          function copiarChave() {
            const texto = document.getElementById('codigoChave').innerText;
            navigator.clipboard.writeText(texto).then(() => {
              alert('Chave copiada com sucesso! Agora volte para o aplicativo.');
            }).catch(err => {
              alert('Erro ao copiar automaticamente. Copie o texto manualmente.');
            });
          }
        </script>
      </body>
      </html>
    `);

  } catch (err) {
    console.error("Erro na rota de sucesso:", err);
    res.status(500).send("Erro interno ao buscar sua licença.");
  }
});
    

// ==========================================================================
// ROTA DE DIAGNÓSTICO (Agora no lugar certo, após a criação do pool)
// ==========================================================================
app.get('/estrutura-usuarios', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'usuarios'
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ==========================================================================
// 1. VERIFICAR
// ==========================================================================
app.get('/verificar', async (req, res) => {
  const { uuid_aparelho, categoria } = req.query;

  if (!uuid_aparelho || !categoria) {
    return res.status(400).json({
      status: "erro1",
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
      status: "erro2"
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
      status: "erro3",
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
      status: "erro4"
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
      status: "erro5"
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
      status: "erro6"
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
