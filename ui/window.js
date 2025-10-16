// --- Global App State ---
let allJourneysData = null;

// --- UI Element References ---
const getElement = (id) => document.getElementById(id);

const ui = {
    orgNameDisplay: getElement('org-name-display'),
    tenantIdDisplay: getElement('tenant-id-display'),
    imsOrgDisplay: getElement('ims-org-display'),
    tokenDisplay: getElement('token-display'),
    tokenContainer: getElement('token-container'),
    toggleButton: getElement('toggle-button'),
    sandboxSwitcherHeader: getElement('sandbox-switcher-header'),
    headerOrgName: getElement('header-org-name'),
    debugToggle: getElement('debugToggle'),
    mergePolicySelect: getElement('mergePolicyId-select'),
    namespaceSelect: getElement('entityIdNS-select'),
    navLinks: document.querySelectorAll('.nav-link'),
    views: document.querySelectorAll('.view'),
    refreshAuthButton: getElement('refresh-auth-button'),
    sendRequestButton: getElement('send-request-btn'),
    configToggleButton: getElement('config-toggle'),
    downloadBatchButton: getElement('download-batch-btn'),
    jornadasFetchButton: getElement('jornadas-fetchButton'),
    jornadasReportButton: getElement('jornadas-audienceReportButton'),
    jornadasFilterInput: getElement('jornadas-filterInput'),
    jornadasStatusFilter: getElement('jornadas-statusFilter'),
    rawDataContainer: getElement('raw-data-container'),

    // Audience Explorer UI Elements
    audience: {
        filterInput: getElement('audience-filterInput'),
        filterFieldSelect: getElement('audience-filterFieldSelect'),
        treeContainer: getElement('audience-tree-container'),
        detailsContainer: getElement('audience-details-container'),
        stats: getElement('audience-stats'),
        loader: getElement('audience-loader'),
        summarizeButton: getElement('audience-summarizeButton'),
        summaryContainer: getElement('audience-summary-container'),
        summaryContent: getElement('audience-summary-content'),
        exportButton: getElement('audience-exportButton')
    }
};

// --- Audience Explorer State ---
const audienceExplorer_state = {
    fullData: [],
    filteredData: [],
    selectedNode: null,
    currentSegmentForSummary: null,
    isInitialized: false,
    debug: false
};

