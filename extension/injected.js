try {
  console.log('[Adobe Extensão - Injetado] 1. Script injetado executando...');

  const dePara = {
    "3ADD33055666F1A47F000101@AdobeOrg": "3467204459",
    "5DDA02175D5159390A495CE7@AdobeOrg": "10453646",
    "7D74659F56C5923A7F000101@AdobeOrg": "1558213814",
    "8A2A1AAE589065BF0A495CC2@AdobeOrg": "4177429831",
    "73D97EE25CCCE8260A495EBD@AdobeOrg": "2035883719",
    "92A384AF57E547317F000101@AdobeOrg": "3609389169",
    "97F502BE5329601E0A490D4C@AdobeOrg": "3306287331",
    "2436FCE859C0D3FA0A495C84@AdobeOrg": "1138184226",
    "35282D5D529D040A0A490D45@AdobeOrg": "2934865386",
    "598039445B0FBF8F0A495C1F@AdobeOrg": "3093409724",
    "AA47BC7455F1873B7F000101@AdobeOrg": "180516885",
    "C0BA356C5CF531FA0A495C43@AdobeOrg": "2623867888",
    "F93F88C35ABCCD070A495CF8@AdobeOrg": "1167376679",
    "FC2C3E3859FAE3930A495E22@AdobeOrg": "1213155780",
    "FC9A55935C7968850A495E90@AdobeOrg": "3035513441",
    "88971E916756E8850A495FDE@AdobeOrg": "221379021"
  };

  const bootstrapInstance = window.parcelRequire49a6('eiR7j').getBootstrap();
  const accessTokenInfo = bootstrapInstance._ims.getAccessToken();
  const clientId = bootstrapInstance.clientId;

  let activeImsOrg = null;
  const sessionDataString = window.localStorage.getItem('unifiedShellSession');

  if (sessionDataString) {
    const jsonString = sessionDataString.substring(sessionDataString.indexOf('|') + 1);
    const sessionData = JSON.parse(jsonString);
    activeImsOrg = sessionData.activeOrg;
  }
  if (!activeImsOrg) {
    activeImsOrg = bootstrapInstance.authInformation.activeOrg;
  }
  console.log('[Adobe Extensão - Injetado] 2. Org Ativa:', activeImsOrg);

  // ... (Resto da lógica para pegar orgName, tenantId, sandboxes)
  let orgName = null;
  let tenantId = null;
  let lastSelectedSandbox = null;
  let availableSandboxes = [];
  const userIdHash = dePara[activeImsOrg];

  if (userIdHash && sessionDataString) {
    const jsonString = sessionDataString.substring(sessionDataString.indexOf('|') + 1);
    const sessionData = JSON.parse(jsonString);
    const userData = sessionData[userIdHash];
    if (userData) {
      const currentOrgData = userData.userOrgs?.find(org => org.imsOrgId === activeImsOrg);
      if (currentOrgData) {
        orgName = currentOrgData.orgName;
        tenantId = currentOrgData.tenantId;
      }
      const sandboxData = userData.shellSandboxes?.[activeImsOrg];
      if (sandboxData) {
        lastSelectedSandbox = sandboxData.lastSelectedSandbox;
        availableSandboxes = sandboxData.sandboxes;
      }
    }
  }

  const payload = {
    tokenInfo: accessTokenInfo, clientId, imsOrg: activeImsOrg, orgName, tenantId, lastSelectedSandbox, availableSandboxes
  };

  console.log('[Adobe Extensão - Injetado] 3. Payload final:', payload);
  window.postMessage({ type: 'FROM_PAGE_SCRIPT', payload: payload }, '*');

} catch (e) {
  console.error('[Adobe Extensão - Injetado] ERRO:', e);
  window.postMessage({ type: 'FROM_PAGE_SCRIPT', payload: { error: `Erro no injected.js: ${e.message}` } }, '*');
}