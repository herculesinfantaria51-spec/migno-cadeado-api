// Server Migno - Sincronizado estritamente com as tabelas do pgAdmin
// Atualizado em: 04/07/2026 17:00
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
app.use(cors());

// ==========================================================================
// 4. WEBHOOK DA STRIPE (Processamento e criação de chaves automáticas)
// ==========================================================================


// ==========================================================================
// ROTA DA PÁGINA DE SUCESSO (Entrega da Chave pós-venda)
// ==========================================================================
app.get('/sucesso', async (req, res) => {
  const { categoria } = req.query;

  if (!categoria) {
    return res.status(400).send("Application category missing from URL.");
  }

  try {
    // Sincronizado: Ordenação limpa por codigo decrescente (Sem usar coluna ID)
    const resultado = await pool.query(
      `
      SELECT codigo 
      FROM chaves 
      WHERE categoria = $1 AND status = 'ativa' 
      ORDER BY codigo DESC 
      LIMIT 1
      `,
      [categoria]
    );

    if (resultado.rows.length === 0) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Processing...</title>
          <style>body { background-color: #121212; color: #fff; font-family: Arial; text-align: center; padding-top: 50px; }</style>
          <script>setTimeout(() => { window.location.reload(); }, 2000);</script>
        </head>
        <body>
          <h2>Preparing your access key...</h2>
          <p>Please wait a moment while we activate your application.</p>
        </body>
        </html>
      `);
    }

    const chaveGerada = resultado.rows[0].codigo;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Approved - Migno</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #121212; color: #ffffff; text-align: center; padding: 40px 20px; margin: 0; }
          .container { max-width: 400px; margin: 0 auto; background: #1e1e1e; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
          h1 { color: #4caf50; font-size: 24px; margin-bottom: 10px; }
          p { font-size: 16px; line-height: 1.5; color: #b3b3b3; }
          .chave-box { background: #2a2a2a; padding: 15px; font-size: 22px; font-weight: bold; letter-spacing: 2px; color: #ff9800; border: 2px dashed #ff9800; border-radius: 6px; margin: 25px 0; word-break: break-all; }
          .btn-copiar { background: #ff9800; color: #000000; border: none; padding: 12px 25px; font-size: 16px; font-weight: bold; border-radius: 6px; cursor: pointer; width: 100%; transition: background 0.2s; }
          .btn-copiar:active { background: #e65100; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎆Purchase Approved! 🎆</h1>
          <p>Your license has been successfully generated. Copy the code below, open the Migno offline dictionary again, and paste it into the activation field.</p>
          <div class="chave-box" id="codigoChave">${chaveGerada}</div>
          <button class="btn-copiar" onclick="copiarChave()">Copy Key</button>
        </div>
        <script>
          function copiarChave() {
            const texto = document.getElementById('codigoChave').innerText;
            navigator.clipboard.writeText(texto).then(() => {
              alert('Key copied successfully! Now go back to the application.');
            }).catch(err => {
              alert('Failed to copy automatically. Please copy the text manually.');
            });
          }
        </script>
      </body>
      </html>
    `);

  } catch (err) {
    console.error("Erro na rota de sucesso:", err);
    res.status(500).send("Internal error while retrieving your license.");
  }
});

// ==========================================================================
// ROTA DE DIAGNÓSTICO (Bate direto na tabela chaves para checar o status)
// ==========================================================================
app.get('/estrutura-usuarios', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM chaves LIMIT 1`);
    res.json({
      status: "Connection OK",
      test_record: result.rows[0] || "Table is empty"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================================================
// 1. VERIFICAR (Mapeamento estrito com a tabela usuarios)
// ==========================================================================
app.get('/verificar', async (req, res) => {
  const { uuid_aparelho, categoria } = req.query;

  if (!uuid_aparelho || !categoria) {
    return res.status(400).json({
      status: "erro1",
      mensagem: "UUID or Category missing"
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
      status: "erro3",
      detalhe: err.message
    });
  }
});

// ==========================================================================
// 2. REGISTRAR (Mapeamento estrito com a tabela usuarios - Correção de Status)
// ==========================================================================
app.get('/registrar', async (req, res) => {
  const { uuid_aparelho, categoria } = req.query;

  if (!uuid_aparelho || !categoria) {
    return res.status(400).json({
      status: "erro4", // Corrigido padronização de erro interno de parâmetro
      mensagem: "UUID or Category missing"
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
        VALUES ($1, $2, $3)
        `,
        [uuid_aparelho, categoria, 'pendente']
      );
    }

    res.json({
      status: "pendente",
      mensagem: "Awaiting authorization"
    });

  } catch (err) {
    console.error("Erro registrar:", err);
    res.status(500).json({
      status: "erro5"
    });
  }
});

// ==========================================================================
// 3. ATIVAR (Validação cruzada limpa entre as tabelas do pgAdmin)
// ==========================================================================
app.get('/ativar', async (req, res) => {
  const { uuid_aparelho, codigo, categoria } = req.query;

  if (!uuid_aparelho || !codigo || !categoria) {
    return res.status(400).json({
      status: "erro6"
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
        status: "erro7"
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
      status: "erro8"
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
