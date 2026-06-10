let appConfig = {};

// Carrega configurações do servidor
async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        appConfig = await res.json();
        if (appConfig.emailjs_key) {
            emailjs.init(appConfig.emailjs_key);
        }
    } catch (err) {
        console.error("Erro ao carregar configurações:", err);
    }
}
loadConfig();

const API_URL = "/api";
const token = localStorage.getItem('token');
let currentModalExtras = {};
let products = [];

let cart = [];
let shippingCost = 0;

// Função para buscar o endereço via CEP (API ViaCEP)
async function buscarCEP() {
    const cep = document.getElementById('cep').value.replace(/\D/g, '');
    
    if (cep.length !== 8) {
        return; // Não processa se o CEP estiver incompleto
    }

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (data.erro) {
            alert('CEP não encontrado. Por favor, preencha manualmente.');
            return;
        }

        // Preenche os campos automaticamente
        document.getElementById('endereco').value = data.logradouro || '';
        const bairroApi = data.bairro || '';
        document.getElementById('bairro').value = bairroApi;

        // Busca frete dinâmico no backend
        const shipRes = await fetch(`${API_URL}/shipping?bairro=${bairroApi}`);
        const shipData = await shipRes.json();
        shippingCost = shipData.price || 12.00;
        
        document.getElementById('frete-info').value = `Frete: R$ ${shippingCost.toFixed(2).replace('.', ',')}`;

        renderCart(); // Atualiza o total com o novo frete
    } catch (error) {
        console.error('Erro ao buscar o CEP:', error);
    }
}

// Função para alterar quantidade de extras no modal
function changeExtraQty(extraName, delta) {
    const qtySpan = document.getElementById(`extra-qty-${extraName}`);
    if (!qtySpan) return;
    
    let currentQty = currentModalExtras[extraName] || 0;
    currentQty = Math.max(0, currentQty + delta);
    
    currentModalExtras[extraName] = currentQty;
    qtySpan.innerText = currentQty;
}

