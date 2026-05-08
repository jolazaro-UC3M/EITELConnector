function openSettings() { settingsModal.classList.add('open'); }
    function closeSettings() { settingsModal.classList.remove('open'); }

    function bindEvents() {
      document.querySelectorAll('.nav button[data-view]').forEach(btn => btn.onclick = () => activateView(btn.dataset.view));

      document.getElementById('assetKey').oninput = updateAssetPreview;
      if (document.getElementById('assetSourceMode')) document.getElementById('assetSourceMode').addEventListener('change', syncAssetSourceModeUi);
      document.getElementById('btnRefreshOverview').onclick = refreshOverview;
      document.getElementById('btnSearchOffers').onclick = () => loadCatalogs(true);
      document.getElementById('btnRefreshCatalog').onclick = async () => { await loadCatalogs(false); };
      if (document.getElementById('btnLoadShowcase')) {
        document.getElementById('btnLoadShowcase').onclick = async () => { await loadCatalogShowcase(true); };
      }
      if (document.getElementById('catalogSearchText')) {
        document.getElementById('catalogSearchText').addEventListener('input', () => {
          if (typeof renderCatalogShowcase === 'function') renderCatalogShowcase(state.catalogRows || []);
        });
      }
      if (document.getElementById('catalogFilterConnector')) {
        document.getElementById('catalogFilterConnector').addEventListener('input', () => {
          if (typeof renderCatalogShowcase === 'function') renderCatalogShowcase(state.catalogRows || []);
        });
      }
      
      // Actualizar URL DSP dinámicamente cuando cambia el connector ID
      document.getElementById('searchConnectorId').addEventListener('input', (e) => {
        const connectorId = (e.target.value || 'provider').trim() || 'provider';
        const dspUrl = buildDspUrl(connectorId);
        document.getElementById('resolvedAddress').value = dspUrl;
        document.getElementById('transferAddress').value = dspUrl;
      });
      
      document.getElementById('catalogAssetId').addEventListener('change', () => {
        const accept = document.getElementById('catalogAcceptTerms');
        if (accept) accept.checked = false;
        syncCatalogSelectionState();
      });
      document.getElementById('catalogAcceptTerms').addEventListener('change', syncCatalogSelectionState);
      document.getElementById('btnRequestContract').onclick = requestContractByAsset;
      document.getElementById('btnListAgreements').onclick = listAgreements;
      document.getElementById('agreementSelect').addEventListener('change', (e) => {
        const contractId = (e.target?.value || '').trim();
        if (!contractId) return;
        if (typeof syncTransferAddressFromAgreement === 'function') syncTransferAddressFromAgreement(contractId);
      });
      document.getElementById('btnStartTransfer').onclick = startTransfer;
      document.getElementById('btnListTransfers').onclick = listTransfers;
      if (document.getElementById('transferMode')) document.getElementById('transferMode').addEventListener('change', syncTransferModeUi);
      if (document.getElementById('btnRestoreFromBackup')) {
        document.getElementById('btnRestoreFromBackup').onclick = async () => {
          await restoreAssetsFromBackup({ onlyIfEmpty: false, silent: false });
        };
      }
      if (document.getElementById('btnArcgisTokenRefresh')) {
        document.getElementById('btnArcgisTokenRefresh').onclick = async () => {
          const token = await fetchArcgisAccessTokenFromPortalSession();
          refreshArcgisTokenIndicator();
          if (!token) {
            writeOut({ status: 401, error: 'No se pudo regenerar token ArcGIS. Revisa la sesión del portal.' });
            return;
          }
          writeOut({ status: 200, message: 'Token ArcGIS regenerado correctamente.' });
        };
      }
      if (document.getElementById('btnPublishArcgisLogin')) {
        document.getElementById('btnPublishArcgisLogin').onclick = () => startArcgisLogin();
      }
      if (document.getElementById('btnPublishArcgisTokenRefresh')) {
        document.getElementById('btnPublishArcgisTokenRefresh').onclick = async () => {
          const token = await fetchArcgisAccessTokenFromPortalSession();
          refreshArcgisTokenIndicator();
          if (!token) {
            writeOut({ status: 401, error: 'No se pudo obtener token ArcGIS para el origen del asset.' });
            return;
          }
          writeOut({ status: 200, message: 'Token ArcGIS disponible para publicar el asset.' });
        };
      }
      if (document.getElementById('btnStarArcgisLogin')) {
        document.getElementById('btnStarArcgisLogin').onclick = () => startArcgisLogin();
      }
      if (document.getElementById('btnStarTrustRefresh')) {
        document.getElementById('btnStarTrustRefresh').onclick = async () => {
          try { await listSecrets(false); } catch {}
          try { refreshArcgisTokenIndicator(); } catch {}
          try { await refreshOverview(); } catch {}
          try {
            if (typeof refreshStarTrustSnapshot === 'function') {
              await refreshStarTrustSnapshot(true);
            }
          } catch {}
          try { refreshStarTrustPanel(); } catch {}
        };
      }
      if (document.getElementById('btnSaveSecret')) document.getElementById('btnSaveSecret').onclick = saveSecret;
      if (document.getElementById('btnListSecrets')) document.getElementById('btnListSecrets').onclick = () => listSecrets(true);
      if (document.getElementById('btnDeleteSecret')) document.getElementById('btnDeleteSecret').onclick = deleteSecret;
      if (document.getElementById('btnProbeSecrets')) document.getElementById('btnProbeSecrets').onclick = () => discoverSecretsApi(true);
      if (document.getElementById('btnToggleSecretValue')) {
        document.getElementById('btnToggleSecretValue').onclick = () => {
          const input = document.getElementById('secretValue');
          if (!input) return;
          input.type = input.type === 'password' ? 'text' : 'password';
          document.getElementById('btnToggleSecretValue').textContent = input.type === 'password' ? 'Mostrar valor' : 'Ocultar valor';
        };
      }
      document.getElementById('btnCreatePolicy').onclick = async () => writeOut(await createOrUpdatePolicy());
      document.getElementById('btnListPolicies').onclick = listPolicies;
      document.getElementById('btnDeletePolicy').onclick = deletePolicy;
      document.getElementById('btnCreateContractDef').onclick = async () => writeOut(await createContractDefinition());
      document.getElementById('btnListContractDefs').onclick = listContractDefinitions;
      document.getElementById('btnDeleteContractDef').onclick = deleteContractDefinition;
      document.getElementById('btnGoPolicy').onclick = () => activateView('policy');
      document.getElementById('btnGoContract').onclick = () => activateView('contractdef');

      document.getElementById('btnCreateAsset').onclick = async () => {
        writeOut(await createOrUpdateAsset());
        await refreshOverview();
        if (typeof loadPublishedAssets === 'function') await loadPublishedAssets(false);
      };
      document.getElementById('btnListAssets').onclick = async () => {
        writeOut(await callApi('POST', '/v3/assets/request', q()));
        if (typeof loadPublishedAssets === 'function') await loadPublishedAssets(false);
      };
      if (document.getElementById('btnRefreshPublishedAssets')) {
        document.getElementById('btnRefreshPublishedAssets').onclick = async () => {
          if (typeof loadPublishedAssets === 'function') await loadPublishedAssets(true);
        };
      }
      document.getElementById('btnDeleteAsset').onclick = async () => {
        writeOut(await deleteAssetAndCleanupBackup());
        if (typeof loadPublishedAssets === 'function') await loadPublishedAssets(false);
      };
      document.getElementById('btnExplorerSend').onclick = async () => writeOut(await callApi(document.getElementById('explMethod').value, document.getElementById('explPath').value.trim(), document.getElementById('explBody').value));

      document.getElementById('btnOpenSettings').onclick = openSettings;
      document.getElementById('btnCloseSettings').onclick = closeSettings;
      settingsModal.onclick = (e) => { if (e.target === settingsModal) closeSettings(); };
      document.getElementById('btnCloseInfo').onclick = closeInfoPopup;
      document.getElementById('btnInfoAction').onclick = () => {
        if (typeof infoActionHandler === 'function') infoActionHandler();
      };
      infoModal.onclick = (e) => { if (e.target === infoModal) closeInfoPopup(); };

      const autoApply = () => {
        settings.language = document.getElementById('setLanguage').value;
        settings.theme = document.getElementById('setTheme').value;
        settings.consolePos = document.getElementById('setConsolePos').value;
        settings.consoleFont = Number(document.getElementById('setConsoleFont').value || 13);
        const apiBaseRaw = (document.getElementById('setApiBaseUrl')?.value || cfg.managementApiUrl || '/api/management').trim();
        const apiBaseNormalized = typeof normalizeManagementApiBaseUrl === 'function'
          ? normalizeManagementApiBaseUrl(apiBaseRaw)
          : apiBaseRaw;
        settings.apiBaseUrl = String(apiBaseNormalized).includes('/api/management')
          ? apiBaseNormalized
          : (typeof buildSafeManagementApiBaseUrl === 'function' ? buildSafeManagementApiBaseUrl() : '/api/management');
        settings.apiKeyOverride = (document.getElementById('setApiKey')?.value || '').trim();
        settings.apiTimeoutMs = Math.max(1000, Number(document.getElementById('setApiTimeout')?.value || 15000));
        settings.apiRetries = Math.max(0, Math.min(5, Number(document.getElementById('setApiRetries')?.value || 1)));
        if (settings.consolePos === 'bottom') app.classList.remove('console-hidden');
        applySettings();
      };
      ['setLanguage', 'setTheme', 'setConsolePos'].forEach(id => document.getElementById(id).addEventListener('change', autoApply));
      document.getElementById('setConsoleFont').addEventListener('input', autoApply);
      ['setApiBaseUrl', 'setApiKey', 'setApiTimeout', 'setApiRetries'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', autoApply);
      });
      document.getElementById('policyMode').addEventListener('change', applyPolicyMode);

      const authTypeSelect = document.getElementById('pubAuthType');
      const authTokenInput = document.getElementById('pubAuthToken');
      const authHeaderInput = document.getElementById('pubAuthHeader');
      const authPrefixInput = document.getElementById('pubAuthPrefix');
      const authSecretSelect = document.getElementById('pubAuthSecret');

      if (authTypeSelect) authTypeSelect.addEventListener('change', applyAuthTypeForm);
      [authTokenInput, authHeaderInput, authPrefixInput, authSecretSelect].forEach(el => {
        if (!el) return;
        el.addEventListener('input', () => {
          try { syncAuthHeadersJson(); } catch {}
        });
      });

      document.getElementById('btnConsoleToggle').onclick = () => {
        const hidden = app.classList.toggle('console-hidden');
        updateConsoleButtons(hidden);
        persistSettings();
      };
      document.getElementById('btnConsoleExpand').onclick = () => {
        settings.consoleExpanded = !settings.consoleExpanded;
        applySettings();
      };
      document.getElementById('btnConsoleShow').onclick = () => {
        app.classList.remove('console-hidden');
        updateConsoleButtons(false);
      };
    }

    window.useAgreement = (id) => {
      document.getElementById('agreementId').value = id;
      document.getElementById('agreementSelect').value = id;
      if (typeof syncTransferAddressFromAgreement === 'function') syncTransferAddressFromAgreement(id);
      activateView('transfers');
    };
    window.checkTransfer = checkTransfer;
    window.useCatalogAsset = (assetId) => {
      const idx = state.catalogRows.findIndex(r => r.assetId === assetId);
      if (idx >= 0) document.getElementById('catalogAssetId').value = String(idx);
      const accept = document.getElementById('catalogAcceptTerms');
      if (accept) accept.checked = false;
      syncCatalogSelectionState();
      activateView('catalog');
    };
    window.useCatalogAssetByIndex = (idx) => {
      const parsed = Number(idx);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed >= (state.catalogRows || []).length) return;
      const select = document.getElementById('catalogAssetId');
      if (select) select.value = String(parsed);
      const accept = document.getElementById('catalogAcceptTerms');
      if (accept) accept.checked = false;
      syncCatalogSelectionState();
      activateView('catalog');
      const contractBox = document.getElementById('catalogContractBox');
      if (contractBox) contractBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.showAgreementDetail = (index) => showInfoPopup('Detalle de contrato', state.agreementRows[index] || {});
    window.showTransferDetail = (index) => showInfoPopup('Detalle de transferencia', state.transferRows[index] || {});
    // Keep original handlers from 02-operations.js to avoid recursive self-calls.

    function init() {
      hideAuthGate();
      document.getElementById('badge').textContent = `${role} · EDC · ${getApiBaseUrl() || 'management api'}`;
      const configuredRemoteConnector = (cfg.defaultRemoteConnector || '').trim();
      document.getElementById('searchConnectorId').value = configuredRemoteConnector;
      document.getElementById('transferAddress').value = '';
      if (document.getElementById('catalogConnectorsList')) {
        document.getElementById('catalogConnectorsList').value = (cfg.connectorCatalogList || 'conectoruc3m, conectorFuenlabrada').trim();
      }
      if (document.getElementById('catalogFilterConnector')) {
        document.getElementById('catalogFilterConnector').value = '';
      }
      document.getElementById('btnEitelPortal').onclick = () => window.open('https://uc3m-espacioeitel.hub.arcgis.com/', '_blank');
      document.getElementById('btnEitelProyecto').onclick = () => window.open('https://uc3m-espacioeitel.hub.arcgis.com/pages/proyecto', '_blank');
      document.getElementById('btnEitelCatalogo').onclick = () => window.open('https://uc3m-espacioeitel.hub.arcgis.com/search', '_blank');
      updateAssetPreview();
      loadSettings();
      bindEvents();
      
      // Inicializar URL DSP con el valor por defecto
      const initialConnectorId = (document.getElementById('searchConnectorId').value || configuredRemoteConnector || 'provider').trim() || 'provider';
      document.getElementById('resolvedAddress').value = buildDspUrl(initialConnectorId);
      document.getElementById('transferAddress').value = buildDspUrl(initialConnectorId);
      
      document.getElementById('btnArcgisLogout').onclick = arcgisLogout;
      applyPolicyMode();
      if (typeof syncAssetSourceModeUi === 'function') syncAssetSourceModeUi();
      if (typeof applyAuthTypeForm === 'function') applyAuthTypeForm();
      if (typeof syncTransferModeUi === 'function') syncTransferModeUi();
      if (typeof ensureArcgisTokenIndicatorTimer === 'function') ensureArcgisTokenIndicatorTimer();
      if (typeof refreshArcgisTokenIndicator === 'function') refreshArcgisTokenIndicator();
      if (typeof refreshStarTrustPanel === 'function') refreshStarTrustPanel();
      applySettings();

      refreshOverview();
      loadCatalogShowcase(false);
      loadPublishedAssets(false);
      restoreAssetsFromBackup({ onlyIfEmpty: true, silent: true });
      listSecrets(false);
    }
    init();