// --- Audience Explorer Functions ---
async function audienceExplorer_callGeminiApi(prompt) {
    const apiKey = ""; // API key is handled by the environment.
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}: ${await response.text()}`);
        }
        const result = await response.json();
        const candidate = result.candidates?.[0];
        if (candidate && candidate.content?.parts?.[0]?.text) {
            return candidate.content.parts[0].text;
        } else {
            throw new Error('Invalid response structure from Gemini API.');
        }
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return "Sorry, I couldn't generate a summary at this moment.";
    }
}

function audienceExplorer_getFilteredSegmentForSummary(segment) {
    if (audienceExplorer_state.debug) {
        return segment;
    }
    const newSegment = { ...segment };
    delete newSegment.dependents;
    delete newSegment.dependencies;
    return newSegment;
}

async function audienceExplorer_handleSummarizeClick() {
    if (!audienceExplorer_state.currentSegmentForSummary) return;
    ui.audience.summaryContainer.style.display = 'block';
    ui.audience.summaryContent.innerHTML = '<div class="flex items-center justify-center"><i class="fas fa-spinner fa-spin fa-lg mr-2"></i>Generating summary...</div>';
    const systemInstruction = "You are an expert marketing data analyst. Your task is to provide a clear, concise, and business-focused summary of a user audience segment based on its JSON definition. Explain who is in this audience in simple terms. Ignore technical details like IDs, hashes, and timestamps unless they are critical for understanding the segment. Focus on the 'name', 'description', and 'expression' fields to deduce the audience's purpose.";

    const filteredSegment = audienceExplorer_getFilteredSegmentForSummary(audienceExplorer_state.currentSegmentForSummary);

    const userQuery = "Please summarize the following audience segment json:\n\n```json\n" + JSON.stringify(filteredSegment, null, 2) + "\n```";
    const summaryText = await audienceExplorer_callGeminiApi(`${systemInstruction}\n\n${userQuery}`);
    let formattedHtml = summaryText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc">$1</li>').replace(/\n/g, '<br>');
    ui.audience.summaryContent.innerHTML = formattedHtml;
}

function audienceExplorer_transformAudienceData(data) {
    if (!data || !Array.isArray(data.segments)) return [];
    return data.segments.map(segment => {
        const result = {
            name: segment.name,
            id: segment.id,
            description: segment.description,
            lifecycleState: segment.lifecycleState,
            dependents: segment.dependents,
            dependencies: segment.dependencies,
            totalProfiles: segment.metrics?.data?.totalProfiles ?? null,
            creationDate: new Date(segment.creationTime).toLocaleString()
        };
        const evalInfo = segment.evaluationInfo;
        if (evalInfo?.batch?.enabled) result.segmentType = "Batch";
        else if (evalInfo?.continuous?.enabled) result.segmentType = "Streaming";
        else if (evalInfo?.synchronous?.enabled) result.segmentType = "Edge";
        else result.segmentType = null;
        const attributes = segment.ansibleDataModel?.dataModel?.expression?.profileAttributesContainer?.items?.map(item => item?.component?.id?.replace(/^profile\./, '')).filter(id => id != null && id !== 'segmentMembership.segmentID._id') || [];
        if (attributes.length > 0) result.attributes = attributes;
        const events = segment.ansibleDataModel?.dataModel?.expression?.xEventAttributesContainer?.items?.flatMap(outerItem => outerItem?.items || []).map(componentItem => componentItem?.eventType?.id?.replace(/^xEvent\./, '')).filter(id => id != null) || [];
        if (events.length > 0) result.events = events;
        return result;
    });
}

async function audienceExplorer_loadAllData() {
    let allSegments = [];
    let nextUrl = '/data/core/ups/segment/definitions';
    const selectedSandbox = ui.sandboxSwitcherHeader.value;
    if (!selectedSandbox) {
        ui.audience.stats.innerHTML = `<span class="text-red-400">Error: No sandbox selected.</span>`;
        return [];
    }
    ui.audience.loader.style.display = 'flex';
    ui.audience.stats.textContent = 'Loading data...';
    do {
        try {
            const data = await window.api.aepRequest({ path: nextUrl, sandboxName: selectedSandbox });
            if (data.segments && Array.isArray(data.segments)) {
                allSegments = allSegments.concat(audienceExplorer_transformAudienceData(data));
            }
            nextUrl = data?._links?.next?.href;
        } catch (error) {
            console.error(`Error loading or parsing audience data:`, error);
            ui.audience.stats.innerHTML = `<span class="text-red-400">Error loading data. Check console.</span>`;
            nextUrl = null;
        }
    } while (nextUrl);
    ui.audience.loader.style.display = 'none';
    return allSegments;
}

function audienceExplorer_createTreeNode(key) {
    const li = document.createElement('li');
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'tree-node';
    const placeholder = document.createElement('span');
    placeholder.className = 'w-5 inline-block';
    nodeDiv.appendChild(placeholder);
    const keySpan = document.createElement('span');
    keySpan.className = 'key';
    keySpan.textContent = key;
    nodeDiv.appendChild(keySpan);
    li.appendChild(nodeDiv);
    return { li, nodeDiv };
}

function audienceExplorer_renderTree(data, parent) {
    parent.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'tree';
    data.forEach((item, index) => {
        const name = item.name || `Segment ${index}`;
        const { li, nodeDiv } = audienceExplorer_createTreeNode(name);
        nodeDiv.dataset.id = item.id;
        ul.appendChild(li);
    });
    parent.appendChild(ul);
}

function audienceExplorer_renderDetails(data) {
    const detailsContainer = ui.audience.detailsContainer;
    detailsContainer.innerHTML = '';
    if (!data) {
        detailsContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;"><p>Select an object from the list to see its details.</p></div>';
        ui.audience.summarizeButton.style.display = 'none';
        ui.audience.summaryContainer.style.display = 'none';
        audienceExplorer_state.currentSegmentForSummary = null;
        return;
    }
    const valueToHtml = (value) => {
        if (value === null) return `<span class="json-null">null</span>`;
        switch (typeof value) {
            case 'string':
                return `"<span class="json-string">${value}</span>"`;
            case 'number':
                return `<span class="json-number">${value}</span>`;
            case 'boolean':
                return `<span class="json-boolean">${value}</span>`;
            case 'object':
                if (Array.isArray(value)) {
                    if (value.length === 0) return '[]';
                    let arrHtml = '[<br>';
                    arrHtml += value.map(item => `&nbsp;&nbsp;&nbsp;&nbsp;<span class="json-string">"${item}"</span>`).join(',<br>');
                    arrHtml += `<br>]`;
                    return arrHtml;
                }
                return JSON.stringify(value, null, 2).replace(/\n/g, '<br>').replace(/ /g, '&nbsp;');
            default:
                return String(value);
        }
    };
    let html = '<div class="text-sm font-mono whitespace-pre-wrap">{<br>';
    const keys = Object.keys(data);
    keys.forEach((key, index) => {
        const value = data[key];
        html += `&nbsp;&nbsp;<span class="json-key">"${key}"</span>: `;
        if (key === 'id' && typeof value === 'string') {
            const url = `https://experience.adobe.com/#/@${ui.imsOrgDisplay.textContent.split('@')[1]}/sname:${ui.sandboxSwitcherHeader.value}/platform/segment/browse/${value}`;
            html += `<a href="#" onclick="window.api.openExternal('${url}')" class="json-link">"<span class="json-string">${value}</span>"</a>`;
        } else if ((key === 'dependents' || key === 'dependencies') && Array.isArray(value) && value.length > 0) {
            let arrHtml = '[<br>';
            arrHtml += value.map(id => {
                const depSegment = audienceExplorer_state.fullData.find(s => s.id === id);
                const depName = depSegment ? depSegment.name : id;
                return `&nbsp;&nbsp;&nbsp;&nbsp;<a href="#" class="dependency-link json-link" data-id="${id}" title="Click to view segment: ${id}">"<span class="json-string">${depName}</span>"</a>`;
            }).join(',<br>');
            arrHtml += `<br>&nbsp;&nbsp;]`;
            html += arrHtml;
        } else {
            html += valueToHtml(value);
        }
        html += `${index === keys.length - 1 ? '' : ','}<br>`;
    });
    html += '}</div>';
    detailsContainer.innerHTML = html;
    detailsContainer.querySelectorAll('.dependency-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.currentTarget.dataset.id;
            if (!audienceExplorer_state.filteredData.some(item => item.id === targetId)) {
                ui.audience.filterInput.value = '';
                ui.audience.filterFieldSelect.value = 'all';
                audienceExplorer_handleFilter();
            }
            setTimeout(() => {
                const targetNode = ui.audience.treeContainer.querySelector(`.tree-node[data-id="${targetId}"]`);
                if (targetNode) {
                    targetNode.click();
                    targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 50);
        });
    });
    ui.audience.summarizeButton.style.display = 'flex';
    ui.audience.summaryContainer.style.display = 'none';
    ui.audience.summaryContent.innerHTML = '';
    audienceExplorer_state.currentSegmentForSummary = data;
}

