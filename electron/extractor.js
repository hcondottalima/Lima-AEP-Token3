async function extractData() {
    try {
        console.log('[Extractor] Bootstrap instance found. Executing data extraction...');

        const bootstrapInstance = window.parcelRequire49a6('eiR7j').getBootstrap();
        const sessionDataString = window.localStorage.getItem('unifiedShellSession');

        if (!bootstrapInstance || !sessionDataString) {
            throw new Error('Could not find bootstrap instance or session data after polling.');
        }

        const authInfo = await bootstrapInstance._authInfoPromise;
        if (!authInfo || !authInfo.adobeIMS) {
            throw new Error('Could not resolve auth promise or find adobeIMS object.');
        }

        const accessTokenInfo = authInfo.adobeIMS.getAccessToken();
        if (!accessTokenInfo || !accessTokenInfo.token) {
             throw new Error('Could not retrieve access token from authInfo.adobeIMS.getAccessToken()');
        }
        
        const clientId = bootstrapInstance._clientId;

        const sessionData = JSON.parse(sessionDataString.substring(sessionDataString.indexOf('|') + 1));
        const activeImsOrg = sessionData.activeOrg;
        if (!activeImsOrg) {
            throw new Error('Could not determine active organization from session data.');
        }

        const allUserOrgs = sessionData.userOrgs || [];
        const activeOrgDetails = allUserOrgs.find(org => org.imsOrgId === activeImsOrg);
        const orgName = activeOrgDetails ? activeOrgDetails.orgName : null;
        const tenantId = activeOrgDetails ? activeOrgDetails.tenantId : null;

        let lastSelectedSandbox = null;
        let availableSandboxes = [];
        const orgAccountMap = sessionData.shellOrgAccountMap;
        if (orgAccountMap && orgAccountMap[activeImsOrg]) {
            const numericId = orgAccountMap[activeImsOrg];
            const orgData = sessionData[numericId];
            if (orgData && orgData.shellSandboxes && orgData.shellSandboxes[activeImsOrg]) {
                const sandboxData = orgData.shellSandboxes[activeImsOrg];
                lastSelectedSandbox = sandboxData.lastSelectedSandbox;
                availableSandboxes = sandboxData.sandboxes || [];
            }
        }

        const payload = {
            tokenInfo: accessTokenInfo,
            clientId: clientId,
            imsOrg: activeImsOrg,
            orgName: orgName,
            tenantId: tenantId,
            lastSelectedSandbox: lastSelectedSandbox,
            availableSandboxes: availableSandboxes,
            allUserOrgs: allUserOrgs
        };

        console.log('[Extractor] Successfully built payload.');
        window.electronBridge.sendData(payload);

    } catch (e) {
        console.error('[Extractor] FATAL ERROR during extraction:', e);
        window.electronBridge.sendData({ error: `Erro no extractor.js: ${e.message}` });
    }
}

// --- Polling Logic ---
let attempts = 0;
const maxAttempts = 50; // 10 seconds
console.log('[Extractor] Starting to poll for bootstrap instance...');

const interval = setInterval(() => {
    if (window.parcelRequire49a6) {
        clearInterval(interval);
        extractData();
    } else {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(interval);
            console.error('[Extractor] Timeout: Could not find bootstrap instance after 10 seconds.');
            window.electronBridge.sendData({ error: 'Timeout: A instância do Adobe não foi encontrada. Tente recarregar.' });
        }
    }
}, 200);