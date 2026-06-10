const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

// Configurações de Negócio
const DEFAULT_SHIPPING_PRICE = 12.00;

const app = express();

// Proteção de Cabeçalhos HTTP
app.use(helmet({
    contentSecurityPolicy: false, // Desabilitado para permitir scripts externos como FontAwesome/EmailJS mais facilmente em dev
}));

// Proteção contra Ataques de Força Bruta
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // limite de 100 requisições por IP
    message: { error: "Muitas tentativas vindas deste IP. Tente novamente em 15 minutos." }
});
app.use('/api/', limiter);

app.use(cors({
    origin: process.env.CLIENT_URL || '*', // Em produção, substitua pelo seu domínio
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Middleware para evitar cache nas respostas da API
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// Força o Express a tratar o corpo da requisição com UTF-8
app.use(express.urlencoded({ extended: true }));

// Cria a pasta de uploads se ela não existir
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configuração do Multer para Upload de Imagens
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Configuração da conexão com o Banco de Dados
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware de Autenticação JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Middleware para verificar se é ADMIN
// Assume que authenticateToken já foi executado e preencheu req.user
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'ADMIN') next();
    else res.status(403).json({ error: 'Acesso negado. Requer privilégios de administrador.' });
};

// Servir a pasta de uploads como estática para que as imagens fiquem acessíveis
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/img', express.static(path.join(__dirname, 'img')));

// Middleware para impedir o acesso direto a qualquer arquivo .html pela URL
app.use((req, res, next) => {
    if (req.path.endsWith('.html')) return res.status(403).send('Acesso proibido.');
    next();
});

// Servir arquivos estáticos (JS, CSS, etc.) sem permitir que virem o index da pasta
app.use(express.static(path.join(__dirname), { index: false }));

// --- ROTAS DE PÁGINAS (MASCARAMENTO DE URL) ---

// Rota Principal (Mapeia / para index.html)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Rota de Login e Cadastro
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/cadastro', (req, res) => res.sendFile(path.join(__dirname, 'cadastro.html')));

// Rota Protegida do Cliente (URL amigável: /meus-pedidos)
app.get('/meus-pedidos', (req, res) => {
    // Como o token está no localStorage, o servidor serve o arquivo
    // e o script dentro dele faz o redirecionamento se não houver token.
    res.sendFile(path.join(__dirname, 'meus-pedidos.html'));
});

// Rota Protegida Admin (URL amigável: /admin/pedidos)
app.get('/admin/pedidos', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-pedidos.html'));
});

// --- ROTAS DE CATEGORIAS ---
app.get('/api/categories', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, slug FROM categories WHERE active = true ORDER BY id ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/config', (req, res) => {
    res.json({
        whatsapp: process.env.WHATSAPP_NUMBER,
        emailjs_key: process.env.EMAILJS_PUBLIC_KEY,
        emailjs_service: process.env.EMAILJS_SERVICE_ID,
        emailjs_template: process.env.EMAILJS_TEMPLATE_ID
    });
});