function audienceExplorer_handleFilter() {
    const query = ui.audience.filterInput.value.toLowerCase().trim();
    const filterField = ui.audience.filterFieldSelect.value;
    if (!query) {
        audienceExplorer_state.filteredData = audienceExplorer_state.fullData;
    } else {
        audienceExplorer_state.filteredData = audienceExplorer_state.fullData.filter(item => {
            if (filterField === 'all') {
                const values = [item.name, item.id, item.description].map(v => (v || '').toLowerCase());
                const attributesMatch = item.attributes?.some(attr => attr.toLowerCase().includes(query)) || false;
                const eventsMatch = item.events?.some(event => event.toLowerCase().includes(query)) || false;
                return values.some(v => v.includes(query)) || attributesMatch || eventsMatch;
            } else if (filterField === 'attributes' || filterField === 'events') {
                return item[filterField]?.some(val => val.toLowerCase().includes(query)) || false;
            } else {
                return (item[filterField] || '').toString().toLowerCase().includes(query);
            }
        });
    }
    ui.audience.stats.textContent = `Showing ${audienceExplorer_state.filteredData.length} of ${audienceExplorer_state.fullData.length} segments.`;
    audienceExplorer_renderTree(audienceExplorer_state.filteredData, ui.audience.treeContainer);
    audienceExplorer_renderDetails(null);
    if (audienceExplorer_state.selectedNode) {
        audienceExplorer_state.selectedNode.classList.remove('selected');
        audienceExplorer_state.selectedNode = null;
    }
}

function audienceExplorer_exportToCsv() {
    if (audienceExplorer_state.filteredData.length === 0) return;
    const headers = ['Name', 'ID', 'TotalProfiles', 'CreationDate'];
    const csvRows = [headers.join(',')];
    const escapeCsvCell = (cell) => {
        if (cell == null) return '';
        const cellStr = String(cell);
        return cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n') ? `"${cellStr.replace(/"/g, '""')}"` : cellStr;
    };
    audienceExplorer_state.filteredData.forEach(item => {
        const row = headers.map(header => escapeCsvCell(item[header.charAt(0).toLowerCase() + header.slice(1)]));
        csvRows.push(row.join(','));
    });
    window.api.saveCsv(csvRows.join('\n'));
}

