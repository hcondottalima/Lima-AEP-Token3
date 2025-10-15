// background.js

// Ouve o evento de clique no ícone da extensão
chrome.action.onClicked.addListener((tab) => {
  // Define as dimensões e o tipo da janela a ser criada
  const windowOptions = {
    url: chrome.runtime.getURL('window.html'), // O arquivo HTML que será carregado
    type: 'popup', // Um tipo de janela sem as barras de endereço, etc.
    width: 1000,
    height: 700
  };

  // Cria a janela
  chrome.windows.create(windowOptions);
});