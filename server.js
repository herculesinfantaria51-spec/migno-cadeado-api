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
  ssl: { rejectUnauthorized: false }
});

// 1. Rota de Verificação
app.get('/verificar', async (req, res) => {
    const uuidCliente = req.query.uuid;
    if (!uuidCliente) return res.json({ status: "erro" });

    try {
        const result = await pool.query('SELECT status FROM usuarios WHERE uuid_aparelho = $1', [uuidCliente]);
        // O app entende "autorizado" como sinal verde
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

// 3. ROTA NOVA: Ativação via Chave (O que estava faltando!)
app.get('/ativar', async (req, res) => {
    const { uuid, chave } = req.query;
    try {
        // Verifica se a chave existe e está 'ativa'
        const valid = await pool.query("SELECT * FROM chaves WHERE chave_valor = $1 AND status = 'ativa'", [chave]);
        
        if (valid.rows.length > 0) {
            // Se achou a chave, autoriza o usuário e marca a chave como 'usada'
            await pool.query("UPDATE usuarios SET status = 'autorizado' WHERE uuid_aparelho = $1", [uuid]);
            await pool.query("UPDATE chaves SET status = 'usada' WHERE chave_valor = $1", [chave]);
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