// --- Core UI and Data Handling ---

function updateSummaryUI(data) {
    if (!data || data.error) {
        const errorMessage = (data && data.error) ? data.error : 'Nenhum dado encontrado.';
        const errorText = `Erro: ${errorMessage}`;
        [ui.orgNameDisplay, ui.tenantIdDisplay, ui.imsOrgDisplay].forEach(el => el.textContent = errorText);
        ui.headerOrgName.textContent = 'Erro';
        ui.toggleButton.disabled = true;
        ui.rawDataContainer.textContent = JSON.stringify(data, null, 2);
        return;
    }

    ui.headerOrgName.textContent = data.orgName || 'Org Name Not Found';
    ui.orgNameDisplay.textContent = data.orgName || 'Não encontrado';
    ui.tenantIdDisplay.textContent = data.tenantId || 'Não encontrado';
    ui.imsOrgDisplay.textContent = data.imsOrg || 'Não encontrado';
    ui.rawDataContainer.textContent = JSON.stringify(data, null, 2);

    // Sandbox Switcher
    ui.sandboxSwitcherHeader.innerHTML = '';
    if (data.availableSandboxes && data.availableSandboxes.length > 0) {
        data.availableSandboxes.forEach(sandbox => {
            const option = document.createElement('option');
            option.value = sandbox.name;
            option.textContent = `${sandbox.title} (${sandbox.type})`;
            if (sandbox.name === data.lastSelectedSandbox) {
                option.selected = true;
            }
            ui.sandboxSwitcherHeader.appendChild(option);
        });
        handleSandboxChange();
    } else {
        const option = document.createElement('option');
        option.textContent = 'Nenhuma sandbox disponível';
        option.disabled = true;
        ui.sandboxSwitcherHeader.appendChild(option);
    }

    // Token Display
    if (data.tokenInfo && data.tokenInfo.token) {
        ui.tokenDisplay.textContent = data.tokenInfo.token;
        ui.toggleButton.disabled = false;
    } else {
        ui.toggleButton.disabled = true;
    }
}

