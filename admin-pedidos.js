const API_URL = window.location.origin + "/api";
const token = localStorage.getItem('token');
let allOrders = [];
let currentFilter = 'all';
let showingArchived = false;

// Mapeamento para garantir que as cores das bordas batam com o CSS
const statusColorMap = {
    'PENDENTE': 'pendente',
    'CONFIRMADO': 'confirmado',
    'EM_PREPARO': 'preparo',
    'SAIU_PARA_ENTREGA': 'entrega',
    'ENTREGUE': 'entregue',
    'CANCELADO': 'cancelado'
};

async function loadOrders() {
    try {
        const res = await fetch(`${API_URL}/admin/orders?archived=${showingArchived}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 403) {
            alert("Acesso Negado! Você não tem permissão de Administrador.");
            window.location.href = 'index.html';
            return;
        }
        const data = await res.json();
        // Garante que allOrders seja sempre um array para evitar erros no .filter()
        allOrders = Array.isArray(data) ? data : [];
        renderDashboard();
    } catch (err) { console.error("Erro ao carregar pedidos:", err); }
}

function renderDashboard() {
    updateStats();
    const grid = document.getElementById('orders-grid');
    const searchTerm = document.getElementById('order-search').value.toLowerCase();
    
    const filtered = allOrders.filter(o => {
        const matchesFilter = currentFilter === 'all' || o.status === currentFilter;
        const matchesSearch = o.user_name.toLowerCase().includes(searchTerm) || 
                             o.user_phone.includes(searchTerm) || 
                             o.id.toString().includes(searchTerm) ||
                             o.tracking_code.toLowerCase().includes(searchTerm);
        return matchesFilter && matchesSearch;
    });

    grid.innerHTML = filtered.map(o => `
        <div class="order-card bg-light" style="border-top-color: var(--${statusColorMap[o.status] || 'pendente'})">
            <div class="order-header">
                <span class="order-num">Pedido #${o.id}</span>
                <span class="badge bg-${o.status}">${o.status.replace(/_/g, ' ')}</span>
                <div class="quick-status">
                    <select onchange="updateOrderStatus(${o.id}, this.value)" class="status-dropdown">
                        <option value="PENDENTE" ${o.status === 'PENDENTE' ? 'selected' : ''}>Recebido</option>
                        <option value="CONFIRMADO" ${o.status === 'CONFIRMADO' ? 'selected' : ''}>Confirmado</option>
                        <option value="EM_PREPARO" ${o.status === 'EM_PREPARO' ? 'selected' : ''}>Em preparo</option>
                        <option value="SAIU_PARA_ENTREGA" ${o.status === 'SAIU_PARA_ENTREGA' ? 'selected' : ''}>Saiu para entrega</option>
                        <option value="ENTREGUE" ${o.status === 'ENTREGUE' ? 'selected' : ''}>Entregue</option>
                        <option value="CANCELADO" ${o.status === 'CANCELADO' ? 'selected' : ''}>Cancelado</option>
                    </select>
                </div>
            </div>
            <div class="info-section">
                <p><i class="fas fa-user"></i> <strong>${o.user_name}</strong></p>
                <p><i class="fas fa-phone"></i> ${o.user_phone}</p>
                <p><i class="fas fa-map-marker-alt"></i> ${o.delivery_address?.end}, ${o.delivery_address?.num}</p>
                <p><i class="fas fa-barcode"></i> Código: <strong>${o.tracking_code}</strong></p>
            </div>
            <div class="order-value">R$ ${o.total.toFixed(2).replace('.', ',')}</div>
            <div class="order-actions">
                <button class="btn-sm btn-details" onclick="viewDetails(${o.id})"><i class="fas fa-eye"></i> Detalhes</button>
                <a href="https://wa.me/55${o.user_phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${o.user_name}! Seu pedido #${o.id} está em ${o.status.toLowerCase()}. Código: ${o.tracking_code}`)}" target="_blank" class="btn-sm btn-whatsapp"><i class="fab fa-whatsapp"></i> WhatsApp</a>
                <button class="btn-sm btn-motoboy" onclick="chamarMotoboy(${o.id})"><i class="fas fa-key"></i> Enviar Código de Entrega</button>
                <button class="btn-sm btn-status" onclick="openStatusModal(${o.id})"><i class="fas fa-sync"></i> Atualizar Status</button>
                <button class="btn-sm btn-track" onclick="openTrackingModal(${o.id}, '${o.tracking_url || ''}')"><i class="fas fa-map-marked-alt"></i> Rastreio</button>
                <button class="btn-sm" style="background: #6c757d; color: white;" onclick="archiveOrder(${o.id}, ${!o.archived})"><i class="fas ${o.archived ? 'fa-box-open' : 'fa-archive'}"></i> ${o.archived ? 'Restaurar' : 'Arquivar'}</button>
                ${o.status === 'PENDENTE' ? `
                    <button class="btn-sm" style="background: var(--primary); color: white;" onclick="deleteOrder(${o.id})"><i class="fas fa-trash"></i> Excluir</button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function updateStats() {
    document.getElementById('stat-total').innerText = allOrders.length;
    document.getElementById('stat-pending').innerText = allOrders.filter(o => o.status === 'PENDENTE').length;
    document.getElementById('stat-preparing').innerText = allOrders.filter(o => o.status === 'EM_PREPARO').length;
    document.getElementById('stat-shipping').innerText = allOrders.filter(o => o.status === 'SAIU_PARA_ENTREGA').length;
    document.getElementById('stat-completed').innerText = allOrders.filter(o => o.status === 'ENTREGUE').length;
}

function toggleArchived() {
    showingArchived = !showingArchived;
    
    // Reseta o filtro de status para "Todos" ao trocar de visão
    currentFilter = 'all';
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-filter="all"]').classList.add('active');

    const btn = document.getElementById('btn-toggle-archived');
    btn.innerHTML = showingArchived ? '<i class="fas fa-list"></i> Ver Ativos' : '<i class="fas fa-archive"></i> Ver Arquivados';
    btn.style.background = showingArchived ? 'var(--secondary)' : 'var(--dark)';
    btn.style.color = showingArchived ? 'black' : 'white';
    loadOrders();
}

async function archiveOrder(id, shouldArchive) {
    try {
        const res = await fetch(`${API_URL}/admin/orders/${id}/archive`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ archived: shouldArchive })
        });
        if (res.ok) {
            allOrders = allOrders.filter(o => o.id !== id);
            renderDashboard();
        } else {
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const errData = await res.json();
                alert("Erro: " + errData.error);
            } else {
                alert("Erro crítico no servidor (Rota não encontrada ou erro 500). Verifique o console.");
            }
        }
    } catch (err) { console.error("Erro ao arquivar:", err); }
}

async function deleteOrder(id) {
    if (!confirm("Tem certeza que deseja EXCLUIR este pedido permanentemente?")) return;
    try {
        const res = await fetch(`${API_URL}/admin/orders/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            allOrders = allOrders.filter(o => o.id !== id);
            renderDashboard();
        } else {
            const isJson = res.headers.get('content-type')?.includes('application/json');
            const errData = isJson ? await res.json() : { error: 'Servidor retornou erro inesperado (HTML)' };
            alert("Erro ao excluir: " + errData.error);
        }
    } catch (err) { console.error("Erro ao excluir:", err); }
}

async function clearAllOrders() {
    const confirmacao = confirm("ATENÇÃO: Isso apagará TODOS os pedidos do banco de dados permanentemente (incluindo o histórico dos clientes). Deseja continuar?");
    if (!confirmacao) return;

    try {
        const res = await fetch(`${API_URL}/admin/orders/all`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            alert("Banco de pedidos zerado com sucesso!");
            loadOrders();
        }
    } catch (err) { console.error("Erro ao zerar pedidos:", err); }
}

async function updateOrderStatus(id, newStatus) {
    const res = await fetch(`${API_URL}/admin/orders/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
    });
    if(res.ok) {
        allOrders = allOrders.map(o => o.id === id ? {...o, status: newStatus} : o);
        closeModal('modal-details');
        renderDashboard();
    } else {
        const err = await res.json();
        alert("Erro ao atualizar status: " + (err.error || "Erro desconhecido"));
    }
}

async function chamarMotoboy(id) {
    const o = allOrders.find(order => order.id === id);
    if (!o) return;

    const novoCodigo = prompt("Informe os números do código de entrega para o cliente:", o.tracking_code);
    if (novoCodigo === null) return; // Cancelado pelo usuário

    try {
        // 1. Atualizar código no banco de dados
        const resTrack = await fetch(`${API_URL}/admin/orders/${id}/tracking`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ tracking_code: novoCodigo })
        });

        // 2. Atualizar status para SAIU_PARA_ENTREGA no banco de dados
        const res = await fetch(`${API_URL}/admin/orders/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status: 'SAIU_PARA_ENTREGA' })
        });

        if (resTrack.ok && res.ok) {
            // Atualiza o estado local para refletir a mudança no painel imediatamente
            allOrders = allOrders.map(order => order.id === id ? {...order, status: 'SAIU_PARA_ENTREGA', tracking_code: novoCodigo} : order);
            renderDashboard();
            alert("Pedido atualizado! O cliente agora pode ver o código de entrega na página 'Meus Pedidos'.");
        } else {
            const err = await res.json();
            alert("Erro ao atualizar status: " + (err.error || "Erro desconhecido"));
        }
    } catch (err) {
        console.error("Erro ao chamar motoboy:", err);
    }
}

