const express = require('express');
const { Pool } = require('pg');
const cors = require('cors'); // Correção 1: Importação do CORS

const app = express();
const port = process.env.PORT || 3000;

app.use(cors()); // Correção 1: Liberação do CORS para o App falar com o servidor
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false }
});

// 1. Rota de Verificação
app.get('/verificar', async (req, res) => {
    const uuidCliente = req.query.uuid;
    if (!uuidCliente) return res.json({ status: "erro" });

    try {
        const result = await pool.query('SELECT status FROM usuarios WHERE uuid_aparelho = $1', [uuidCliente]);
        if (result.rows.length > 0 && result.rows[0].status === 'autorizado') {
            return res.json({ status: "autorizado" }); 
        } else {
            return res.json({ status: "bloqueado" }); 
        }
    } catch (err) {
        return res.status(500).json({ status: "erro" });
    }
});

// 2. Rota de Auto-Registro
app.get('/registrar', async (req, res) => {
    const { uuid } = req.query;
    try {
        await pool.query("INSERT INTO usuarios (uuid_aparelho, status) VALUES ($1, 'pendente') ON CONFLICT (uuid_aparelho) DO NOTHING", [uuid]);
        res.json({ status: "registrado" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. ROTA DE ATIVAÇÃO (Revisada e Corrigida)
app.get('/ativar', async (req, res) => {
    const { uuid, chave } = req.query;
    try {
        // Correção 2: Mudança de 'chave_valor' para 'codigo' para bater com o DBeaver
        const valid = await pool.query("SELECT * FROM chaves WHERE codigo = $1 AND status = 'ativa'", [chave]);
        
        if (valid.rows.length > 0) {
            await pool.query("UPDATE usuarios SET status = 'autorizado' WHERE uuid_aparelho = $1", [uuid]);
            // Correção 2: Mudança de 'chave_valor' para 'codigo' no UPDATE
            await pool.query("UPDATE chaves SET status = 'usada' WHERE codigo = $1", [chave]);
            res.json({ status: "sucesso" });
        } else {
            res.json({ status: "erro" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});