async function fetchAndPopulateMergePolicies() {
    try {
        ui.mergePolicySelect.innerHTML = '<option value="">Carregando...</option>';
        const selectedSandbox = ui.sandboxSwitcherHeader.value;
        if (!selectedSandbox) throw new Error('Nenhuma sandbox selecionada.');

        const data = await window.api.aepRequest({
            path: '/data/core/ups/config/mergePolicies',
            sandboxName: selectedSandbox
        });

        ui.mergePolicySelect.innerHTML = '<option value="">Selecione uma Merge Policy</option>';
        if (data && data.children && data.children.length > 0) {
            data.children.forEach(policy => {
                const option = document.createElement('option');
                option.value = policy.id;
                option.textContent = policy.name;
                if (policy.default) {
                    option.selected = true;
                }
                ui.mergePolicySelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to fetch merge policies:', error);
        ui.mergePolicySelect.innerHTML = `<option value="">Erro: ${error.message || 'Unknown'}</option>`;
    }
}

async function fetchAndPopulateNamespaces() {
    try {
        ui.namespaceSelect.innerHTML = '<option value="">Carregando...</option>';
        const selectedSandbox = ui.sandboxSwitcherHeader.value;
        if (!selectedSandbox) throw new Error('Nenhuma sandbox selecionada.');

        const data = await window.api.aepRequest({
            path: '/data/core/idnamespace/identities',
            sandboxName: selectedSandbox
        });

        ui.namespaceSelect.innerHTML = '<option value="">Selecione um Namespace</option>';
        if (data && Array.isArray(data) && data.length > 0) {
            const filteredNamespaces = data.filter(ns =>
                ns.code === 'ECID' || (ns.namespaceType === 'Custom' && ns.custom === true)
            );

            filteredNamespaces.forEach(ns => {
                const option = document.createElement('option');
                option.value = ns.code;
                option.textContent = `${ns.name} (${ns.code})`
                ui.namespaceSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to fetch namespaces:', error);
        ui.namespaceSelect.innerHTML = `<option value="">Erro: ${error.message || 'Unknown'}</option>`;
    }
}

// --- View Switching Logic ---
function switchView(viewId) {
    ui.views.forEach(view => {
        view.classList.toggle('active', view.dataset.viewId === viewId);
    });
    ui.navLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.view === viewId);
    });

    // On-demand initialization for Audience Explorer
    if (viewId === 'audience-explorer' && !audienceExplorer_state.isInitialized) {
        initAudienceExplorer();
    }
}

async function initAudienceExplorer() {
    if (audienceExplorer_state.isInitialized) return;

    audienceExplorer_state.fullData = await audienceExplorer_loadAllData();
    audienceExplorer_state.filteredData = audienceExplorer_state.fullData;
    ui.audience.stats.textContent = `Loaded ${audienceExplorer_state.fullData.length} total segments.`;
    audienceExplorer_renderTree(audienceExplorer_state.filteredData, ui.audience.treeContainer);

    ui.audience.filterInput.addEventListener('keyup', audienceExplorer_handleFilter);
    ui.audience.filterFieldSelect.addEventListener('change', audienceExplorer_handleFilter);
    ui.audience.summarizeButton.addEventListener('click', audienceExplorer_handleSummarizeClick);
    ui.audience.exportButton.addEventListener('click', audienceExplorer_exportToCsv);

    ui.audience.treeContainer.addEventListener('click', (e) => {
        const nodeDiv = e.target.closest('.tree-node');
        if (!nodeDiv) return;
        if (audienceExplorer_state.selectedNode) {
            audienceExplorer_state.selectedNode.classList.remove('selected');
        }
        nodeDiv.classList.add('selected');
        audienceExplorer_state.selectedNode = nodeDiv;
        const id = nodeDiv.dataset.id;
        if (id !== undefined) {
            const selectedItem = audienceExplorer_state.filteredData.find(item => item.id === id);
            audienceExplorer_renderDetails(selectedItem);
        }
    });

    // Reload data when sandbox changes
    ui.sandboxSwitcherHeader.addEventListener('change', async () => {
        if (document.querySelector('.view.active').dataset.viewId === 'audience-explorer') {
            audienceExplorer_state.fullData = await audienceExplorer_loadAllData();
            audienceExplorer_handleFilter();
        }
    });

    audienceExplorer_state.isInitialized = true;
}

// --- Event Handlers ---

function handleSandboxChange() {
    const selectedSandbox = ui.sandboxSwitcherHeader.value;
    if (!selectedSandbox) return;
    // window.api.setActiveSandbox(selectedSandbox); // This function does not exist
    // Refresh context-sensitive data
    fetchAndPopulateMergePolicies();
    fetchAndPopulateNamespaces();
}

async function handleSendRequest() {
    const wrapper = getElement('events-wrapper');
    const button = ui.sendRequestButton;
    wrapper.innerHTML = `<p>Carregando eventos...</p>`;
    button.disabled = true;

    try {
        const params = new URLSearchParams({
            'schema.name': '_xdm.context.experienceevent',
            'relatedSchema.name': '_xdm.context.profile',
        });
        document.querySelectorAll('#config-body [data-key]').forEach(input => {
            if (input.value) {
                if (input.type === 'datetime-local') {
                    const date = new Date(input.value + '-03:00');
                    params.append(input.dataset.key, date.getTime());
                } else {
                    params.append(input.dataset.key, input.value);
                }
            }
        });

        const selectedSandbox = ui.sandboxSwitcherHeader.value;
        if (!selectedSandbox) throw new Error('Nenhuma sandbox selecionada.');

        const data = await window.api.aepRequest({
            path: '/data/core/ups/access/entities',
            params: params.toString(),
            sandboxName: selectedSandbox
        });

        buildEventView(data);

    } catch (error) {
        wrapper.innerHTML = `<div style="color:red;"><strong>Erro:</strong> ${error.message}</div>`;
        console.error('Fetch error:', error);
    } finally {
        button.disabled = false;
    }
}

function buildEventView(responseData) {
    const wrapper = getElement('events-wrapper');
    const counter = getElement('event-counter');
    if (!wrapper || !counter) return;
    wrapper.innerHTML = '';
    let eventsArray = responseData?.children || [];
    counter.textContent = `(Exibindo ${eventsArray.length} eventos)`;

    if (eventsArray.length === 0) {
        wrapper.innerHTML = `<p>Nenhum evento encontrado.</p>`;
        return;
    }

    const sortedEvents = eventsArray.sort((a, b) => b.timestamp - a.timestamp);
    sortedEvents.forEach(event => {
        const eventContainer = document.createElement('div');
        eventContainer.className = 'event-container';
        const entity = event.entity;
        const date = new Date(event.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

        // Initial call with an empty string for the base path, and level 0
        let tableBodyHTML = generateRowsFromObject(entity, '', 0);

        eventContainer.innerHTML = `
            <details open>
                <summary class="config-header">
                    <div style="display: flex; align-items: center;">
                        <h3 style="font-size: 1rem; font-weight: 600;">${entity.eventType || 'Evento sem tipo'}</h3>
                        <span style="margin-left: auto; padding-left: 1rem; font-size: 0.8rem; color: #555;">${date}</span>
                    </div>
                    <svg class="chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </summary>
                <div style="overflow-x: auto; padding: 1rem;">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30%;">Atributo</th>
                                <th style="width: 40%;">Valor</th>
                                <th style="width: 30%;">Caminho</th>
                            </tr>
                        </thead>
                        <tbody>${tableBodyHTML}</tbody>
                    </table>
                </div>
            </details>
        `;
        wrapper.appendChild(eventContainer);
    });
}

function generateRowsFromObject(obj, path, level = 0) {
    let rowsHTML = '';
    if (!obj) return '';

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            const newPath = path ? `${path}.${key}` : key;
            const padding = level * 24; // 24px padding per level

            const escapeSingleQuotes = (str) => String(str).replace(/'/g, "\'");

            const pathCopyButton = `<button class="copy-btn" title="Copiar caminho" onclick="navigator.clipboard.writeText('${escapeSingleQuotes(newPath)}')">Copy</button>`;

            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                rowsHTML += `<tr>
                                <td style="padding-left: ${padding}px;"><strong>${key}</strong></td>
                                <td></td>
                                <td><code>${newPath}</code> ${pathCopyButton}</td>
                             </tr>`;
                rowsHTML += generateRowsFromObject(value, newPath, level + 1);
            } else {
                const displayValue = JSON.stringify(value, null, 2).replace(/</g, "&lt;").replace(/>/g, "&gt;");

                let valueClass = 'text-gray-700';
                if (typeof value === 'string') {
                    valueClass = 'text-green-700';
                } else if (typeof value === 'number') {
                    valueClass = 'text-blue-700';
                } else if (typeof value === 'boolean') {
                    valueClass = 'text-purple-700';
                }

                const clipboardValue = typeof value === 'string' ? JSON.stringify(value).slice(1, -1) : value;
                const valueCopyButton = `<button class="copy-btn" title="Copiar valor" onclick="navigator.clipboard.writeText('${escapeSingleQuotes(clipboardValue)}')">Copy</button>`;

                rowsHTML += `<tr>
                                <td style="padding-left: ${padding}px;">${key}</td>
                                <td><code class="${valueClass}">${displayValue}</code> ${valueCopyButton}</td>
                                <td><code>${newPath}</code> ${pathCopyButton}</td>
                             </tr>`;
            }
        }
    }
    return rowsHTML;
}

function applyJourneyFilters() {
    if (!allJourneysData || !allJourneysData.results) {
        return;
    }

    const nameFilter = ui.jornadasFilterInput.value.toLowerCase();
    const statusFilter = ui.jornadasStatusFilter.value;

    const filteredJourneys = allJourneysData.results.filter(journey => {
        const nameMatch = !nameFilter || journey.name.toLowerCase().includes(nameFilter);
        const statusMatch = !statusFilter || journey.state === statusFilter;
        return nameMatch && statusMatch;
    });

    const filteredData = { ...allJourneysData, results: filteredJourneys };
    buildJornadasView(filteredData);
}

async function handleFetchJornadas() {
    const container = getElement('jornadas-container');
    const button = ui.jornadasFetchButton;
    const reportButton = ui.jornadasReportButton;

    container.innerHTML = '<p class="text-gray-500">Buscando jornadas...</p>';
    button.disabled = true;
    reportButton.style.display = 'none';

    try {
        const selectedSandbox = ui.sandboxSwitcherHeader.value;
        if (!selectedSandbox) throw new Error('Nenhuma sandbox selecionada.');

        const data = await window.api.aepRequest({
            baseUrl: 'https://journey-private.adobe.io',
            path: '/authoring/journeyVersions/',
            sandboxName: selectedSandbox,
            apiKey: 'voyager_ui'
        });

        allJourneysData = data; // Store data
        applyJourneyFilters(); // Apply filters and render view

    } catch (error) {
        container.innerHTML = `<div style="color:red;"><strong>Erro ao buscar jornadas:</strong> ${error.message}</div>`;
        console.error('Fetch journeys error:', error);
    } finally {
        button.disabled = false;
    }
}

function findAudiencesInJourney(journey) {
    const audiences = [];
    if (!journey || !journey.steps || !journey.ui?.nodes) return audiences;

    const nodesById = journey.ui.nodes;

    // Logic to find audiences remains the same...
    const initialStep = journey.steps.find(s => s.uid === journey.initialStep);
    if (initialStep && initialStep.transitions) {
        for (const transition of initialStep.transitions) {
            const node = nodesById[transition.nodeId];
            if (node?.subtype === 'segmentQualification') {
                const audienceName = node.data?.label || node.data?.segmentIds?.[0]?.name || 'Audiência de Início';
                const audienceId = node.data?.segmentIds?.[0]?.id;
                if (audienceId && !audiences.some(a => a.id === audienceId)) {
                    audiences.push({ name: `✨ ${audienceName} (Início)`, id: audienceId });
                }
            }
        }
    }

    for (const step of journey.steps) {
        if (step.nodeType === 'condition' && step.transitions) {
            for (const transition of step.transitions) {
                let inAudienceFunc = null;
                if (transition.condition?.function === 'inAudience') {
                    inAudienceFunc = transition.condition;
                } else if (transition.condition?.function === 'not' && transition.condition.args?.[0]?.function === 'inAudience') {
                    inAudienceFunc = transition.condition.args[0];
                }

                if (inAudienceFunc) {
                    const audienceId = inAudienceFunc.args?.[0]?.value;
                    if (!audienceId) continue;

                    const node = nodesById[step.nodeId];
                    let audienceName = step.nodeName; // fallback
                    if (node?.data?.conditions) {
                        for (const cond of node.data.conditions) {
                            if (cond.expression?.includes('inAudience("')) {
                                try {
                                    const match = cond.expression.match(/inAudience\(\"([^\"]+)\"\)/);
                                    if (match && match[1]) {
                                        audienceName = match[1];
                                        break; // Found a name
                                    }
                                } catch (e) { console.warn("Regex error", e); }
                            }
                        }
                    }

                    if (!audiences.some(a => a.id === audienceId)) {
                        audiences.push({ name: audienceName, id: audienceId });
                    }
                }
            }
        }
    }
    return audiences;
}

function buildStepsHtml(journey) {
    if (!journey.steps || journey.steps.length === 0) {
        return '<div class="p-4 border-t border-gray-200"><p class="text-sm text-gray-500">Esta jornada não possui steps definidos.</p></div>';
    }

    let stepsHtml = '<div class="p-4 border-t border-gray-200"><h4 class="text-md font-semibold text-gray-700 mb-2">Steps da Jornada:</h4><ul class="list-decimal list-inside pl-4 space-y-1">';

    journey.steps.forEach(step => {
        const stepName = step.nodeName || step.name || `Step`;
        const stepType = step.nodeType || 'N/A';
        stepsHtml += `<li class="text-sm text-gray-600"><strong>${stepName}</strong> (Tipo: <code>${stepType}</code>, UID: <code>${step.uid}</code>)</li>`;
    });

    stepsHtml += '</ul></div>';
    return stepsHtml;
}

function getStatusColor(status) {
    const colors = {
        live: 'bg-green-100 text-green-800',
        draft: 'bg-gray-100 text-gray-800',
        stopped: 'bg-red-100 text-red-800',
        closed: 'bg-orange-100 text-orange-800',
        finishing: 'bg-blue-100 text-blue-800',
        updated: 'bg-yellow-100 text-yellow-800',
        created: 'bg-indigo-100 text-indigo-800',
        deployed: 'bg-purple-100 text-purple-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
}

function buildJornadasView(data) {
    const container = getElement('jornadas-container');
    container.innerHTML = '';

    const reportButton = ui.jornadasReportButton;

    if (!data.results || data.results.length === 0) {
        container.innerHTML = '<p class="text-gray-500">Nenhuma jornada encontrada para os filtros aplicados.</p>';
        reportButton.style.display = 'none';
        return;
    }

    data.results.forEach(journey => {
        const journeyElement = document.createElement('div');
        journeyElement.className = 'bg-white rounded-xl shadow-md overflow-hidden mb-6';

        const audiences = findAudiencesInJourney(journey);
        const stepsHtml = buildStepsHtml(journey);
        const statusColor = getStatusColor(journey.state);

        let audiencesHtml = '';
        if (audiences.length > 0) {
            audiencesHtml += '<div class="p-4"><h4 class="text-md font-semibold text-gray-700 mb-2">Audiências na Jornada:</h4><ul class="list-disc list-inside pl-4">';
            audiences.forEach(aud => {
                audiencesHtml += `<li class="text-sm text-gray-600"><strong>${aud.name}:</strong> <code>${aud.id}</code></li>`;
            });
            audiencesHtml += '</ul></div>';
        } else {
            audiencesHtml = '<div class="p-4"><p class="text-sm text-gray-500">Nenhuma audiência encontrada nesta jornada.</p></div>';
        }

        journeyElement.innerHTML = `
            <details class="w-full">
                <summary class="bg-gray-50 p-4 cursor-pointer flex justify-between items-center">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800">${journey.name}</h3>
                        <p class="text-sm text-gray-600">Versão: ${journey.journeyVersion} | Estado: <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">${journey.state}</span></p>
                    </div>
                    <span class="text-gray-500">Ver detalhes</span>
                </summary>
                <div class="border-t border-gray-200">
                    ${audiencesHtml}
                    ${stepsHtml}
                </div>
            </details>
        `;
        container.appendChild(journeyElement);
    });

    reportButton.style.display = 'block';
}

function handleGenerateAudienceReport() {
    if (!allJourneysData || !allJourneysData.results) {
        alert('Nenhum dado de jornada para gerar o relatório. Busque as jornadas primeiro.');
        return;
    }

    const nameFilter = ui.jornadasFilterInput.value.toLowerCase();
    const statusFilter = ui.jornadasStatusFilter.value;
    const currentlyVisibleJourneys = allJourneysData.results.filter(journey => {
        const nameMatch = !nameFilter || journey.name.toLowerCase().includes(nameFilter);
        const statusMatch = !statusFilter || journey.state === statusFilter;
        return nameMatch && statusMatch;
    });

    const reportData = [];
    currentlyVisibleJourneys.forEach(journey => {
        const audiences = findAudiencesInJourney(journey);
        if (audiences.length > 0) {
            audiences.forEach(aud => {
                reportData.push({
                    journeyName: journey.name,
                    audienceName: aud.name.replace('✨ ', '').replace(' (Início)', ''),
                    audienceId: aud.id
                });
            });
        }
    });

    if (reportData.length === 0) {
        alert('Nenhuma audiência encontrada nas jornadas exibidas para gerar o relatório.');
        return;
    }

    let csvContent = "Jornada,Nome Audiencia,id da Audiencia\r\n";
    reportData.forEach(row => {
        const jName = `"${row.journeyName.replace(/"/g, "''")}"`;
        const aName = `"${row.audienceName.replace(/"/g, "''")}"`;
        const aId = `"${row.audienceId}"`;
        csvContent += `${jName},${aName},${aId}\r\n`;
    });

    window.api.saveCsv(csvContent);
}

// --- App Initialization ---
function init() {
    console.log("Initializing app...");
    // Setup navigation
    ui.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = link.dataset.view;
            switchView(viewId);
        });
    });

    // Setup main action buttons
    ui.refreshAuthButton.addEventListener('click', () => window.api.reauthenticate());
    ui.toggleButton.addEventListener('click', () => {
        const isHidden = ui.tokenContainer.style.display === 'none';
        ui.tokenContainer.style.display = isHidden ? 'block' : 'none';
        ui.toggleButton.textContent = isHidden ? 'Esconder Token' : 'Mostrar Token';
    });
    ui.sandboxSwitcherHeader.addEventListener('change', handleSandboxChange);

    // Setup view-specific buttons
    ui.sendRequestButton.addEventListener('click', handleSendRequest);
    ui.configToggleButton.addEventListener('click', () => {
        const configBody = getElement('config-body');
        const chevron = ui.configToggleButton.querySelector('.chevron-icon');
        configBody.classList.toggle('open');
        chevron.classList.toggle('expanded');
    });

    ui.jornadasFetchButton.addEventListener('click', handleFetchJornadas);
    ui.jornadasReportButton.addEventListener('click', handleGenerateAudienceReport);
    ui.jornadasFilterInput.addEventListener('input', applyJourneyFilters);
    ui.jornadasStatusFilter.addEventListener('change', applyJourneyFilters);

    ui.debugToggle.addEventListener('change', (e) => {
        audienceExplorer_state.debug = e.target.checked;
    });

    // Listen for context updates from the main process
    window.api.onContextUpdate((data) => {
        console.log('Context updated:', data);
        updateSummaryUI(data);
    });

    // Initial setup
    switchView('summary');
    window.api.requestContext(); // Ask main process for initial data
}

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', init);