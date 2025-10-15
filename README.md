# Lima AEP Tool

## Visão Geral

O **Lima AEP Tool** é uma aplicação de desktop desenvolvida com Electron, projetada para fornecer uma interface de usuário para interagir com vários serviços da Adobe Experience Platform (AEP). A ferramenta simplifica tarefas como visualização de eventos de perfil, listagem de jornadas e exploração de audiências, consolidando tudo em um único aplicativo.

## Tecnologias Utilizadas

- **Electron:** Framework para criar aplicações de desktop com tecnologias web.
- **Node.js:** Ambiente de execução para o processo principal do Electron.
- **HTML5 / CSS3 / Vanilla JavaScript:** Estrutura da interface do usuário.
- **Tailwind CSS:** Framework de CSS para estilização rápida da UI (utilizado via script).

---

## Instalação e Execução

Para executar o projeto localmente, siga os passos abaixo:

1.  **Pré-requisitos:** Certifique-se de ter o [Node.js](https://nodejs.org/) instalado em sua máquina.
2.  **Instalar Dependências:** Navegue até a pasta raiz do projeto e execute o comando para instalar todas as dependências listadas no `package.json`.
    ```bash
    npm install
    ```
3.  **Iniciar a Aplicação:** Após a instalação, execute o seguinte comando para iniciar a aplicação:
    ```bash
    npm start
    ```

---

## Fluxo de Autenticação

A aplicação utiliza um fluxo de autenticação engenhoso para obter as credenciais necessárias sem que o usuário precise copiar e colar tokens.

1.  **Janela Oculta:** Ao iniciar, o `electron/main.js` abre uma janela de navegador oculta (`authWindow`) e a direciona para a página de login do Adobe Experience Cloud (`https://experience.adobe.com`).
2.  **Injeção de Script:** Assim que a página carrega, o script `electron/extractor.js` é injetado na página.
3.  **Captura de Contexto:** O `extractor.js` aguarda a inicialização dos scripts da própria Adobe na página. Uma vez que o objeto global `bootstrapInstance` está disponível, o script o utiliza para obter o contexto de autenticação.
4.  **Obtenção do Token:** O token de acesso é obtido de forma assíncrona através da propriedade `_authInfoPromise`. O script aguarda a resolução desta *Promise* e então chama o método `.getAccessToken()` no objeto `adobeIMS` resultante para obter o token final.
5.  **Comunicação IPC:** Com o token, `clientId`, `orgId` e outras informações em mãos, o `extractor.js` envia um `payload` completo para o processo principal (`main.js`) através de um canal de comunicação seguro (IPC) chamado `data-extracted`.
6.  **Inicialização da UI:** Ao receber o `payload`, o `main.js` armazena o contexto de autenticação, abre a janela principal da aplicação (`ui/window.html`) e envia os dados para ela através do canal `context-updated`, populando a interface.

---

## Funcionalidades

A aplicação é dividida em vários módulos acessíveis pelo menu lateral.

### 1. Summary (Resumo)

-   **Propósito:** Exibe as informações da sessão de autenticação atual.
-   **Detalhes Técnicos:** Esta é a tela padrão. Ela escuta o evento IPC `context-updated` e preenche os campos da tela (Org ID, Client ID, etc.) com os dados recebidos do processo principal. Também popula o seletor de Sandboxes, que é utilizado por outras funcionalidades.

### 2. Lista de Eventos AEP

-   **Propósito:** Permite consultar e visualizar os últimos Experience Events associados a um `entityId` (ID de perfil) em uma determinada sandbox.
-   **Detalhes Técnicos:**
    -   O usuário preenche um formulário com parâmetros como `entityId`, `startTime`, `endTime`, etc.
    -   Ao clicar em "Buscar Eventos", a função `handleSendRequest` em `window.js` é acionada.
    -   Ela monta os parâmetros e chama a função `window.api.aepRequest`, que por sua vez invoca o handler IPC `aep-request` no `main.js`.
    -   **Endpoint Utilizado:** `GET /data/core/ups/access/entities`
    -   Os eventos retornados são exibidos em uma lista, onde cada evento pode ser expandido para mostrar todos os seus atributos em uma tabela formatada.

### 3. Download de Batches com Falha

-   **Propósito:** Interface para facilitar o download de arquivos de um batch que falhou no AEP.
-   **Detalhes Técnicos:** No estado atual do código, a interface para esta funcionalidade existe, mas o botão "Buscar e Processar Batch" (`download-batch-btn`) não possui um `event listener` associado no arquivo `ui/window.js`. **A lógica para esta funcionalidade ainda precisa ser implementada.**

### 4. Jornadas Adobe

-   **Propósito:** Lista todas as versões de jornadas de uma sandbox, permitindo filtrar por nome e status. Também extrai e exibe as audiências utilizadas em cada jornada.
-   **Detalhes Técnicos:**
    -   Ao clicar em "Buscar Jornadas", a função `handleFetchJornadas` é acionada.
    -   Ela utiliza o `window.api.aepRequest` para fazer a chamada à API.
    -   **Endpoint Utilizado:** `GET /authoring/journeyVersions/`
    -   **URL Base:** `https://journey-private.adobe.io` (note que é um host diferente do padrão).
    -   **API Key Customizada:** A requisição para este endpoint específico utiliza uma `apiKey` diferente: `voyager_ui`.
    -   A função `findAudiencesInJourney` analisa a estrutura (`steps` e `nodes`) de cada jornada para extrair os IDs das audiências.

### 5. Audience Explorer (A ser implementado)

-   **Propósito:** Fornecer uma interface rica para explorar, filtrar e entender os segmentos de audiência da AEP.
-   **Detalhes Técnicos (Plano):**
    -   Ao ativar a aba, a função `initAudienceExplorer` será chamada.
    -   Ela chamará `audienceExplorer_loadAllData`, que fará requisições paginadas ao endpoint abaixo para buscar todas as definições de segmento.
    -   **Endpoint a ser Utilizado:** `GET /data/core/ups/segment/definitions`
    -   Os resultados serão exibidos em uma lista, com funcionalidades de filtro. Clicar em um item exibirá seus detalhes em JSON.

---

## Estrutura do Projeto

```
/
├── electron/
│   ├── main.js           # Ponto de entrada principal do Electron, gerencia as janelas e o IPC.
│   ├── extractor.js      # Script injetado na página da Adobe para extrair o contexto.
│   ├── preload.js        # Ponte de comunicação para a janela principal (ui/window.html).
│   └── auth_preload.js   # Ponte de comunicação para a janela de autenticação.
│
├── ui/
│   ├── window.html       # Arquivo HTML principal da interface.
│   ├── window.js         # Lógica JavaScript para toda a interface.
│   └── ...               # Outros arquivos de UI (CSS, imagens).
│
├── node_modules/         # (Ignorado pelo .gitignore) Dependências do projeto.
├── .gitignore            # Arquivo que define o que não deve ser versionado.
└── package.json          # Define os scripts e dependências do projeto.
```
