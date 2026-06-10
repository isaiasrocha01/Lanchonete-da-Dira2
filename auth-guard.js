/**
 * auth-guard.js
 * Proteção de Front-end contra acesso direto e monitoramento de inatividade.
 */
(function() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    const path = window.location.pathname;

    // 1. Redirecionamento de páginas protegidas
    const protectedPaths = ['/meus-pedidos', '/admin/pedidos'];
    const isAdminPath = path.startsWith('/admin');

    if (protectedPaths.some(p => path.startsWith(p))) {
        if (!token || !user) {
            window.location.href = '/login?msg=unauthorized';
            return;
        }
        if (isAdminPath && user.role !== 'ADMIN') {
            window.location.href = '/?msg=forbidden';
            return;
        }
    }

    // 2. Monitoramento de Inatividade (10 minutos)
    let inactivityTimer;
    const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 min em ms

    function resetTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(logoutDueToInactivity, INACTIVITY_LIMIT);
    }

    function logoutDueToInactivity() {
        if (!localStorage.getItem('token')) return;
        localStorage.clear();
        window.location.href = '/login?msg=expired';
    }

    // Apenas monitora se o usuário estiver logado
    if (token) {
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        events.forEach(name => document.addEventListener(name, resetTimer, true));
        resetTimer();
    }
})();

function logout() {
    localStorage.clear();
    window.location.href = '/login';
}