// Inicializar Menu
async function initMenu() {
    try {
        // Adicionamos cache: 'no-store' para garantir que pegamos os produtos novos do banco
        const res = await fetch(`${API_URL}/products`, { cache: 'no-store' });
        const data = await res.json();
        
        // Limpa todos os containers de produtos antes de renderizar para evitar duplicados
        document.querySelectorAll('.grid-menu').forEach(container => container.innerHTML = '');

        products = data.map(product => {
            // Garante que ingredientes e extras sejam arrays, mesmo que venham como string do DB
            let parsedIngredients = product.ingredients;
            if (typeof product.ingredients === 'string') {
                try { parsedIngredients = JSON.parse(product.ingredients); } catch(e) { parsedIngredients = []; }
            }
            
            let parsedExtras = product.extras;
            if (typeof product.extras === 'string') {
                try { parsedExtras = JSON.parse(product.extras); } catch(e) { parsedExtras = []; }
            }

            return {
                ...product,
                price: Number(product.price),
                ingredients: Array.isArray(parsedIngredients) ? parsedIngredients : [],
                extras: Array.isArray(parsedExtras) ? parsedExtras : []
            };
        });

        let user = null;
        try {
            user = JSON.parse(localStorage.getItem('user'));
        } catch (e) { console.error("Erro ao ler usuário do localStorage"); }

    products.forEach(product => {
        let container = document.getElementById(product.category);
        
        // Se a categoria não existir no HTML, cria uma nova seção dinamicamente
        if (!container) {
            const menuSection = document.getElementById('menu');
            const title = document.createElement('h2');
            title.className = 'category-title';
            title.textContent = product.category_name || product.category;
            
            container = document.createElement('div');
            container.className = 'grid-menu';
            container.id = product.category;
            
            menuSection.appendChild(title);
            menuSection.appendChild(container);
        }
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${product.image}" alt="${product.name}" class="product-img">
            <div class="product-info">
                <h3>${product.name}</h3>
                <p class="product-price">R$ ${product.price.toFixed(2).replace('.', ',')}</p>
                ${user && user.role === 'ADMIN' ? `
                    <div class="admin-controls">
                        <button class="btn-edit" onclick="editProduct(${product.id})"><i class="fas fa-edit"></i> Editar</button>
                        <button class="btn-delete" onclick="deleteProduct(${product.id})"><i class="fas fa-trash"></i> Excluir</button>
                    </div>
                ` : ''}
            </div>
            <button class="btn-add" onclick="openCustomModal(${product.id})">
                <i class="fas fa-plus"></i> Adicionar
            </button>
        `;
        container.appendChild(card);
    });
    } catch (err) {
        console.error('Erro ao carregar o menu:', err);
    }
}

// Função para carregar categorias dinamicamente da API
async function loadCategories(selectedId = null) {
    try {
        const res = await fetch(`${API_URL}/categories`, { cache: 'no-store' });
        const categories = await res.json();
        const select = document.getElementById('prod-category');
        
        select.innerHTML = '<option value="" disabled selected>Selecione uma categoria</option>';
        
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            if (selectedId && String(selectedId) === String(category.id)) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Erro ao carregar categorias:', err);
    }
}

// Funções de Gerenciamento de Produto (Admin)
async function openProductModal(id = null) {
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');
    document.getElementById('product-modal-title').innerText = id ? 'Editar Produto' : 'Novo Produto';
    loadLibraryImages(); // Carrega lista de imagens existentes

    let categoryToSelect = null;
    if (id) {
        // Comparação robusta de ID
        const p = products.find(prod => String(prod.id) === String(id));
        document.getElementById('prod-id').value = p.id;
        categoryToSelect = p.category_id;
        document.getElementById('prod-name').value = p.name;
        document.getElementById('prod-description').value = p.description;
        document.getElementById('prod-price').value = p.price;
        document.getElementById('prod-ingredients').value = (p.ingredients || []).join(', ');
        
        // Converte o array de objetos de extras de volta para o formato "Nome: Preço" para o input
        const extrasString = (p.extras || []).map(e => `${e.name}: ${e.price.toFixed(2)}`).join(', ');
        document.getElementById('prod-extras').value = extrasString;

        document.getElementById('prod-image').value = p.image || '';
    } else {
        form.reset();
        document.getElementById('prod-id').value = '';
    }

    // Carrega as categorias e seleciona a correta se for edição
    await loadCategories(categoryToSelect);

    modal.style.display = 'block';
}

async function loadLibraryImages() {
    try {
        const res = await fetch(`${API_URL}/images`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const images = await res.json();
        const select = document.getElementById('prod-library-images');
        if (!select) return;
        select.innerHTML = '<option value="">-- Ou escolha da biblioteca --</option>';
        images.forEach(img => {
            select.innerHTML += `<option value="${img}">${img.split('/').pop()}</option>`;
        });
    } catch (err) {
        console.error('Erro ao carregar galeria:', err);
    }
}

function closeProductModal() {
    document.getElementById('product-modal').style.display = 'none';
}

async function editProduct(id) {
    openProductModal(id);
}

async function deleteProduct(id) {
    if (!confirm('Deseja realmente excluir este produto?')) return;
    try {
        const res = await fetch(`${API_URL}/products/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            alert('Produto removido!');
            location.reload();
        } else { alert('Erro ao remover produto.'); }
    } catch (err) { console.error(err); }
}

// Listener para Salvar Produto (Novo ou Editar)
document.getElementById('product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('prod-id').value;
    
    const formData = new FormData();
    formData.append('category_id', parseInt(document.getElementById('prod-category').value));
    formData.append('name', document.getElementById('prod-name').value);
    formData.append('description', document.getElementById('prod-description').value);
    formData.append('price', parseFloat(document.getElementById('prod-price').value));
    
    const ingredientsArr = document.getElementById('prod-ingredients').value.split(',').map(i => i.trim()).filter(i => i !== "");
    formData.append('ingredients', JSON.stringify(ingredientsArr));
    
    // Processa o campo de extras "Nome: Preço, Nome: Preço"
    const extrasInput = document.getElementById('prod-extras').value;
    const extrasArr = extrasInput.split(',').map(item => {
        const parts = item.split(':');
        if (parts.length < 2) return null;
        return { name: parts[0].trim(), price: parseFloat(parts[1].trim()) || 0 };
    }).filter(item => item !== null);
    formData.append('extras', JSON.stringify(extrasArr));

    // Define qual imagem usar: Arquivo > Biblioteca > URL
    const libraryImg = document.getElementById('prod-library-images').value;
    const urlImg = document.getElementById('prod-image').value;
    formData.append('image_url', libraryImg || urlImg);

    const fileInput = document.getElementById('prod-file');
    if (fileInput.files[0]) {
        formData.append('image_file', fileInput.files[0]);
    }

    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/products/${id}` : `${API_URL}/products`;

    const res = await fetch(url, {
        method: method,
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    if (res.ok) {
        alert('Produto salvo com sucesso!');
        location.reload();
    } else {
        const errorData = await res.json();
        alert('Erro ao salvar produto: ' + (errorData.error || 'Erro desconhecido'));
    }
});

// Abrir modal de personalização
function openCustomModal(id) {
    const product = products.find(p => String(p.id) === String(id));
    const modal = document.getElementById('custom-modal');
    const ingredientsContainer = document.getElementById('custom-ingredients-list');
    const extrasContainer = document.getElementById('custom-extras-list');
    
    document.getElementById('custom-product-name').innerText = product.name;
    ingredientsContainer.innerHTML = '';
    extrasContainer.innerHTML = '';

    // Renderiza ingredientes padrão (para remover)
    if (product.ingredients) {
        product.ingredients.forEach(ing => {
            ingredientsContainer.innerHTML += `
                <label class="ingredient-item">
                    <input type="checkbox" checked value="${ing}" class="standard-ing"> ${ing}
                </label>
            `;
        });
    } else {
        ingredientsContainer.innerHTML = '<p>Item sem ingredientes padrão.</p>';
    }

    // Renderiza Adicionais se o produto tiver extras cadastrados
    if (product.extras && product.extras.length > 0) {
        document.getElementById('extras-title').style.display = 'block';
        currentModalExtras = {}; // Reset
        product.extras.forEach(extra => {
            currentModalExtras[extra.name] = 0;
            extrasContainer.innerHTML += `
                <div class="ingredient-item extra">
                    <div style="flex: 1;">
                        <span>${extra.name}</span><br>
                        <small>+ R$ ${extra.price.toFixed(2)}</small>
                    </div>
                    <div class="qty-controls">
                        <button class="qty-btn" type="button" onclick="changeExtraQty('${extra.name}', -1)">-</button>
                        <span id="extra-qty-${extra.name}">0</span>
                        <button class="qty-btn" type="button" onclick="changeExtraQty('${extra.name}', 1)">+</button>
                    </div>
                </div>
            `;
        });
    } else {
        document.getElementById('extras-title').style.display = 'none';
    }

    modal.style.display = 'block';
    modal.dataset.productId = id;
}

function closeCustomModal() {
    document.getElementById('custom-modal').style.display = 'none';
}

// Adicionar ao carrinho com as escolhas
function confirmAddToCart() {
    const id = document.getElementById('custom-modal').dataset.productId;
    const product = products.find(p => String(p.id) === String(id));
    
    // Pega ingredientes mantidos e extras adicionados
    const keptIngredients = Array.from(document.querySelectorAll('.standard-ing:checked')).map(i => i.value);
    const removedIngredients = product.ingredients ? product.ingredients.filter(i => !keptIngredients.includes(i)) : [];
    
    // Processa os extras selecionados (apenas os com qty > 0)
    const selectedExtras = [];
    for (const [name, qty] of Object.entries(currentModalExtras)) {
        if (qty > 0) {
            const opt = (product.extras || []).find(o => o.name === name);
            if (opt) {
                selectedExtras.push({ name, price: opt.price, qty });
            }
        }
    }

    const extrasTotal = selectedExtras.reduce((acc, curr) => acc + (curr.price * curr.qty), 0);
    
    // Assinatura única baseada nas alterações para não agrupar itens com customizações diferentes
    const itemSignature = `${id}|R:${removedIngredients.join(',')}|E:${selectedExtras.map(e => `${e.qty}x${e.name}`).join(',')}`;

    const existing = cart.find(item => item.signature === itemSignature);

    if (existing) {
        existing.qty++;
    } else {
        cart.push({ 
            ...product, 
            qty: 1, 
            finalPrice: product.price + extrasTotal,
            removedIngredients,
            selectedExtras,
            signature: itemSignature 
        });
    }
    
    closeCustomModal();
    renderCart();
}

// Alterar quantidade
function changeQty(index, delta) {
    if (cart[index]) {
        cart[index].qty += delta;
        if (cart[index].qty <= 0) {
            cart.splice(index, 1);
        }
    }
    renderCart();
}

// Renderizar HTML do Carrinho
function renderCart() {
    const cartContainer = document.getElementById('cart-items');
    const cartCount = document.getElementById('cart-count');
    const subtotalEl = document.getElementById('subtotal');
    const shippingEl = document.getElementById('shipping-price');
    const totalEl = document.getElementById('total-price');

    cartCount.innerText = cart.reduce((acc, i) => acc + i.qty, 0);

    if (cart.length === 0) {
        cartContainer.innerHTML = '<p>O carrinho está vazio...</p>';
        subtotalEl.innerText = 'R$ 0,00';
        totalEl.innerText = 'R$ 0,00';
        return;
    }

    cartContainer.innerHTML = cart.map((item, index) => `
        <div class="cart-item">
            <div>
                <strong>${item.name}</strong><br>
                ${item.removedIngredients.length > 0 ? `<small style="color:red">Sem: ${item.removedIngredients.join(', ')}</small><br>` : ''}
                ${item.selectedExtras.length > 0 ? `<small style="color:green">Extras: ${item.selectedExtras.map(e => `${e.qty}x ${e.name}`).join(', ')}</small><br>` : ''}
                <strong>R$ ${item.finalPrice.toFixed(2)}</strong>
            </div>
            <div class="qty-controls">
                <button class="qty-btn" onclick="changeQty(${index}, -1)">-</button>
                <span>${item.qty}</span>
                <button class="qty-btn" onclick="changeQty(${index}, 1)">+</button>
            </div>
        </div>
    `).join('');

    const subtotal = cart.reduce((acc, i) => acc + (i.finalPrice * i.qty), 0);
    subtotalEl.innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    shippingEl.innerText = `R$ ${shippingCost.toFixed(2).replace('.', ',')}`;
    totalEl.innerText = `R$ ${(subtotal + shippingCost).toFixed(2).replace('.', ',')}`;
}

function toggleCart() {
    const modal = document.getElementById('cart-modal');
    modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
}

// Finalizar Pedido e Enviar WhatsApp
function finishOrder() {
    // Validação Simples
    const campos = ['nome', 'telefone', 'endereco', 'numero', 'bairro'];
    for (let campo of campos) {
        if (!document.getElementById(campo).value) {
            alert('Por favor, preencha todos os dados de entrega!');
            return;
        }
    }

    if (cart.length === 0) {
        alert('Seu carrinho está vazio!');
        return;
    }

    // Coleta dados
    const nome = document.getElementById('nome').value;
    const tel = document.getElementById('telefone').value;
    const end = document.getElementById('endereco').value;
    const num = document.getElementById('numero').value;
    const bairro = document.getElementById('bairro').value;
    const comp = document.getElementById('complemento').value || 'N/A';
    const ref = document.getElementById('referencia').value || 'N/A';

    const subtotal = cart.reduce((acc, i) => acc + (i.finalPrice * i.qty), 0);
    const total = subtotal + shippingCost;

    // Formata itens do pedido
    let itensMsg = '';
    cart.forEach(item => {
        const removidos = item.removedIngredients.length > 0 ? `\n   - REMOVER: ${item.removedIngredients.join(', ')}` : '';
        const adicionais = item.selectedExtras.length > 0 ? `\n   + EXTRAS: ${item.selectedExtras.map(e => `${e.qty}x ${e.name}`).join(', ')}` : '';
        itensMsg += `* ${item.qty}x ${item.name}${removidos}${adicionais}\n`;
    });

    const mensagem = encodeURIComponent(
`🍔 *NOVO PEDIDO - LANCHONETE DA DIRA*

👤 *Cliente:*
${nome}

📞 *Telefone:*
${tel}

📍 *Endereço:*
${end}, nº ${num}
Bairro: ${bairro}
Comp: ${comp}
Ref: ${ref}

🛒 *Pedido:*
${itensMsg}
💰 *Subtotal:* R$ ${subtotal.toFixed(2)}
🚚 *Frete:* R$ ${shippingCost.toFixed(2)}
💵 *Total:* R$ ${total.toFixed(2)}

Obrigado!`);

    // Salva o pedido no Banco de Dados via API
    fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ cart, subtotal, shippingCost, total, addressData: { end, num, bairro } })
    }).then(async res => {
        if (res.ok) {
            // Envio de Cópia de Segurança para o E-mail (Opcional/Segurança)
            const emailParams = {
                cliente_nome: nome,
                cliente_contato: tel,
                endereco_entrega: `${end}, nº ${num} - ${bairro}`,
                resumo_pedido: itensMsg.replace(/\*/g, ''),
                valor_total: total.toFixed(2),
                destinatario: 'isaiasrocha.dev@outlook.com'
            };
            if(appConfig.emailjs_service) {
                emailjs.send(appConfig.emailjs_service, appConfig.emailjs_template, emailParams).catch(e => console.error("Erro EmailJS:", e));
            }

            // 1. Limpa o carrinho
            cart = [];
            renderCart();
            
            // 2. Fecha o modal do carrinho
            document.getElementById('cart-modal').style.display = 'none';

            // 3. Abre o WhatsApp para o cliente usando o número da config
            const whatsappUrl = `https://wa.me/${appConfig.whatsapp || '5571987792252'}?text=${mensagem}`;
            window.open(whatsappUrl, '_blank');

        } else if (res.status === 401 || res.status === 403) {
            window.location.href = '/login?msg=expired';
        } else {
            const error = await res.json();
            alert("Erro ao processar pedido: " + (error.error || "Tente novamente."));
        }
    }).catch(err => {
        console.error("Erro ao salvar pedido:", err);
        alert("Falha de conexão ao salvar pedido.");
    });
}

