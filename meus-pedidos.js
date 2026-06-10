const API_URL = window.location.origin + "/api";
const token = localStorage.getItem('token');
let myOrders = [];

const statusConfig = {
    'PENDENTE': {
        icon: '📥',
        class: 'st-recebido',
        color: '#3498db', // Mantido apenas para referência se necessário
        message: 'Seu pedido foi recebido pela loja.'
    },
    'EM_PREPARO': {
        icon: '🍳',
        class: 'st-preparo',
        color: '#fd7e14',
        message: 'Seu pedido está sendo preparado.'
    },
    'SAIU_PARA_ENTREGA': {
        icon: '🛵',
        class: 'st-entrega',
        color: '#6f42c1',
        message: 'Seu pedido está a caminho.'
    },
    'ENTREGUE': {
        icon: '✅',
        class: 'st-entregue',
        color: '#28a745',
        message: 'Pedido entregue com sucesso.'
    },
    'CANCELADO': {
        icon: '❌',
        class: 'st-cancelado',
        color: '#dc3545',
        message: 'Este pedido foi cancelado.'
    }
};

async function init() {
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) document.getElementById('user-greeting').innerText = `Olá, ${user.name.split(' ')[0]} 👋`;

    await loadOrders();
}

async function loadOrders() {
    try {
        const res = await fetch(`${API_URL}/orders/my`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        myOrders = await res.json();
        
        if (!Array.isArray(myOrders)) throw new Error("Erro na resposta");

        updateStats();
        renderOrders();
    } catch (error) {
        document.getElementById('orders-feed').innerHTML = '<p style="text-align:center; padding:50px;">Erro ao carregar pedidos. Tente novamente.</p>';
    }
}

function updateStats() {
    document.getElementById('count-total').innerText = myOrders.length;
    document.getElementById('count-ongoing').innerText = myOrders.filter(o => !['Entregue', 'Cancelado'].includes(o.status)).length;
    document.getElementById('count-delivered').innerText = myOrders.filter(o => o.status === 'Entregue').length;
    
    const spent = myOrders.reduce((acc, o) => acc + Number(o.total), 0);
    document.getElementById('total-spent').innerText = `R$ ${spent.toFixed(2).replace('.', ',')}`;
}

function renderOrders() {
    const container = document.getElementById('orders-feed');
    if (myOrders.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:50px; color:#999;"><i class="fas fa-ghost" style="font-size:3rem; margin-bottom:15px; display:block;"></i>Nenhum pedido encontrado.</div>';
        return;
    }

    container.innerHTML = myOrders.map(o => {
        const config = statusConfig[o.status] || statusConfig['Recebido'];

        return `
        <div class="order-card">
            <div class="card-top">
                <div>
                    <span class="order-title">🍔 Pedido #${o.id}</span>
                    <span class="order-date">${new Date(o.created_at).toLocaleDateString()} • ${new Date(o.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                </div>
            </div>

            <div class="status-display ${config.class}">
                <div class="status-badge">
                    <span>${config.icon}</span> ${o.status}
                </div>
                <p class="status-msg">${config.message}</p>
            </div>

            <div class="order-meta-info">
                <div>
                    <span class="meta-label">Código</span>
                    <span class="meta-value">${o.tracking_code}</span>
                </div>
                <div style="text-align: right;">
                    <span class="meta-label">Valor</span>
                    <span class="meta-value">R$ ${Number(o.total).toFixed(2).replace('.', ',')}</span>
                </div>
            </div>

            <div class="items-summary">
                ${o.items.slice(0, 3).map(i => `<div class="summary-line"><i class="fas fa-check" style="color:var(--green); font-size:0.7rem;"></i> ${i.quantity}x ${i.name}</div>`).join('')}
                ${o.items.length > 3 ? `<div class="more-items">+ ${o.items.length - 3} itens adicionais</div>` : ''}
            </div>

            <div class="card-actions">
                <button class="btn-order btn-details" onclick="viewDetails(${o.id})"><i class="far fa-file-alt"></i> Ver detalhes</button>
                <a href="https://wa.me/5571987792252" target="_blank" class="btn-order btn-help"><i class="fab fa-whatsapp"></i> Ajuda</a>
                ${o.status === 'Saiu para entrega' && o.tracking_url ? 
                    `<a href="${o.tracking_url}" target="_blank" class="btn-order btn-track"><i class="fas fa-map-marked-alt"></i> Acompanhar entrega</a>` : ''}
                ${['Entregue', 'Cancelado'].includes(o.status) ? 
                    `<button class="btn-order btn-reorder" onclick="window.location.href='index.html'"><i class="fas fa-redo"></i> Pedir novamente</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

async function viewDetails(id) {
    const o = myOrders.find(order => order.id === id);
    const body = document.getElementById('modal-content-body');
    
    body.innerHTML = `
        <div class="detail-section">
            <h4>Itens do Pedido</h4>
            ${o.items.map(i => `
                <div class="detail-item">
                    <span><strong>${i.quantity}x</strong> ${i.name}</span>
                    <span>R$ ${(i.unit_price * i.quantity).toFixed(2)}</span>
                </div>
                ${i.customization ? `
                    <div class="customization">
                        ${i.customization.removed?.length ? `<div><small>Remover: ${i.customization.removed.join(', ')}</small></div>` : ''}
                        ${i.customization.extras?.length ? `<div><small>Extras: ${i.customization.extras.map(e => `${e.qty}x ${e.name}`).join(', ')}</small></div>` : ''}
                    </div>
                ` : ''}
            `).join('')}
        </div>
        <div class="detail-group">
            <h4>Endereço de Entrega</h4>
            <p>${o.delivery_address?.end}, ${o.delivery_address?.num} - ${o.delivery_address?.bairro}</p>
        </div>
        <div class="financial-summary">
            <div class="fin-row"><span>Subtotal</span> <span>R$ ${Number(o.subtotal).toFixed(2)}</span></div>
            <div class="fin-row"><span>Taxa de entrega</span> <span>R$ ${Number(o.shipping_cost).toFixed(2)}</span></div>
            <div class="fin-row fin-total"><span>Total</span> <span>R$ ${Number(o.total).toFixed(2)}</span></div>
        </div>
        <div style="margin-top:20px; font-size:0.85rem; color:#999;">
            <p><strong>Código de segurança:</strong> ${o.tracking_code}</p>
            ${o.tracking_url ? `<p style="margin-top:5px;"><strong>Link de rastreio:</strong> <a href="${o.tracking_url}" target="_blank" style="color:var(--purple);">Clique para acompanhar</a></p>` : ''}
        </div>
    `;

    document.getElementById('order-details-modal').style.display = 'block';
}

function closeDetails() {
    document.getElementById('order-details-modal').style.display = 'none';
}

init();