console.log('[Adobe Extensão] Content Script Carregado.');

// Injeta o script na página assim que o content script é executado.
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

// Ouve a resposta do script injetado
window.addEventListener('message', (event) => {
  if (event.source === window && event.data.type && event.data.type === 'FROM_PAGE_SCRIPT') {
    const sessionData = event.data.payload;

    // A única responsabilidade é salvar os dados recebidos.
    chrome.storage.local.set({ sessionData: sessionData }, () => {
      console.log('[Adobe Extensão] Dados salvos no storage:', sessionData);
    });
  }
});