// Atualizar interface com nome do usuário logado
async function updateAuthUI() {
    const userMenu = document.getElementById('user-menu');
    let user = JSON.parse(localStorage.getItem('user'));
    
    if (user && userMenu) {
        userMenu.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                ${user.role === 'ADMIN' ? `
                    <a href="/admin/pedidos" class="btn-add" style="background: var(--dark); color: white; text-decoration: none; font-size: 0.8rem; margin: 0; padding: 8px 12px;">
                        <i class="fas fa-clipboard-list"></i> Pedidos
                    </a>
                    <button onclick="openProductModal()" class="btn-add" style="background: var(--secondary); color: var(--dark); font-size: 0.8rem; margin: 0; padding: 8px 12px;">
                        <i class="fas fa-plus"></i> Novo
                    </button>
                ` : `
                    <a href="/meus-pedidos" class="btn-add" style="background: var(--secondary); color: var(--dark); text-decoration: none; font-size: 0.8rem; margin: 0; padding: 8px 12px;">
                        <i class="fas fa-shopping-bag"></i> Meus Pedidos
                    </a>
                `}
                <span style="color: white; white-space: nowrap; font-size: 0.9rem;">Olá, ${user.name.split(' ')[0]}</span>
                <button onclick="logout()" class="btn-add" style="margin: 0; padding: 6px 10px; background: rgba(0,0,0,0.3); font-size: 0.8rem;">Sair</button>
            </div>
        `;

        // Adiciona link administrativo na barra lateral (sidebar) para fácil acesso
        const sidebarUl = document.querySelector('.sidebar ul');
        if (sidebarUl && user.role === 'ADMIN' && !document.getElementById('admin-sidebar-link')) {
            const li = document.createElement('li');
            li.id = 'admin-sidebar-link';
            li.innerHTML = `<a href="/admin/pedidos" class="btn-admin-nav"><i class="fas fa-tasks"></i> Gerenciar Pedidos</a>`;
            sidebarUl.prepend(li);
        }

        // Preenche automaticamente o formulário de entrega
        if (document.getElementById('nome')) {
            document.getElementById('nome').value = user.name || '';
            document.getElementById('telefone').value = user.phone || '';
            document.getElementById('cep').value = user.cep || '';
            document.getElementById('endereco').value = user.address || '';
            document.getElementById('numero').value = user.number || '';
            document.getElementById('bairro').value = user.neighborhood || '';
            document.getElementById('complemento').value = user.complement || '';
            document.getElementById('referencia').value = user.reference || '';
            
            // Se houver CEP e Bairro, calcula o frete inicial
            if (user.neighborhood) buscarCEP();
        }
    }
}

function logout() {
    localStorage.clear();
    window.location.reload();
}

// EXPOSIÇÃO GLOBAL PARA HTML ONCLICK
window.buscarCEP = buscarCEP;
window.changeExtraQty = changeExtraQty;
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.openCustomModal = openCustomModal;
window.closeCustomModal = closeCustomModal;
window.confirmAddToCart = confirmAddToCart;
window.changeQty = changeQty;
window.toggleCart = toggleCart;
window.finishOrder = finishOrder;
window.logout = logout;

// Inicialização
initMenu();
updateAuthUI();
