// Referências aos elementos do DOM
const orgNameDisplay = document.getElementById('org-name-display');
const tenantIdDisplay = document.getElementById('tenant-id-display');
const imsOrgDisplay = document.getElementById('ims-org-display');
const clientIdDisplay = document.getElementById('client-id-display');
const tokenDisplay = document.getElementById('token-display');
const tokenContainer = document.getElementById('token-container');
const toggleButton = document.getElementById('toggle-button');
const lastSandboxDisplay = document.getElementById('last-sandbox-display');
const sandboxesListDisplay = document.getElementById('sandboxes-list-display');

// Novos elementos para o toggle da lista de sandbox
const sandboxToggle = document.getElementById('sandbox-toggle');
const sandboxArrow = document.getElementById('sandbox-arrow');

// Função para atualizar o popup com as informações
function updatePopup(data) {
  if (data && !data.error) {
    orgNameDisplay.textContent = data.orgName || 'Não encontrado';
    tenantIdDisplay.textContent = data.tenantId || 'Não encontrado';
    imsOrgDisplay.textContent = data.imsOrg || 'Não encontrado';
    clientIdDisplay.textContent = data.clientId || 'Não encontrado';
    lastSandboxDisplay.textContent = data.lastSelectedSandbox || 'Nenhuma selecionada';

    const sandboxesContainer = sandboxesListDisplay;
    sandboxesContainer.innerHTML = ''; // Limpa a lista antes de preencher

    if (data.availableSandboxes && data.availableSandboxes.length > 0) {
      const sortedSandboxes = data.availableSandboxes.sort((a, b) => {
        const isActiveA = a.name === data.lastSelectedSandbox;
        const isActiveB = b.name === data.lastSelectedSandbox;

        // 1. A sandbox ativa sempre vem primeiro
        if (isActiveA) return -1;
        if (isActiveB) return 1;

        // 2. Organiza por tipo: Production antes de Development
        if (a.type === 'production' && b.type !== 'production') return -1;
        if (a.type !== 'production' && b.type === 'production') return 1;

        // 3. Dentro do mesmo tipo, organiza por ordem alfabética do título
        return a.title.localeCompare(b.title);
      });
      // --- FIM DA NOVA LÓGICA DE ORDENAÇÃO ---

      // Agora, percorre a lista já ordenada
      sortedSandboxes.forEach(sandbox => {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('sandbox-item');

        const iconSpan = document.createElement('span');
        iconSpan.classList.add('sandbox-item-icon');

        if (sandbox.type === 'production') {
          iconSpan.classList.add('production');
        } else {
          iconSpan.classList.add('development');
        }

        const isActive = sandbox.name === data.lastSelectedSandbox;
        if (isActive) {
          itemDiv.classList.add('active');
        }

        const textSpan = document.createElement('span');
        textSpan.textContent = `${sandbox.title} ${sandbox.name} (${sandbox.region})`;

        itemDiv.appendChild(iconSpan);
        itemDiv.appendChild(textSpan);
        sandboxesContainer.appendChild(itemDiv);
      });
    } else {
      sandboxesContainer.textContent = 'Nenhuma sandbox disponível';
    }

    if (data.tokenInfo && data.tokenInfo.token) {
      tokenDisplay.textContent = data.tokenInfo.token;
      toggleButton.disabled = false;
      if (tokenContainer.style.display !== 'block') {
        toggleButton.textContent = 'Mostrar Token';
      }
    } else {
      toggleButton.disabled = true;
      toggleButton.textContent = 'Token não disponível';
    }
  } else {
    // Lógica de erro
    const errorMessage = (data && data.error) ? data.error : 'Nenhum dado encontrado.';
    const errorText = `Erro: ${errorMessage}`;
    orgNameDisplay.textContent = errorText;
    tenantIdDisplay.textContent = errorText;
    imsOrgDisplay.textContent = errorText;
    clientIdDisplay.textContent = errorText;
    lastSandboxDisplay.textContent = errorText;
    sandboxesListDisplay.textContent = errorText;
    toggleButton.disabled = true;
    toggleButton.textContent = 'Falha ao buscar';
  }
}
sandboxToggle.addEventListener('click', () => {
  const isHidden = sandboxesListDisplay.style.display === 'none';
  if (isHidden) {
    // Mostra a lista e gira a seta
    sandboxesListDisplay.style.display = 'block';
    sandboxArrow.classList.add('expanded');
  } else {
    // Esconde a lista e retorna a seta à posição original
    sandboxesListDisplay.style.display = 'none';
    sandboxArrow.classList.remove('expanded');
  }
});
toggleButton.addEventListener('click', () => {
  const isHidden = tokenContainer.style.display === 'none';

  if (isHidden) {
    tokenContainer.style.display = 'block';
    toggleButton.textContent = 'Esconder Token';
  } else {
    tokenContainer.style.display = 'none';
    toggleButton.textContent = 'Mostrar Token';
  }
});
// ==========================================================

// Lógica de carregamento quando o popup abre
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['sessionData'], (result) => {
    if (result.sessionData) {
      updatePopup(result.sessionData);
    }
  });
});