const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURAÇÃO DO POOL: Conecta diretamente ao banco de dados usando a variável de ambiente do Render
// Isso evita o erro ECONNREFUSED ao parar de forçar o localhost (127.0.0.1)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Obrigatório para conexões externas seguras no Render
  }
});

// 1. ROTA DE USUÁRIOS: Teste bem-sucedido de Registro de Aparelho
app.get('/registrar', async (req, res) => {
  const { uuid_aparelho, categoria } = req.query;

  if (!uuid_aparelho || !categoria) {
    return res.status(400).json({ status: "erro", detalhe: "Parâmetros ausentes." });
  }

  try {
    // Insere ou atualiza o dispositivo na tabela de usuários (A categoria mapeia o nome do alvo da lista)
    const queryTexto = `
      INSERT INTO usuarios (uuid_aparelho, categoria, data_registro)
      VALUES ($1, $2, NOW())
      ON CONFLICT (uuid_aparelho) 
      DO UPDATE SET categoria = $2, data_registro = NOW()
      RETURNING *;
    `;
    
    await pool.query(queryTexto, [uuid_aparelho, categoria]);

    // Resposta de Sucesso que valida o teste do usuário
    return res.status(200).json({ status: "sucesso", detalhe: "Dispositivo registrado com sucesso na tabela de usuários." });

  } catch (error) {
    console.error("Erro no servidor:", error);
    // Retorna a estrutura que capturamos no console para tratamento de erros
    return res.status(500).json({ status: "erro5", detalhe: error.message });
  }
});

// 2. ROTA DE CHAVES: Teste bem-sucedido de Ativação/Licença (Venda Direta na Loja)
app.get('/ativar', async (req, res) => {
  const { uuid_aparelho, chave_licenca } = req.query;

  if (!uuid_aparelho || !chave_licenca) {
    return res.status(400).json({ status: "erro", detalhe: "Parâmetros ausentes." });
  }

  try {
    // Verifica e atualiza o status na tabela de chaves para autorizar o dispositivo
    const queryChave = `
      UPDATE chaves 
      SET uuid_aparelho = $1, status = 'ativado', data_ativacao = NOW() 
      WHERE chave_licenca = $2 AND (uuid_aparelho IS NULL OR uuid_aparelho = $1)
      RETURNING *;
    `;
    
    const resultado = await pool.query(queryChave, [uuid_aparelho, chave_licenca]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ status: "erro", detalhe: "Chave inválida ou já utilizada por outro aparelho." });
    }

    return res.status(200).json({ status: "sucesso", detalhe: "Chave ativada com sucesso para o usuário." });

  } catch (error) {
    console.error("Erro na ativação:", error);
    return res.status(500).json({ status: "erro5", detalhe: error.message });
  }
});

// Inicialização do Servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando com sucesso na porta ${PORT}`);
});
