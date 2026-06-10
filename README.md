# 🍔 Lanchonete da Dira 2 - Sistema de Pedidos Online

Uma aplicação web moderna e responsiva para facilitar o gerenciamento de pedidos de uma lanchonete, permitindo que os clientes escolham produtos, personalizem seus lanches e enviem o pedido diretamente via WhatsApp.
## 🚀 Funcionalidades

*   **Cardápio Dinâmico:** Organizado por categorias (Hambúrgueres, Bebidas, Sucos, Porções, etc).
*   **Personalização de Itens:** 
    *   Opção de remover ingredientes padrão.
    *   Adição de itens extras (Carne, Queijo, Bacon) com atualização automática de preço.
*   **Carrinho Inteligente:**
    *   Agrupamento de itens idênticos.
    *   Suporte a múltiplas customizações do mesmo produto.
    *   Controle de quantidade diretamente no carrinho.
*   **Cálculo de Frete:**
    *   Integração com a **API ViaCEP** para busca automática de endereço.
    *   Tabela de preços de frete diferenciada por bairro.
*   **Finalização via WhatsApp:** Gera uma mensagem formatada com todos os detalhes do pedido, endereço de entrega e valores (subtotal, frete e total).

## 🛠️ Tecnologias Utilizadas

*   **HTML5 & CSS3:** Layout moderno utilizando CSS Variables, Flexbox e Grid.
*   **JavaScript (Vanilla):** Lógica de manipulação de DOM, gerenciamento de estado do carrinho e cálculos.
*   **ViaCEP API:** Consumo de serviço externo para validação e preenchimento de endereços.
*   **Font Awesome:** Ícones para interface.

## 📋 Como funciona o código

O projeto está estruturado de forma modular no JavaScript:
1.  **Dados (`products`):** Centraliza todos os itens do menu em um array de objetos.
2.  **Customização (`openCustomModal`):** Função que gera dinamicamente as opções de ingredientes e extras com base no produto selecionado.
3.  **Assinatura de Item (`itemSignature`):** Uma lógica única que garante que um X-Burger "Sem Cebola" seja tratado como um item diferente de um X-Burger "Com Bacon" no carrinho.
4.  **Integração (`buscarCEP`):** Utiliza `fetch` assíncrono para buscar dados de localização e atualizar a taxa de entrega em tempo real.

## 📱 Responsividade

O sistema foi desenhado com foco em dispositivos móveis (Mobile First), garantindo que o cliente possa fazer o pedido de qualquer lugar com facilidade.

---
Desvolvido por Isaias Rocha