// --- ROTAS DE PRODUTOS ---
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT p.*, c.name as category_name, c.slug as category_slug 
            FROM products p 
            JOIN categories c ON p.category_id = c.id 
            WHERE p.active = true
        `);
        res.json(rows.map(p => ({
            ...p, // Convertemos o preço de string para Number aqui
            price: Number(p.price),
            ingredients: p.ingredients || [],
            extras: p.extras || [],
            image: p.image_url,
            category: p.category_slug, // Usamos o slug para bater com os IDs do HTML
            category_name: p.category_name
        })));
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Rota para listar imagens já enviadas
app.get('/api/images', authenticateToken, isAdmin, (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Erro ao listar imagens' });
        const imageUrls = files.map(file => `/uploads/${file}`);
        res.json(imageUrls);
    });
});

app.post('/api/products', authenticateToken, isAdmin, upload.single('image_file'), async (req, res) => {
    try {
        let { category_id, name, description, price, ingredients, extras, image_url } = req.body;

        // Validação básica para evitar erro de NaN no PostgreSQL
        const catId = parseInt(category_id);
        const prodPrice = parseFloat(price);

        if (isNaN(catId) || isNaN(prodPrice)) {
            return res.status(400).json({ error: 'Categoria ou preço inválidos.' });
        }

        // Validamos se o JSON é válido, mas mantemos como string para o PostgreSQL tratar como JSONB
        const ingredientsJson = typeof ingredients === 'string' ? ingredients : JSON.stringify(ingredients || []);
        const extrasJson = typeof extras === 'string' ? extras : JSON.stringify(extras || []);
        
        // Se houver arquivo, usa o caminho do arquivo. Se não, usa a URL fornecida.
        const finalImageUrl = req.file ? `/uploads/${req.file.filename}` : image_url;

        const [result] = await pool.execute(
            'INSERT INTO products (category_id, name, description, price, ingredients, extras, image_url, active, available) VALUES (?, ?, ?, ?, ?, ?, ?, true, true)',
            [catId, name, description, prodPrice, ingredientsJson, extrasJson, finalImageUrl]
        );
        res.status(201).json({ message: 'Produto criado!', id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar produto: ' + error.message });
    }
});

// Rota para Editar Produto
app.put('/api/products/:id', authenticateToken, isAdmin, upload.single('image_file'), async (req, res) => {
    const { id } = req.params;
    try {
        let { category_id, name, description, price, ingredients, extras, image_url } = req.body;

        const catId = parseInt(category_id);
        const prodPrice = parseFloat(price);

        if (isNaN(catId) || isNaN(prodPrice)) {
            return res.status(400).json({ error: 'Categoria ou preço inválidos.' });
        }

        // Validamos se o JSON é válido, mas mantemos como string para o PostgreSQL tratar como JSONB
        const ingredientsJson = typeof ingredients === 'string' ? ingredients : JSON.stringify(ingredients || []);
        const extrasJson = typeof extras === 'string' ? extras : JSON.stringify(extras || []);
        
        // Se um novo arquivo foi enviado, atualiza a imagem. Caso contrário, mantém a URL antiga ou a nova URL texto.
        const finalImageUrl = req.file ? `/uploads/${req.file.filename}` : image_url;

        const [result] = await pool.execute(
            'UPDATE products SET category_id = ?, name = ?, description = ?, price = ?, ingredients = ?, extras = ?, image_url = ? WHERE id = ?',
            [catId, name, description, prodPrice, ingredientsJson, extrasJson, finalImageUrl, parseInt(id)]
        );

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Produto não encontrado' });
        res.json({ message: 'Produto atualizado com sucesso!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Exclusão lógica de produto
app.delete('/api/products/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.execute('UPDATE products SET active = false WHERE id = ?', [req.params.id]);
        res.json({ message: 'Produto removido com sucesso (exclusão lógica).' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ROTAS DE FRETE ---
app.get('/api/shipping', async (req, res) => {
    const { bairro } = req.query;
    try {
        const [rows] = await pool.query('SELECT price FROM shipping_rates WHERE neighborhood = ?', [bairro]);
        if (rows.length > 0) res.json(rows[0]);
        else res.json({ price: DEFAULT_SHIPPING_PRICE }); // Valor padrão se não encontrar o bairro
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// --- ROTA DE PERFIL (DADOS AUTOMÁTICOS) ---
app.get('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT name, email, phone, cep, address, number, neighborhood, complement, reference FROM users WHERE id = ?', [req.user.id]);
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/api/auth/register', async (req, res) => {
    const { name, username, email, password, phone, cep, address, number, neighborhood } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.execute(
            'INSERT INTO users (name, username, email, password, phone, cep, address, number, neighborhood) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, username, email, hashedPassword, phone, cep, address, number, neighborhood]
        );
        res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
    } catch (error) {
        res.status(400).json({ error: 'Erro ao cadastrar. E-mail ou usuário já existem.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { identifier, password } = req.body; // identifier pode ser email ou username
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ? OR username = ?', [identifier, identifier]);
        if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

        const user = rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Senha incorreta' });

        const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '10m' });

        // Retorna dados do usuário (exceto senha) e o token
        const { password: _, ...userWithoutPassword } = user;
        res.json({ token, user: userWithoutPassword });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ROTA DE PEDIDOS ---
app.post('/api/orders', authenticateToken, async (req, res) => {
    const { cart, subtotal, shippingCost, total, addressData } = req.body;
    try {
        const trackingCode = 'DIRA-' + Math.floor(100000 + Math.random() * 900000);
        const [result] = await pool.execute(
            'INSERT INTO orders (user_id, subtotal, shipping_cost, total, delivery_address, tracking_code, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, subtotal, shippingCost, total, JSON.stringify(addressData), trackingCode, 'PENDENTE']
        );
        const orderId = result.insertId;

        // Insere itens do pedido
        for (const item of cart) {
            const customization = JSON.stringify({ removed: item.removedIngredients, extras: item.selectedExtras });
            await pool.execute(
                'INSERT INTO order_items (order_id, product_id, quantity, unit_price, customization) VALUES (?, ?, ?, ?, ?)',
                [orderId, item.id, item.qty, item.finalPrice, customization]
            );
        }
        res.status(201).json({ message: 'Pedido salvo!', orderId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Histórico do Cliente
app.get('/api/orders/my', authenticateToken, async (req, res) => {
    try {
        const [orders] = await pool.query('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        
        for (let order of orders) {
            const [items] = await pool.query(
                'SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
                [order.id]
            );
            order.items = items;
        }
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ROTAS ADMINISTRATIVAS DE PEDIDOS ---
app.get('/api/admin/orders', authenticateToken, isAdmin, async (req, res) => {
    const archived = req.query.archived === 'true';
    try {
        const [rows] = await pool.query(`
            SELECT o.*, u.name as user_name, u.phone as user_phone 
            FROM orders o 
            JOIN users u ON o.user_id = u.id 
            WHERE o.archived = ?
            ORDER BY o.created_at DESC
        `, [archived ? 1 : 0]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/orders/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const order = await pool.query(`
            SELECT o.*, u.name as user_name, u.phone as user_phone, u.email as user_email 
            FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`, [req.params.id]);
        
        const [items] = await pool.query(
            'SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
            [req.params.id]
        );
        
        res.json({ ...order[0][0], items: items });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/orders/:id/status', authenticateToken, isAdmin, async (req, res) => {
    const { status } = req.body;
    try {
        await pool.execute(
            'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [status, parseInt(req.params.id)]
        );
        res.json({ message: 'Status atualizado!' });
    } catch (error) {
        console.error("Erro ao atualizar status:", error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/orders/:id/tracking', authenticateToken, isAdmin, async (req, res) => {
    const { tracking_url, tracking_code } = req.body;
    try {
        await pool.execute(
            'UPDATE orders SET tracking_url = COALESCE(?, tracking_url), tracking_code = COALESCE(?, tracking_code) WHERE id = ?',
            [tracking_url, tracking_code, parseInt(req.params.id)]
        );
        res.json({ message: 'Rastreio atualizado!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// --- ROTAS DE MANUTENÇÃO DE PEDIDOS (ADMIN) ---

// IMPORTANTE: A rota /all deve vir ANTES de /:id para não haver conflito
app.delete('/api/admin/orders/all', authenticateToken, isAdmin, async (req, res) => {
    try {
        // Exclui todos os pedidos. O CASCADE cuidará dos order_items se configurado no DB.
        await pool.execute('DELETE FROM orders');
        res.json({ message: 'Histórico de pedidos totalmente zerado.' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao zerar pedidos: ' + error.message });
    }
});

app.put('/api/admin/orders/:id/archive', authenticateToken, isAdmin, async (req, res) => {
    const orderId = parseInt(req.params.id);
    const { archived } = req.body;

    if (isNaN(orderId)) return res.status(400).json({ error: 'ID inválido' });

    try {
        const [result] = await pool.execute(
            'UPDATE orders SET archived = ?, updated_at = NOW() WHERE id = ?',
            [archived === undefined ? 1 : (archived ? 1 : 0), orderId]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
        res.json({ message: archived ? 'Pedido arquivado' : 'Pedido restaurado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/orders/:id', authenticateToken, isAdmin, async (req, res) => {
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId)) return res.status(400).json({ error: 'ID inválido' });

    try {
        // Regra de segurança: Só exclui se estiver PENDENTE
        const [rows] = await pool.query('SELECT status FROM orders WHERE id = ?', [orderId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
        
        if (rows[0].status !== 'PENDENTE') {
            return res.status(400).json({ error: 'Não é possível excluir pedidos em processamento ou finalizados. Tente arquivar.' });
        }

        await pool.execute('DELETE FROM orders WHERE id = ?', [orderId]);
        res.json({ message: 'Pedido removido permanentemente.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});