async function viewDetails(id) {
    const res = await fetch(`${API_URL}/admin/orders/${id}`, { headers: { 'Authorization': `Bearer ${token}` }});
    const o = await res.json();
    
    document.getElementById('modal-order-id').innerText = `#${o.id}`;
    const body = document.getElementById('modal-body');
    body.innerHTML = `
        <div class="details-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <h4>Dados do Cliente</h4>
                <p><strong>Nome:</strong> ${o.user_name}</p>
                <p><strong>Telefone:</strong> ${o.user_phone}</p>
                <p><strong>Endereço:</strong> ${o.delivery_address?.end}, ${o.delivery_address?.num} - ${o.delivery_address?.bairro}</p>
                <p><strong>Cód. Entrega:</strong> ${o.tracking_code}</p>
            </div>
            <div>
                <h4>Resumo Financeiro</h4>
                <p>Subtotal: R$ ${o.subtotal.toFixed(2)}</p>
                <p>Frete: R$ ${o.shipping_cost.toFixed(2)}</p>
                <p style="font-size: 1.2rem; font-weight: bold; color: var(--primary);">Total: R$ ${o.total.toFixed(2)}</p>
            </div>
        </div>
        <h4 style="margin-top:20px;">Itens do Pedido</h4>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; margin-top: 10px;">
            ${o.items.map(i => {
                const custom = typeof i.customization === 'string' ? JSON.parse(i.customization) : i.customization;
                return `
                    <div style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                        <strong>${i.quantity}x ${i.name}</strong> - R$ ${(i.unit_price * i.quantity).toFixed(2)}
                        ${custom?.removed?.length > 0 ? `<br><small style="color:red">Remover: ${custom.removed.join(', ')}</small>` : ''}
                        ${custom?.extras?.length > 0 ? `<br><small style="color:green">Extras: ${custom.extras.map(e => `${e.qty}x ${e.name}`).join(', ')}</small>` : ''}
                    </div>
                `;
            }).join('')}
        </div>
        <h4 style="margin-top:20px;">Alterar Status</h4>
        <div class="status-grid-buttons" style="margin-top:10px;">
            <button onclick="updateOrderStatus(${o.id}, 'PENDENTE')" class="btn-status-change bg-PENDENTE">PENDENTE</button>
            <button onclick="updateOrderStatus(${o.id}, 'CONFIRMADO')" class="btn-status-change bg-CONFIRMADO">CONFIRMADO</button>
            <button onclick="updateOrderStatus(${o.id}, 'EM_PREPARO')" class="btn-status-change bg-EM_PREPARO">EM PREPARO</button>
            <button onclick="updateOrderStatus(${o.id}, 'SAIU_PARA_ENTREGA')" class="btn-status-change bg-SAIU_PARA_ENTREGA">NA RUA</button>
            <button onclick="updateOrderStatus(${o.id}, 'ENTREGUE')" class="btn-status-change bg-ENTREGUE">ENTREGUE</button>
            <button onclick="updateOrderStatus(${o.id}, 'CANCELADO')" class="btn-status-change bg-CANCELADO">CANCELADO</button>
        </div>
    `;
    document.getElementById('modal-details').style.display = 'block';
}

function openTrackingModal(id, url) {
    document.getElementById('track-order-id').value = id;
    document.getElementById('track-url').value = url;
    document.getElementById('modal-tracking').style.display = 'block';
}

async function saveTracking() {
    const id = document.getElementById('track-order-id').value;
    const url = document.getElementById('track-url').value;
    const res = await fetch(`${API_URL}/admin/orders/${id}/tracking`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tracking_url: url })
    });
    if(res.ok) {
        allOrders = allOrders.map(o => o.id == id ? {...o, tracking_url: url} : o);
        closeModal('modal-tracking');
        renderDashboard();
    }
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// Event Listeners
document.getElementById('order-search').addEventListener('input', renderDashboard);
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        renderDashboard();
    });
});

loadOrders();

// Atualização automática do painel a cada 15 segundos para novos pedidos aparecerem sozinhos
setInterval(loadOrders, 15000);