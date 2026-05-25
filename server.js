const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuração otimizada para manter a conexão ativa (Evita o erro de conexão)
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000, // Aumenta o tempo de espera
  max: 5 // Limita conexões para não derrubar a Render
});

// Rota de Ativação com Log detalhado para você ver no painel da Render
app.get('/ativar', async (req, res) => {
    const { uuid, chave } = req.query;
    console.log(`Tentativa de ativação - UUID: ${uuid}, Chave: ${chave}`);
    
    try {
        // Verifica a chave na coluna correta 'codigo'
        const valid = await pool.query("SELECT * FROM chaves WHERE codigo = $1 AND status = 'ativa'", [chave]);
        
        if (valid.rows.length > 0) {
            await pool.query("UPDATE usuarios SET status = 'autorizado' WHERE uuid_aparelho = $1", [uuid]);
            await pool.query("UPDATE chaves SET status = 'usada' WHERE codigo = $1", [chave]);
            console.log("Ativação bem-sucedida!");
            res.json({ status: "sucesso" });
        } else {
            console.log("Chave inválida ou já usada.");
            res.json({ status: "erro" });
        }
    } catch (err) {
        console.error("Erro no Banco:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Servidor de Venda Direta rodando na porta ${port}`);
});