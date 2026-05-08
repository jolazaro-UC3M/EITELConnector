/**
 * Summarizes policy terms from an ODRL policy object.
 * Extracts constraints from permissions and formats them as a readable string.
 * 
 * @param {Object} policyObj - ODRL policy object containing permissions and constraints
 * @returns {string} Formatted constraint summary or message indicating no explicit constraints
 * 
 * @example
 * const summary = summarizePolicyTerms(policyDefinition);
 * // Returns: "purpose eq USE | recipient eq urn:uuid:123"
 */
function summarizePolicyTerms(policyObj) {
      const permsRaw = policyObj?.['odrl:permission'] || policyObj?.permission || [];
      const perms = Array.isArray(permsRaw) ? permsRaw : [permsRaw];
      const constraints = perms.flatMap(p => {
        const c = p?.constraint || p?.['odrl:constraint'] || [];
        return Array.isArray(c) ? c : [c];
      }).filter(Boolean);
      if (!constraints.length) return 'Sin restricciones explícitas';
      return constraints.map(c => `${c.leftOperand || c['odrl:leftOperand'] || 'condición'} ${c.operator || c['odrl:operator'] || 'eq'} ${c.rightOperand || c['odrl:rightOperand'] || '-'}`).join(' | ');
    }

    /**
     * Parses a keyword list from various input formats.
     * Handles arrays, strings (split by comma, semicolon, or newline), and null/undefined values.
     * 
     * @param {string|string[]|null|undefined} raw - Raw keyword input in array or string format
     * @returns {string[]} Array of trimmed, non-empty keywords
     * 
     * @example
     * parseKeywordList('python, javascript; nodejs\nreact');
     * // Returns: ['python', 'javascript', 'nodejs', 'react']
     */
    function parseKeywordList(raw) {
      if (Array.isArray(raw)) return raw.map(v => String(v || '').trim()).filter(Boolean);
      if (!raw) return [];
      return String(raw)
        .split(/[;,\n]/g)
        .map(v => v.trim())
        .filter(Boolean);
    }

    /**
     * Returns the first non-empty value from an array of candidates.
     * Skips null, undefined, and whitespace-only strings.
     * 
     * @param {any[]} values - Array of values to check
     * @returns {string} First non-empty value, or empty string if none found
     * 
     * @example
     * firstNonEmpty(['', null, '  ', 'found', 'second']);
     * // Returns: 'found'
     */
    function firstNonEmpty(values = []) {
      for (const value of values) {
        if (value === undefined || value === null) continue;
        const txt = String(value).trim();
        if (txt) return txt;
      }
      return '';
    }

    /**
     * Safely converts any value to a trimmed string with fallback support.
     * Returns fallback if value is null, undefined, or empty after trimming.
     * 
     * @param {any} value - Value to convert
     * @param {string} [fallback=''] - Fallback value if conversion results in empty string
     * @returns {string} Converted and trimmed text or fallback
     * 
     * @example
     * safeText(null, 'default'); // Returns: 'default'
     * safeText('  hello  '); // Returns: 'hello'
     */
    function safeText(value, fallback = '') {
      const txt = value === undefined || value === null ? '' : String(value).trim();
      return txt || fallback;
    }

    /**
     * Escapes HTML special characters in a string for safe embedding in HTML.
     * Converts &, <, >, ", and ' to their HTML entity equivalents.
     * 
     * @param {any} value - Value to escape
     * @returns {string} HTML-escaped string
     * 
     * @example
     * htmlEscape('<script>alert("xss")</script>');
     * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
     */
    function htmlEscape(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    /**
     * Resolves an asset image URL, providing a default if empty.
     * Returns the EITEL brand logo as fallback for missing or empty URLs.
     * 
     * @param {string|null|undefined} rawImageUrl - Raw image URL from asset metadata
     * @returns {string} Valid image URL or default EITEL logo path
     * 
     * @example
     * resolveAssetImageUrl(''); // Returns: 'assets/eitel-logo-brand.png'
     * resolveAssetImageUrl('https://example.com/logo.png'); // Returns provided URL
     */
    function resolveAssetImageUrl(rawImageUrl) {
      const candidate = String(rawImageUrl || '').trim();
      if (candidate) return candidate;
      return 'assets/eitel-logo-brand.png';
    }

    /**
     * Checks if an image URL is the default EITEL brand logo.
     * Performs case-insensitive comparison with known default paths.
     * 
     * @param {string|null|undefined} imageUrl - Image URL to check
     * @returns {boolean} True if URL matches default EITEL logo path
     * 
     * @example
     * isDefaultAssetImage('assets/eitel-logo-brand.png'); // Returns: true
     * isDefaultAssetImage('https://example.com/logo.png'); // Returns: false
     */
    function isDefaultAssetImage(imageUrl) {
      const txt = String(imageUrl || '').trim().toLowerCase();
      return txt.endsWith('/assets/eitel-logo-brand.png') || txt === 'assets/eitel-logo-brand.png';
    }

    /**
     * Formats a connector name for display in UI.
     * Recognizes known connectors (UC3M, FUENLABRADA) and formats accordingly.
     * 
     * @param {string|null|undefined} rawConnector - Raw connector identifier
     * @returns {string} Formatted connector label in uppercase
     * 
     * @example
     * prettyConnectorLabel('conectoruc3m'); // Returns: 'UC3M'
     * prettyConnectorLabel('conectorFuenlabrada'); // Returns: 'FUENLABRADA'
     * prettyConnectorLabel('unknown'); // Returns: 'UNKNOWN'
     */
    function prettyConnectorLabel(rawConnector) {
      const txt = String(rawConnector || '').trim();
      if (!txt) return 'CONNECTOR';
      const lower = txt.toLowerCase();
      if (lower.includes('uc3m')) return 'UC3M';
      if (lower.includes('fuenlabrada')) return 'FUENLABRADA';
      return txt.replace(/^conector/i, '').trim().toUpperCase() || 'CONNECTOR';
    }

    /**
     * Extracts standardized metadata from a dataset object.
     * Handles multiple metadata formats (DublinCore, EDC, EITEL properties) and consolidates keywords.
     * 
     * @param {Object} dataset - Dataset object containing metadata properties
     * @returns {Object} Standardized metadata object with title, description, imageUrl, and keywords
     * @returns {string} returns.title - Dataset title
     * @returns {string} returns.description - Dataset description
     * @returns {string} returns.imageUrl - Image/icon URL
     * @returns {string[]} returns.keywords - Array of unique keywords
     * 
     * @example
     * const metadata = extractDatasetMetadata(dataset);
     * console.log(metadata.title, metadata.description, metadata.keywords);
     */
    function extractDatasetMetadata(dataset) {
      const d = dataset || {};
      const props = d?.properties || d?.['dct:properties'] || d?.['edc:properties'] || {};

      const title = firstNonEmpty([
        d?.['dct:title'],
        d?.title,
        d?.name,
        props?.['dct:title'],
        props?.title,
        props?.name,
      ]);
      const description = firstNonEmpty([
        d?.['dct:description'],
        d?.description,
        props?.['dct:description'],
        props?.description,
        props?.['eitel:description'],
      ]);
      const imageUrl = firstNonEmpty([
        d?.['schema:image'],
        d?.image,
        props?.['schema:image'],
        props?.['eitel:image'],
        props?.image,
      ]);

      const keywords = [
        ...parseKeywordList(d?.['dcat:keyword']),
        ...parseKeywordList(d?.keyword),
        ...parseKeywordList(props?.['dcat:keyword']),
        ...parseKeywordList(props?.['eitel:keywords']),
        ...parseKeywordList(props?.keywords),
      ];

      return {
        title,
        description,
        imageUrl,
        keywords: [...new Set(keywords)],
      };
    }

    /**
     * Builds a complete DublinCore JSON-LD representation of a policy.
     * Formats policy information according to W3C standards with ODRL and EITEL namespaces.
     * 
     * @param {Object} row - Policy row containing asset and policy information
     * @param {string} row.assetId - Asset identifier
     * @param {string} row.assetTitle - Human-readable asset title
     * @param {string} row.assetDescription - Asset description text
     * @param {string[]} row.assetKeywords - Array of keywords
     * @param {string} row.connectorId - Connector identifier
     * @param {string} row.counterPartyAddress - Counter-party connector address
     * @param {Object} row.policyRaw - Raw ODRL policy object
     * @returns {string} JSON-LD formatted policy representation
     * 
     * @example
     * const jsonLd = buildPolicyDcatJsonLd(policyRow);
     * console.log(JSON.parse(jsonLd));
     */
    function buildPolicyDcatJsonLd(row) {
      const payload = {
        '@context': {
          dcat: 'https://www.w3.org/ns/dcat#',
          dct: 'http://purl.org/dc/terms/',
          odrl: 'http://www.w3.org/ns/odrl/2/',
          eitel: 'https://w3id.org/eitel/ns/'
        },
        '@type': 'dcat:Dataset',
        '@id': row?.assetId || '',
        'dct:title': row?.assetTitle || clean(row?.assetId || ''),
        'dct:description': row?.assetDescription || '',
        'dcat:keyword': Array.isArray(row?.assetKeywords) ? row.assetKeywords : [],
        'eitel:connectorId': row?.connectorId || '',
        'eitel:connectorAddress': row?.counterPartyAddress || '',
        'odrl:hasPolicy': row?.policyRaw || {},
      };
      return JSON.stringify(payload, null, 2);
    }

    /**
     * Parses connector candidates from UI inputs.
     * Extracts connector identifiers from textarea and single input fields,
     * normalizes them, and provides sensible defaults.
     * 
     * @returns {string[]} Array of unique connector URLs or identifiers
     * 
     * @example
     * const connectors = parseConnectorCandidates();
     * // Returns: ['conectoruc3m', 'conectorFuenlabrada', ...]
     */
    function parseConnectorCandidates() {
      const listRaw = document.getElementById('catalogConnectorsList')?.value || '';
      const values = listRaw
        .split(/[\n,;]+/g)
        .map(v => String(v || '').trim())
        .filter(Boolean)
        .map(v => {
          if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/')) return v;
          return canonicalConnectorPrefix(v) || v;
        });
      const single = String(document.getElementById('searchConnectorId')?.value || '').trim();
      if (single) values.unshift(canonicalConnectorPrefix(single) || single);
      if (!values.length) {
        const configuredList = String(cfg.connectorCatalogList || '').trim();
        if (configuredList) {
          configuredList.split(/[\n,;]+/g)
            .map(v => String(v || '').trim())
            .filter(Boolean)
            .forEach(v => values.push(canonicalConnectorPrefix(v) || v));
        }
      }
      if (!values.length) values.push('conectoruc3m', 'conectorFuenlabrada');
      return [...new Set(values)];
    }

    /**
     * Resolves the public origin URL for the connector.
     * Uses DSP URL config if available, fallback to current window location.
     * 
     * @returns {string} Public origin URL (e.g., 'https://example.com')
     * 
     * @example
     * const origin = getPublicConnectorOrigin();
     * // Returns: 'http://localhost:3000' or configured DSP origin
     */
    function getPublicConnectorOrigin() {
      try {
        const cfgDsp = String(cfg?.dspUrl || '').trim();
        if (cfgDsp.startsWith('http://') || cfgDsp.startsWith('https://')) {
          return new URL(cfgDsp).origin;
        }
      } catch {}
      return window.location.origin;
    }

    let transferStartInFlight = false;
    const _remoteLocalDownloadInFlightByContract = new Set();
    const localTransferStorageKey = `eitel.ui.localTransfers.${connectorName}`;
    const hiddenTransferStorageKey = `eitel.ui.hiddenTransfers.${connectorName}`;
    const localAssetBundleStorageKey = `eitel.ui.assetBundles.${connectorName}`;
    const arcgisTokenExpiresStorageKey = 'eitel.arcgis.access_token_expires';
    const agreementSourceHints = new Map();
    let arcgisTokenUiTimer = null;

    /**
     * Normalizes transfer state codes to human-readable state names.
     * Maps numeric codes to standard EDC transfer state strings.
     * 
     * @param {string|number|null|undefined} raw - Raw state code
     * @returns {string} Normalized state name (e.g., 'INITIAL', 'COMPLETED') or raw value if unmapped
     * 
     * @example
     * normalizeTransferState('700'); // Returns: 'COMPLETED'
     * normalizeTransferState('500'); // Returns: 'STARTED'
     */
    function normalizeTransferState(raw) {
      if (raw === undefined || raw === null) return '-';
      const txt = String(raw).trim();
      const numericMap = {
        '100': 'INITIAL',
        '200': 'PROVISIONING',
        '300': 'PROVISIONED',
        '400': 'REQUESTED',
        '500': 'STARTED',
        '600': 'SUSPENDED',
        '700': 'COMPLETED',
        '800': 'TERMINATED',
      };
      return numericMap[txt] || txt;
    }

    /**
     * Checks if a transfer state represents a terminal state.
     * Terminal states indicate transfer is no longer in progress.
     * 
     * @param {string|number} state - Transfer state to check
     * @returns {boolean} True if state is COMPLETED, TERMINATED, or FAILED
     * 
     * @example
     * isTransferTerminalState('700'); // Returns: true (COMPLETED)
     * isTransferTerminalState('500'); // Returns: false (STARTED)
     */
    function isTransferTerminalState(state) {
      const normalized = normalizeTransferState(state);
      return normalized === 'COMPLETED' || normalized === 'TERMINATED' || normalized === 'FAILED';
    }

    /**
     * Retrieves locally stored transfer records from browser storage.
     * Handles JSON parsing errors gracefully by returning empty array.
     * 
     * @returns {Object[]} Array of local transfer record objects
     * 
     * @example
     * const transfers = getLocalTransferRecords();
     * console.log(transfers.length); // Number of stored transfers
     */
    function getLocalTransferRecords() {
      try {
        const raw = localStorage.getItem(localTransferStorageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    /**
     * Saves transfer records to browser local storage.
     * Limits storage to 200 most recent records to prevent bloat.
     * 
     * @param {Object[]} records - Array of transfer records to save
     * 
     * @example
     * saveLocalTransferRecords([{id: '123', status: 'completed'}, ...]);
     */
    function saveLocalTransferRecords(records) {
      try {
        localStorage.setItem(localTransferStorageKey, JSON.stringify(records.slice(0, 200)));
      } catch {}
    }

    /**
     * Adds a single transfer record to local storage.
     * Retrieves current records, appends new one, and saves back.
     * 
     * @param {Object} record - Transfer record to add
     * 
     * @example
     * addLocalTransferRecord({id: 'new-transfer-123', status: 'active'});
     */
    function addLocalTransferRecord(record) {
      const current = getLocalTransferRecords();
      current.unshift(record);
      saveLocalTransferRecords(current);
      return record;
    }

    /**
     * Retrieves IDs of transfers hidden by user in UI.
     * Hidden transfers are tracked locally but not displayed to user.
     * 
     * @returns {string[]} Array of hidden transfer IDs
     * 
     * @example
     * const hiddenIds = getHiddenTransferIds();
     */
    function getHiddenTransferIds() {
      try {
        const raw = localStorage.getItem(hiddenTransferStorageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        return [];
      }
    }

    /**
     * Saves a set of transfer IDs to be hidden from UI.
     * 
     * @param {string[]} ids - Array of transfer IDs to hide
     * 
     * @example
     * saveHiddenTransferIds(['transfer-1', 'transfer-2']);
     */
    function saveHiddenTransferIds(ids) {
      try {
        const unique = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean))).slice(-500);
        localStorage.setItem(hiddenTransferStorageKey, JSON.stringify(unique));
      } catch {}
    }

    /**
     * Removes a transfer record from local storage by ID.
     * 
     * @param {string} transferId - ID of transfer record to delete
     * 
     * @example
     * removeLocalTransferRecordById('transfer-123');
     */
    function removeLocalTransferRecordById(transferId) {
      const current = getLocalTransferRecords();
      const next = current.filter(t => (t['@id'] || t.id || '') !== transferId);
      saveLocalTransferRecords(next);
      return next.length !== current.length;
    }

    /**
     * Hides a transfer record from UI by adding its ID to hidden set.
     * Record remains in storage but is not displayed to user.
     * 
     * @param {string} transferId - ID of transfer to hide
     * 
     * @example
     * hideTransferRecordById('transfer-123');
     */
    function hideTransferRecordById(transferId) {
      const hidden = getHiddenTransferIds();
      if (!hidden.includes(transferId)) hidden.push(transferId);
      saveHiddenTransferIds(hidden);
    }

    /**
     * Builds a standardized local transfer record from transfer result.
     * Normalizes contract and transfer identifiers, extracts metadata from result.
     * 
     * @param {Object} result - Transfer result from EDC connector
     * @returns {Object} Normalized transfer record for local storage
     * 
     * @example
     * const record = buildLocalTransferRecord(edcTransferResult);
     * console.log(record.transferId, record.state, record.createdAt);
     */
    function buildLocalTransferRecord(result) {
      const status = Number(result?.status || 0);
      const localTransferId = `local-download-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const completed = status >= 200 && status < 300;
      return {
        '@id': localTransferId,
        id: localTransferId,
        state: completed ? 'COMPLETED' : 'FAILED',
        contractId: result?.contractId || '',
        assetId: result?.assetId || '',
        createdAt: new Date().toISOString(),
        transferType: 'LOCAL-DOWNLOAD',
        destinationType: 'browser-download',
        filename: result?.filename || '',
        bytes: Number(result?.bytes || 0),
        sourceUrl: result?.sourceUrl || '',
        contentType: result?.contentType || '',
        errorDetail: result?.error || result?.detail || '',
        detail: result,
        localDownload: true,
      };
    }

    /**
     * Normalizes a transfer row for display, extracting common properties.
     * Maps various property name formats to standard output format.
     * 
     * @param {Object} row - Transfer row object from API
     * @returns {Object} Normalized transfer object with standard properties
     * 
     * @example
     * const normalized = normalizeTransferRow(apiTransferRow);
     * console.log(normalized.transferId, normalized.state, normalized.createdAt);
     */
    function normalizeTransferRow(row) {
      const id = row['@id'] || row.id || '';
      const createdAt = row.createdAt || row['edc:createdAt'] || row.startedAt || row['edc:startedAt'] || '';
      return {
        ...row,
        '@id': id,
        id,
        state: row.state || row['edc:state'] || '-',
        contractId: row.contractId || row['edc:contractId'] || '',
        createdAt,
        localDownload: Boolean(row.localDownload),
      };
    }

    /**
     * Aggregates all transfer rows from local storage and remote API.
     * Merges local and remote transfers, filters hidden ones, and returns consolidated list.
     * 
     * @param {Object[]} [remoteRows=[]] - Transfer rows from remote API
     * @returns {Object[]} Consolidated array of all transfer rows (local + remote)
     * 
     * @example
     * const allTransfers = getAllTransferRows(apiTransfers);
     * console.log(allTransfers.length); // Total transfers visible
     */
    function getAllTransferRows(remoteRows = []) {
      const localRows = getLocalTransferRecords().map(normalizeTransferRow);
      const normalizedRemote = (Array.isArray(remoteRows) ? remoteRows : []).map(normalizeTransferRow);
      const hidden = new Set(getHiddenTransferIds());
      return [...localRows, ...normalizedRemote]
      .filter(r => !hidden.has(r['@id'] || r.id || ''))
      .sort((a, b) => {
        const aTime = Date.parse(a.createdAt || 0) || 0;
        const bTime = Date.parse(b.createdAt || 0) || 0;
        return bTime - aTime;
      });
    }

    /**
     * Gets the UI prefix path from the management API URL.
     * Extracts path segment from configured management API to determine routing prefix.
     * 
     * @returns {string} UI prefix path for routing (e.g., '/conectoruc3m')
     * 
     * @example
     * const prefix = getUiPrefixPath();
     * // Returns: '/conectoruc3m' if API is at '/conectoruc3m/api/management'
     */
    function getUiPrefixPath() {
      const parts = (window.location.pathname || '/').split('/').filter(Boolean);
      const first = String(parts[0] || '').trim();
      if (first.toLowerCase().startsWith('conector')) return `/${first}/`;

      const fromConfig = canonicalConnectorPrefix(cfg?.connectorName || '');
      if (fromConfig) return `/${fromConfig}/`;

      const fallback = canonicalConnectorPrefix(PROD_CONNECTOR_ID || 'conectoruc3m') || 'conectoruc3m';
      return `/${fallback}/`;
    }

    /**
     * Gets the base URL for local assets API from configuration.
     * Constructs URL using current window origin and connector prefix.
     * 
     * @returns {string} Base URL for local assets API
     * 
     * @example
     * const baseUrl = getLocalAssetsApiBaseUrl();
     * // Returns: 'http://localhost:3000/conectoruc3m/local-assets'
     */
    function getLocalAssetsApiBaseUrl() {
      const prefix = getUiPrefixPath().replace(/\/+$/, '');
      return `${window.location.origin}${prefix}/local-assets`;
    }

    /**
     * Extracts connector prefix from the management API URL.
     * Identifies which connector this UI is managing (e.g., 'conectoruc3m').
     * 
     * @returns {string} Connector prefix identifier
     * 
     * @example
     * const prefix = getConnectorPrefixFromManagementApiUrl();
     * // Returns: 'conectoruc3m' if API is at '/conectoruc3m/api/management'
     */
    function getConnectorPrefixFromManagementApiUrl() {
      const apiBase = String(getApiBaseUrl() || '').trim();
      if (!apiBase) return '';
      try {
        const url = apiBase.startsWith('http://') || apiBase.startsWith('https://')
          ? new URL(apiBase)
          : new URL(apiBase, window.location.origin);
        const parts = (url.pathname || '').split('/').filter(Boolean);
        if (parts.length >= 3 && String(parts[1]).toLowerCase() === 'api' && String(parts[2]).toLowerCase() === 'management') {
          const prefix = String(parts[0] || '').trim();
          if (prefix.toLowerCase().startsWith('conector')) return prefix;
        }
      } catch {}
      return '';
    }

    /**
     * Gets candidate base URLs for local assets API with fallback routing.
     * Tries multiple URL patterns to support different deployment scenarios.
     * 
     * @returns {string[]} Array of candidate base URLs in priority order
     * 
     * @example
     * const candidates = getLocalAssetsApiBaseUrlCandidates();
     * // Returns: ['http://localhost:3000/...', 'http://localhost/...', ...]
     */
    function getLocalAssetsApiBaseUrlCandidates() {
      const candidates = [];
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname.startsWith('127.');
      const hasConnectorPrefixInPath = (window.location.pathname || '/').toLowerCase().split('/').filter(Boolean)[0]?.startsWith('conector');
      const pushIfValid = (value) => {
        const txt = String(value || '').trim();
        if (!txt) return;
        if (!candidates.includes(txt)) candidates.push(txt);
      };

      pushIfValid(getLocalAssetsApiBaseUrl());

      const fromApiBase = getConnectorPrefixFromManagementApiUrl();
      if (fromApiBase) {
        pushIfValid(`${window.location.origin}/${fromApiBase}/local-assets`);
      }

      const configuredPrefix = canonicalConnectorPrefix(cfg?.connectorName || '');
      if (configuredPrefix) {
        pushIfValid(`${window.location.origin}/${configuredPrefix}/local-assets`);
        pushIfValid(`${window.location.origin}/${configuredPrefix.toLowerCase()}/local-assets`);
      }

      // Compatibilidad: algunos despliegues publican local-assets en raíz.
      // Evitar este fallback cuando la UI ya está bajo un prefijo /conector*,
      // porque en producción suele devolver páginas 404/ArcGIS engañosas.
      if (isLocalHost || !hasConnectorPrefixInPath) {
        pushIfValid(`${window.location.origin}/local-assets`);
      }

      // Fallbacks explícitos para entornos mixtos UC3M/Fuenlabrada.
      // Priorizar estos fallbacks solo en entorno local/dev.
      if (isLocalHost) {
        pushIfValid(`${window.location.origin}/conectoruc3m/local-assets`);
        pushIfValid(`${window.location.origin}/conectorFuenlabrada/local-assets`);
        pushIfValid(`${window.location.origin}/conectorfuenlabrada/local-assets`);
      }

      return candidates;
    }

    /**
     * Prioritizes healthy local asset API candidates by performing health checks.
     * Sorts candidates into healthy and unhealthy groups based on /health endpoint responses.
     * Healthy candidates are returned first for preference in API calls.
     * 
     * @param {string[]} [baseCandidates=[]] - Array of candidate base URLs to check
     * @returns {Promise<string[]>} Sorted array with healthy candidates first
     * 
     * @example
     * const prioritized = await prioritizeHealthyLocalAssetsCandidates(candidates);
     */
    async function prioritizeHealthyLocalAssetsCandidates(baseCandidates = []) {
      const normalized = Array.isArray(baseCandidates) ? [...new Set(baseCandidates.filter(Boolean))] : [];
      if (normalized.length <= 1) return normalized;

      const healthy = [];
      const unhealthy = [];
      for (const base of normalized) {
        const healthUrl = String(base).replace(/\/local-assets\/?$/i, '/health');
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2500);
          const response = await fetch(healthUrl, {
            method: 'GET',
            signal: controller.signal,
            cache: 'no-store',
            credentials: 'include',
          });
          clearTimeout(timer);
          if (response.ok) {
            healthy.push(base);
          } else {
            unhealthy.push(base);
          }
        } catch {
          unhealthy.push(base);
        }
      }

      return [...healthy, ...unhealthy];
    }

    /**
     * Retrieves asset bundle backups from local storage.
     * Asset bundles contain complete asset definitions for offline access and cached editing.
     * 
     * @returns {Object[]} Array of asset bundle backup objects
     * 
     * @example
     * const bundles = getAssetBundleBackups();
     */
    function getAssetBundleBackups() {
      try {
        const raw = localStorage.getItem(localAssetBundleStorageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    /**
     * Makes authenticated API calls to local assets service.
     * Handles request/response formatting and error management for asset operations.
     * 
     * @async
     * @param {string} method - HTTP method ('GET', 'POST', 'PUT', 'DELETE')
     * @param {string} path - API endpoint path
     * @param {Object} [options={}] - Request options (headers, body, etc.)
     * @returns {Promise<Object>} API response object with status and data
     * 
     * @example
     * const result = await callLocalAssetsApi('POST', '/upload', { body: formData });
     */
    async function callLocalAssetsApi(method, path, options = {}) {
      const candidates = await prioritizeHealthyLocalAssetsCandidates(getLocalAssetsApiBaseUrlCandidates());
      const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
      let lastFailure = null;
      for (const base of candidates) {
        const url = `${base}${normalizedPath}`;
        try {
          const headers = { ...(options.headers || {}) };
          const body = options.body;
          const hasJsonBody = body && typeof body === 'string' && headers['content-type']?.includes('application/json');
          if (body && !headers['content-type'] && typeof body === 'string') headers['content-type'] = 'application/json';
          const response = await fetch(url, {
            method: String(method || 'GET').toUpperCase(),
            headers,
            body,
            credentials: 'include',
            cache: 'no-store',
          });
          const text = await response.text();
          let data = text;
          try { data = JSON.parse(text); } catch {}
          if (response.status >= 200 && response.status < 300) return { status: response.status, data, endpoint: url };
          lastFailure = { status: response.status, data, endpoint: url };
          if (response.status >= 400 && response.status < 500 && !hasJsonBody) continue;
        } catch (error) {
          lastFailure = { status: 0, error: String(error), endpoint: url };
        }
      }
      return lastFailure || { status: 502, error: 'local-assets API no accesible.' };
    }

    /**
     * Lists asset bundle backups stored on server/connector.
     * Retrieves persisted asset definitions from server storage.
     * 
     * @async
     * @returns {Promise<Object[]>} Array of asset bundle objects from server
     * 
     * @example
     * const bundles = await listServerAssetBundleBackups();
     */
    async function listServerAssetBundleBackups() {
      const r = await callLocalAssetsApi('GET', '/asset-bundles');
      if (!(r.status >= 200 && r.status < 300)) return [];
      const rows = Array.isArray(r?.data?.items) ? r.data.items : [];
      return rows.filter(row => row && typeof row === 'object' && row.assetId);
    }

    /**
     * Creates or updates asset bundle backup on server.
     * Persists asset definition to server storage for later retrieval.
     * 
     * @async
     * @param {Object} [partialBundle={}] - Partial bundle data to save
     * @returns {Promise<Object>} Server response with updated bundle info
     * 
     * @example
     * const result = await upsertServerAssetBundleBackup({ assetId, assetBody });
     */
    async function upsertServerAssetBundleBackup(partialBundle = {}) {
      const assetId = String(partialBundle?.assetId || '').trim();
      if (!assetId) return { status: 400 };
      return callLocalAssetsApi('POST', '/asset-bundles', { body: JSON.stringify({ ...partialBundle, assetId }) });
    }

    /**
     * Deletes asset bundle backup from server storage.
     * 
     * @async
     * @param {string} assetId - Asset identifier to delete backup for
     * @returns {Promise<Object>} Server response confirming deletion
     * 
     * @example
     * const result = await deleteServerAssetBundleBackup('asset-123');
     */
    async function deleteServerAssetBundleBackup(assetId) {
      const target = String(assetId || '').trim();
      if (!target) return { status: 400 };
      return callLocalAssetsApi('DELETE', `/asset-bundles/${encodeURIComponent(target)}`);
    }

    /**
     * Saves asset bundle backups to local storage.
     * Maintains up to 300 bundle records for offline editing capability.
     * 
     * @param {Object[]} rows - Array of asset bundle objects to save
     * 
     * @example
     * saveAssetBundleBackups([{assetId: 'asset-1', assetName: 'My Asset', ...}]);
     */
    function saveAssetBundleBackups(rows) {
      try {
        const safeRows = Array.isArray(rows) ? rows.slice(0, 120) : [];
        localStorage.setItem(localAssetBundleStorageKey, JSON.stringify(safeRows));
      } catch {}
    }

    /**
     * Creates or updates an asset bundle backup in local storage.
     * Merges partial bundle data with existing record or creates new entry.
     * 
     * @param {Object} [partialBundle={}] - Partial asset bundle data to merge
     * @param {string} partialBundle.assetId - Asset identifier (required for merge)
     * 
     * @example
     * upsertAssetBundleBackup({
     *   assetId: 'asset-123',
     *   assetName: 'Updated Name',
     *   assetBody: {...}
     * });
     */
    function upsertAssetBundleBackup(partialBundle = {}) {
      const assetId = String(partialBundle?.assetId || '').trim();
      if (!assetId) return;
      const existing = getAssetBundleBackups();
      const idx = existing.findIndex(row => String(row?.assetId || '') === assetId);
      const merged = {
        ...(idx >= 0 ? existing[idx] : {}),
        ...partialBundle,
        assetId,
        updatedAt: new Date().toISOString(),
      };
      if (idx >= 0) existing.splice(idx, 1);
      existing.unshift(merged);
      saveAssetBundleBackups(existing);
      upsertServerAssetBundleBackup(merged).catch(() => {});
    }

    /**
     * Removes an asset bundle backup from local storage by asset ID.
     * 
     * @param {string} assetId - Asset identifier to remove backup for
     * 
     * @example
     * removeAssetBundleBackup('asset-123');
     */
    function removeAssetBundleBackup(assetId) {
      const target = String(assetId || '').trim();
      if (!target) return;
      const next = getAssetBundleBackups().filter(row => String(row?.assetId || '') !== target);
      saveAssetBundleBackups(next);
      deleteServerAssetBundleBackup(target).catch(() => {});
    }

    /**
     * Retrieves stored ArcGIS access token expiration time from local storage.
     * Returns current timestamp if no expiration time was previously saved.
     * 
     * @returns {number} ArcGIS token expiration timestamp in milliseconds
     * 
     * @example
     * const expiresAt = getStoredArcgisTokenExpiresAt();
     */
    function getStoredArcgisTokenExpiresAt() {
      try {
        const raw = sessionStorage.getItem(arcgisTokenExpiresStorageKey) || '';
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) return 0;
        return parsed;
      } catch {
        return 0;
      }
    }

    /**
     * Stores ArcGIS access token expiration time in local storage.
     * 
     * @param {number} expiresAtMs - Token expiration timestamp in milliseconds
     * 
     * @example
     * setStoredArcgisTokenExpiresAt(Date.now() + 3600000); // 1 hour from now
     */
    function setStoredArcgisTokenExpiresAt(expiresAtMs) {
      try {
        const parsed = Number(expiresAtMs || 0);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          sessionStorage.removeItem(arcgisTokenExpiresStorageKey);
          return;
        }
        sessionStorage.setItem(arcgisTokenExpiresStorageKey, String(Math.floor(parsed)));
      } catch {}
    }

    /**
     * Formats milliseconds as human-readable time remaining.
     * Returns negative values with absolute time if already expired.
     * 
     * @param {number} ms - Milliseconds to format
     * @returns {string} Human-readable time string (e.g., '59m 30s', 'expired for 5m 20s')
     * 
     * @example
     * formatRemainingTimeMs(3661000); // Returns: '1h 1m 1s'
     * formatRemainingTimeMs(-300000); // Returns: 'expired for 5m'
     */
    function formatRemainingTimeMs(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      if (h > 0) return `${h}h ${m}m`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    }

    /**
     * Refreshes UI indicator showing ArcGIS token expiration status.
     * Updates visual feedback based on remaining time until token expiration.
     * 
     * @example
     * refreshArcgisTokenIndicator(); // Updates UI with current token status
     */
    function refreshArcgisTokenIndicator() {
      const widget = document.getElementById('arcgisTokenWidget');
      const value = document.getElementById('arcgisTokenRemaining');
      if (!widget || !value) return;

      const enabled = Boolean(arcgis?.enabled);
      widget.style.display = enabled ? 'inline-flex' : 'none';
      if (!enabled) return;

      const token = getArcgisAccessTokenForPublish();
      const expiresAt = getStoredArcgisTokenExpiresAt();
      const remainingMs = expiresAt ? (expiresAt - Date.now()) : 0;
      value.classList.remove('warn', 'danger');

      if (!token) {
        value.textContent = 'sin token';
        value.classList.add('danger');
        try { refreshArcgisPublishAssist(); } catch {}
        try { refreshStarTrustPanel(); } catch {}
        return;
      }
      if (!expiresAt) {
        value.textContent = 'token activo';
        try { refreshArcgisPublishAssist(); } catch {}
        try { refreshStarTrustPanel(); } catch {}
        return;
      }
      if (remainingMs <= 0) {
        value.textContent = 'expirado';
        value.classList.add('danger');
        try { refreshArcgisPublishAssist(); } catch {}
        try { refreshStarTrustPanel(); } catch {}
        return;
      }

      value.textContent = formatRemainingTimeMs(remainingMs);
      if (remainingMs < 5 * 60 * 1000) {
        value.classList.add('danger');
      } else if (remainingMs < 30 * 60 * 1000) {
        value.classList.add('warn');
      }
      try { refreshArcgisPublishAssist(); } catch {}
      try { refreshStarTrustPanel(); } catch {}
    }

    /**
     * Ensures an interval timer exists for periodic ArcGIS token indicator updates.
     * Creates timer if not already running to keep token expiration display current.
     * 
     * @example
     * ensureArcgisTokenIndicatorTimer(); // Starts update timer if needed
     */
    function ensureArcgisTokenIndicatorTimer() {
      if (arcgisTokenUiTimer) return;
      arcgisTokenUiTimer = setInterval(() => {
        try { refreshArcgisTokenIndicator(); } catch {}
      }, 1000);
    }

    /**
     * Automatically detects and fixes the API base URL configuration.
     * Attempts to resolve correct API URL through various detection methods,
     * with fallback to manual user input if automatic detection fails.
     * Updates UI with detected configuration and displays status messages.
     * 
     * @returns {Promise<string>} Resolved API base URL
     * 
     * @example
     * const apiUrl = await getAutoFixedApiBaseUrl();
     * console.log('API configured at:', apiUrl);
     */
    function getAutoFixedApiBaseUrl() {
      const current = String(getApiBaseUrl() || '').trim();
      if (!current) return '';
      if (current.includes('/api/management')) return current;
      if (!current.endsWith('/management')) return '';
      if (cfg?.managementApiUrl && String(cfg.managementApiUrl).includes('/api/management')) {
        return String(cfg.managementApiUrl).trim().replace(/\/+$/, '');
      }
      try {
        const url = new URL(current, window.location.origin);
        const prefix = getUiPrefixPath();
        return `${url.origin}${prefix}api/management`;
      } catch {
        return '';
      }
    }

    /**
     * Makes authenticated API calls to EDC Management API.
     * Handles request formatting, authentication headers, and response parsing.
     * Supports optional output logging to console panel for debugging.
     * 
     * @async
     * @param {string} method - HTTP method ('GET', 'POST', 'PUT', 'DELETE')
     * @param {string} path - API endpoint path (e.g., '/v3/assets')
     * @param {string|Object} body - Request body (JSON string or object)
     * @param {Object} [options={}] - Additional options (silent, retries, etc.)
     * @returns {Promise<Object>} API response with status and data properties
     * 
     * @example
     * const result = await callApi('POST', '/v3/assets', assetJson);
     */
    async function callApi(method, path, body, options = {}) {
      const retries = Number.isFinite(Number(options.retries)) ? Number(options.retries) : Number(settings.apiRetries || 0);
      const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : Number(settings.apiTimeoutMs || 15000);
      const silent = Boolean(options.silent);
      const normalizedMethod = String(method || 'GET').toUpperCase();
      const allowRetry = options.retryUnsafe === true || normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'DELETE';
      const effectiveRetries = allowRetry ? retries : 0;
      let attempt = 0;
      let lastError = null;

      while (attempt <= effectiveRetries) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          let primaryBase = String(getApiBaseUrl() || '').trim();
          // Hard fix for common wrong base persisted in settings: .../management -> .../<prefix>/api/management
          if (/\/management\/?$/i.test(primaryBase) && !/\/api\/management\/?$/i.test(primaryBase)) {
            const forcedBase = getAutoFixedApiBaseUrl();
            if (forcedBase) primaryBase = forcedBase;
          }
          const primaryUrl = `${primaryBase}${path}`;
          let res = await fetch(primaryUrl, {
            method,
            headers: {
              'x-api-key': getApiKey(),
              'content-type': 'application/json',
              ...(options.headers || {}),
            },
            body: method === 'GET' || method === 'DELETE' ? undefined : body,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          let text = await res.text();

          // Some deployments return 502 on one connector-prefix variant; try alternates for catalog calls.
          if (res.status === 502 && path === '/v3/catalog/request' && !options.noAutoBaseFallback) {
            const candidates = [];
            const fixed = getAutoFixedApiBaseUrl();
            if (fixed) candidates.push(fixed);
            if (primaryBase.includes('/conectorFuenlabrada/')) candidates.push(primaryBase.replace('/conectorFuenlabrada/', '/conectorfuenlabrada/'));
            if (primaryBase.includes('/conectorfuenlabrada/')) candidates.push(primaryBase.replace('/conectorfuenlabrada/', '/conectorFuenlabrada/'));
            const uiPrefix = getUiPrefixPath().replace(/\/+$/, '');
            if (uiPrefix) candidates.push(`${window.location.origin}${uiPrefix}/api/management`);

            for (const candidateBase of [...new Set(candidates)].filter(x => x && x !== primaryBase)) {
              try {
                const fallbackUrl = `${candidateBase}${path}`;
                const fallbackRes = await fetch(fallbackUrl, {
                  method,
                  headers: {
                    'x-api-key': getApiKey(),
                    'content-type': 'application/json',
                    ...(options.headers || {}),
                  },
                  body: method === 'GET' || method === 'DELETE' ? undefined : body,
                  signal: controller.signal,
                });
                const fallbackText = await fallbackRes.text();
                if (fallbackRes.status >= 200 && fallbackRes.status < 300) {
                  res = fallbackRes;
                  text = fallbackText;
                  break;
                }
              } catch {}
            }
          }

          if ((res.status === 404 || res.status === 405) && !options.noAutoBaseFallback) {
            const fallbackBase = getAutoFixedApiBaseUrl();
            if (fallbackBase && fallbackBase !== primaryBase) {
              const fallbackUrl = `${fallbackBase}${path}`;
              const fallbackRes = await fetch(fallbackUrl, {
                method,
                headers: {
                  'x-api-key': getApiKey(),
                  'content-type': 'application/json',
                  ...(options.headers || {}),
                },
                body: method === 'GET' || method === 'DELETE' ? undefined : body,
                signal: controller.signal,
              });
              const fallbackText = await fallbackRes.text();
              if (fallbackRes.status >= 200 && fallbackRes.status < 300) {
                res = fallbackRes;
                text = fallbackText;
              }
            }
          }

          let data = text;
          try { data = JSON.parse(text); } catch {}
          const result = { status: res.status, data, attempt };
          if (res.status >= 500 && attempt < effectiveRetries) {
            attempt++;
            await new Promise(resolve => setTimeout(resolve, 250 * attempt));
            continue;
          }
          return result;
        } catch (e) {
          clearTimeout(timeout);
          lastError = e;
          if (attempt < effectiveRetries) {
            attempt++;
            await new Promise(resolve => setTimeout(resolve, 250 * attempt));
            continue;
          }
        }
      }

      const err = {
        status: 0,
        error: String(lastError || 'Error HTTP desconocido'),
        method,
        path,
        hint: 'Revisa managementApiUrl/config.js y proxy reverse para evitar CORS/preflight fallidos.'
      };
      if (!silent) writeOut(err);
      return err;
    }

    /**
     * Updates UI status indicator for vault secrets configuration.
     * Displays current state of secrets availability (configured/missing).
     * Updates visual feedback and info messages in the console.
     * 
     * @param {string} kind - Type of secret ('client-id', 'client-secret', etc.)
     * @param {string} message - Status message to display
     * 
     * @example
     * updateSecretsStatus('oauth2', 'Client credentials configured');
     */
    function updateSecretsStatus(kind, message) {
      const el = document.getElementById('secretsStatus');
      if (!el) return;
      el.className = `status-pill ${kind}`;
      el.textContent = message;
    }

    /**
     * Discovers available secrets from vault API.
     * Queries vault service to list available secret keys for authentication.
     * Optionally logs results to console for debugging.
     * 
     * @async
     * @param {boolean} [showOutput=false] - Whether to log results to console
     * @returns {Promise<string[]>} Array of available secret names/keys
     * 
     * @example
     * const secrets = await discoverSecretsApi(true); // Show results in console
     */
    async function discoverSecretsApi(showOutput = false) {
      const candidates = [
        { method: 'POST', path: '/v3/secrets/request', body: q(), parser: (r) => unwrap(r).map(s => s['@id'] || s.id).filter(Boolean) },
        { method: 'POST', path: '/v3/secret/request', body: q(), parser: (r) => unwrap(r).map(s => s['@id'] || s.id).filter(Boolean) },
        { method: 'GET', path: '/v3/secrets', body: undefined, parser: (r) => {
          const raw = Array.isArray(r?.data) ? r.data : (Array.isArray(r?.data?.content) ? r.data.content : []);
          return raw.map(s => s?.['@id'] || s?.id || s?.key || s?.name).filter(Boolean);
        } },
      ];

      for (const c of candidates) {
        const resp = await callApi(c.method, c.path, c.body, { silent: true, retries: 0 });
        if (resp.status >= 200 && resp.status < 300) {
          state.secretsApi = c;
          state.secretsAvailable = true;
          state.secretNames = c.parser(resp);
          refreshSecretSelect();
          updateSecretsStatus('ok', `Secrets API activa: ${c.method} ${c.path}`);
          const outSecrets = document.getElementById('secretsOut');
          if (outSecrets) outSecrets.textContent = JSON.stringify(resp.data, null, 2);
          if (showOutput) writeOut({ secretsApi: `${c.method} ${c.path}`, probe: resp });
          return resp;
        }
      }

      state.secretsApi = null;
      state.secretsAvailable = false;
      updateSecretsStatus('danger', 'Secrets API no disponible en este runtime');
      const failure = { status: 404, error: 'No se detecto endpoint de secretos compatible.' };
      if (showOutput) writeOut(failure);
      return failure;
    }

    /**
     * Applies i18n translation overrides from configuration.
     * Merges config language pack into main i18n dictionary.
     * 
     * @example
     * applyI18n(); // Applies any cfg.languagePack overrides
     */
    function applyI18n() {
      document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
      document.getElementById('brandTitle').textContent = settings.language === 'en' ? 'EITEL Connector' : 'Conector EITEL';
      document.getElementById('brandSub').textContent = settings.language === 'en' ? 'Operations console' : 'Consola de operación';
      document.getElementById('consoleTitle').textContent = settings.language === 'en' ? 'Console' : 'Consola';
      applyStaticLanguagePack();
    }

    /**
     * Applies a static language pack from configuration for i18n.
     * Loads and applies language translations defined in cfg.staticLanguagePack.
     * Updates all translatable UI elements with provided language strings.
     * 
     * @example
     * applyStaticLanguagePack(); // Loads translations from cfg configuration
     */
    function applyStaticLanguagePack() {
      const esToEn = {
        'Centro de control': 'Control Center',
        'Publicar': 'Publish',
        'Más': 'More',
        'Catálogo': 'Catalog',
        'Contratos': 'Contracts',
        'Transferencias': 'Transfers',
        'Política': 'Policy',
        'Contrato': 'Contract',
        'Mis assets': 'My assets',
        'Secretos': 'Secrets',
        'Sobre EITEL': 'About EITEL',
        'Actualizar': 'Refresh',
        'Restaurar assets desde backup': 'Restore assets from backup',
        'Assets publicados': 'Published assets',
        'Policies activas': 'Active policies',
        'Contratos vigentes': 'Active contracts',
        'Publicar asset': 'Publish asset',
        'Configura y publica el asset antes de definir política y contrato.': 'Configure and publish the asset before creating policy and contract.',
        'Descripción': 'Description',
        'Keywords (separadas por coma)': 'Keywords (comma-separated)',
        'Foto del asset (archivo local)': 'Asset image (local file)',
        'Origen del asset': 'Asset source',
        'Base URL remota': 'Remote base URL',
        'Archivo local': 'Local file',
        'Autenticación opcional': 'Optional authentication',
        'Ninguna': 'None',
        'Secreto de cliente': 'Client secret',
        'Token temporal': 'Temporary token',
        'Secreto (Vault)': 'Secret (Vault)',
        'Header auth': 'Auth header',
        'Prefijo': 'Prefix',
        'Headers JSON': 'Headers JSON',
        'Borrar': 'Delete',
        'Continuar a Política': 'Continue to Policy',
        'Definir política': 'Define policy',
        'Define condiciones de uso con un formulario simple (sin términos técnicos) o pega JSON-LD si lo necesitas.': 'Define usage conditions with a simple form or paste JSON-LD if needed.',
        'Modo': 'Mode',
        'Formulario': 'Form',
        'Nivel de acceso': 'Access level',
        'Público': 'Public',
        'Publico': 'Public',
        'Crear/Actualizar policy': 'Create/Update policy',
        'Listar policies': 'List policies',
        'Borrar policy': 'Delete policy',
        'Definir contrato': 'Define contract',
        'Aquí se asocia el asset con la policy mediante ContractDefinition.': 'Associate asset and policy through ContractDefinition here.',
        'Crear ContractDefinition': 'Create ContractDefinition',
        'Listar ContractDefinitions': 'List ContractDefinitions',
        'Borrar ContractDefinition': 'Delete ContractDefinition',
        'Catalogo de activos': 'Asset catalog',
        'Consulta activos disponibles, filtra resultados y prepara la contratacion desde esta vista.': 'Browse available assets, filter results, and prepare contracting from this view.',
        'Conector remoto': 'Remote connector',
        'Ver catálogos': 'Load catalogs',
        'Cargar catalogo completo': 'Load full catalog',
        'Busqueda y filtros': 'Search and filters',
        'Buscar activos': 'Search assets',
        'Filtrar por conector': 'Filter by connector',
        'Conector seleccionado': 'Selected connector',
        'URL DSP seleccionada': 'Selected DSP URL',
        'Preparar contrato del asset seleccionado': 'Prepare contract for selected asset',
        'Revisa la politica del activo seleccionado antes de iniciar la contratacion.': 'Review selected asset policy before starting contract request.',
        'Términos de policy seleccionada': 'Selected policy terms',
        'Aceptar los términos y condiciones de uso de la política seleccionada.': 'Accept selected policy terms and conditions.',
        'Realizar contrato': 'Request contract',
        'Modo de salida': 'Output mode',
        'Enviar a URL destino': 'Send to destination URL',
        'Descargar en local': 'Download locally',
        'Subir a ArcGIS': 'Upload to ArcGIS',
        'Dirección partner': 'Partner address',
        'Listar transferencias': 'List transfers',
        'Iniciar transferencia': 'Start transfer',
        'Mis assets publicados en este conector': 'My published assets in this connector',
        'Lista visual de los assets que ya tienes publicados en el runtime actual.': 'Visual list of assets published in the current runtime.',
        'Editar': 'Edit',
        'Guardar': 'Save',
        'Listar': 'List',
        'Mostrar valor': 'Show value',
        'Ocultar valor': 'Hide value',
      };

      const activeMap = settings.language === 'en'
        ? esToEn
        : Object.fromEntries(Object.entries(esToEn).map(([es, en]) => [en, es]));

      const textNodes = document.querySelectorAll('.nav-group-title, h2, h3, p, label, button, option, summary, th');
      textNodes.forEach((el) => {
        const isButton = el.tagName === 'BUTTON';
        const spanInIconButton = isButton ? el.querySelector('svg + span, span') : null;
        const target = isButton && spanInIconButton ? spanInIconButton : el;
        const raw = String(target.textContent || '').trim();
        if (!raw) return;
        const translated = activeMap[raw];
        if (translated) target.textContent = translated;
      });

      const placeholders = {
        'ej: dataset-clima-uc3m': 'e.g. climate-dataset-uc3m',
        'ej: Dataset Clima UC3M': 'e.g. Climate Dataset UC3M',
        'Describe qué datos contiene este asset, su periodicidad y para qué sirve.': 'Describe the data in this asset, its frequency, and intended use.',
        'energia, consumo, municipio, clima': 'energy, consumption, city, climate',
        'Token': 'Token',
        'Filtra por nombre, keyword o descripcion': 'Filter by name, keyword, or description',
      };
      const placeholderMap = settings.language === 'en'
        ? placeholders
        : Object.fromEntries(Object.entries(placeholders).map(([es, en]) => [en, es]));
      document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((el) => {
        const raw = String(el.getAttribute('placeholder') || '').trim();
        if (!raw) return;
        const translated = placeholderMap[raw];
        if (translated) el.setAttribute('placeholder', translated);
      });
    }

    /**
     * Updates console button visibility based on console view state.
     * Toggles buttons display when user hides/shows the console panel.
     * 
     * @param {boolean} [hidden] - Whether console is hidden (auto-detected if omitted)
     * 
     * @example
     * updateConsoleButtons(true); // Hide buttons when console is hidden
     */
    function updateConsoleButtons(hidden = app.classList.contains('console-hidden')) {
      const toggle = document.getElementById('btnConsoleToggle');
      const expand = document.getElementById('btnConsoleExpand');
      const show = document.getElementById('btnConsoleShow');
      toggle.textContent = settings.consolePos === 'bottom' ? '⮟' : '⮞';
      expand.textContent = settings.consoleExpanded ? '⤡' : '⤢';
      show.textContent = settings.consolePos === 'bottom' ? '⮝ Consola' : '⮜ Consola';
      show.style.display = hidden ? 'inline-flex' : 'none';
    }

    /**
     * Shows an information popup modal with formatted content.
     * Displays title and payload data in a modal dialog within console area.
     * Supports various display options and auto-close behavior.
     * 
     * @param {string} title - Popup title
     * @param {string|Object} payload - Content to display (stringified if object)
     * @param {Object} [options={}] - Display options
     * @param {number} [options.autoClose] - Auto-close after milliseconds
     * 
     * @example
     * showInfoPopup('Success', { status: 200, message: 'Created' }, { autoClose: 3000 });
     */
    function showInfoPopup(title, payload, options = {}) {
      document.getElementById('infoTitle').textContent = title || 'Detalle';
      if (options && options.plainText) {
        document.getElementById('infoBody').textContent = typeof payload === 'string' ? payload : String(payload ?? '');
      } else {
        document.getElementById('infoBody').textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      }
      const actionBtn = document.getElementById('btnInfoAction');
      if (options && options.actionLabel && typeof options.onAction === 'function') {
        infoActionHandler = options.onAction;
        actionBtn.textContent = options.actionLabel;
        actionBtn.style.display = 'inline-flex';
      } else {
        infoActionHandler = null;
        actionBtn.style.display = 'none';
      }
      infoModal.classList.add('open');
    }
    /**
     * Closes the information popup modal.
     * Removes popup from DOM and clears its content.
     * 
     * @example
     * closeInfoPopup(); // Hides and removes popup modal
     */
    function closeInfoPopup() {
      infoModal.classList.remove('open');
      infoActionHandler = null;
      const actionBtn = document.getElementById('btnInfoAction');
      actionBtn.style.display = 'none';
    }

    /**
     * Applies UI configuration and initialization settings.
     * Sets up theme, language, layout preferences from stored configuration.
     * Called on page load to restore user preferences.
     * 
     * @example
     * applySettings(); // Restores saved UI configuration
     */
    function applySettings() {
      document.body.dataset.theme = settings.theme;
      app.classList.toggle('console-bottom', settings.consolePos === 'bottom');
      app.classList.toggle('console-expanded', settings.consoleExpanded);
      out.style.fontSize = `${settings.consoleFont}px`;

      document.getElementById('consoleState').textContent = `${settings.consolePos}${settings.consoleExpanded ? ' + expanded' : ''}`;
      document.getElementById('setLanguage').value = settings.language;
      document.getElementById('setTheme').value = settings.theme;
      document.getElementById('setConsolePos').value = settings.consolePos;
      document.getElementById('setConsoleFont').value = String(settings.consoleFont);
      if (document.getElementById('setApiBaseUrl')) document.getElementById('setApiBaseUrl').value = settings.apiBaseUrl;
      if (document.getElementById('setApiKey')) document.getElementById('setApiKey').value = settings.apiKeyOverride;
      if (document.getElementById('setApiTimeout')) document.getElementById('setApiTimeout').value = String(settings.apiTimeoutMs);
      if (document.getElementById('setApiRetries')) document.getElementById('setApiRetries').value = String(settings.apiRetries);
      if (document.getElementById('setDummyUrl')) document.getElementById('setDummyUrl').value = settings.dummyUrl || '';
      applyI18n();
      updateConsoleButtons();
      persistSettings();
    }

    /**
     * Activates a specific view panel in the UI.
     * Hides other views and shows selected one with its content and controls.
     * 
     * @param {string} view - View identifier ('publish', 'contract', 'transfer', 'catalog')
     * 
     * @example
     * activateView('publish'); // Show asset publishing view
     */
    function activateView(view) {
      const resolved = view;
      document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.querySelector(`.nav button[data-view="${view}"]`)?.classList.add('active');
      document.getElementById(`panel-${resolved}`)?.classList.add('active');
        if (resolved === 'catalog') {
          if (state.catalogShowcaseLoaded && Array.isArray(state.catalogRows) && state.catalogRows.length) {
            renderCatalogShowcase(state.catalogRows || []);
          } else {
            loadCatalogShowcase(false);
          }
        }
      if (resolved === 'asset' || resolved === 'my-assets') {
        loadPublishedAssets(false);
      }
      if (resolved === 'secrets') {
        listSecrets(false).then((r) => {
          if (!(r.status >= 200 && r.status < 300)) {
            showInfoPopup('Secretos no disponibles', {
              message: 'No hay endpoint de secrets en runtime y tampoco en almacenamiento local del conector.',
              attempts: ['/v3/secrets/request', '/v3/secret/request', '/v3/secrets', '/local-assets/local-secrets']
            });
          }
        });
      }
    }

    /**
     * Updates asset preview panel with selected asset details.
     * Displays asset metadata, image, and source configuration in preview area.
     * 
     * @example
     * updateAssetPreview(); // Refresh preview with current asset selection
     */
    function updateAssetPreview() {
      const key = slug(document.getElementById('assetKey').value || '');
      document.getElementById('assetIdPreview').value = `asset-${key}`;
      const p = document.getElementById('policyIdPreview');
      const c = document.getElementById('contractDefIdPreview');
      if (p) p.value = `policy-${key}`;
      if (c) c.value = `contractdef-${key}`;
      const assetId = document.getElementById('assetIdPreview').value;
      const policyId = document.getElementById('policyIdPreview').value;
      const contractDefId = document.getElementById('contractDefIdPreview').value;
      const setVal = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
      setVal('policyAssetPreview', assetId);
      setVal('policyIdMirror', policyId);
      setVal('contractDefIdMirror', contractDefId);
      setVal('contractAssetPreview', assetId);
      setVal('contractAccessPolicyId', policyId);
      setVal('contractContractPolicyId', policyId);
    }

    /**
     * Applies policy mode UI configuration.
     * Shows or hides policy-related controls based on current mode.
     * Supports 'restricted' or 'open' policy creation modes.
     * 
     * @example
     * applyPolicyMode(); // Configure policy UI based on app settings
     */
    function applyPolicyMode() {
      const mode = document.getElementById('policyMode')?.value || 'form';
      const form = document.getElementById('policyFormBlock');
      const json = document.getElementById('policyJsonBlock');
      if (!form || !json) return;
      form.style.display = mode === 'jsonld' ? 'none' : 'block';
      json.style.display = mode === 'jsonld' ? 'block' : 'none';
    }

    /**
     * Refreshes catalog asset dropdown options.
     * Fetches latest assets from Management API and updates selection list.
     * Handles errors gracefully by maintaining current options.
     * 
     * @example
     * refreshCatalogAssetOptions(); // Reload available assets for selection
     */
    function refreshCatalogAssetOptions() {
      const sel = document.getElementById('catalogAssetId');
      const terms = document.getElementById('catalogPolicyTerms');
      const policyJsonLd = document.getElementById('catalogPolicyJsonLd');
      const accept = document.getElementById('catalogAcceptTerms');
      if (!sel) return;

      sel.innerHTML = '<option value="">Selecciona un data-offer</option>';
      state.catalogRows.forEach((r, idx) => {
        const o = document.createElement('option');
        o.value = String(idx);
        o.textContent = `${safeText(r.assetTitle, clean(r.assetId))} · ${safeText(r.connectorId, r.assigner || '-')}`;
        sel.appendChild(o);
      });

      if (terms) terms.value = '';
      if (policyJsonLd) policyJsonLd.value = '';
      if (accept) accept.checked = false;
    }

    /**
     * Renders catalog showcase panel with dataset cards.
     * Displays available assets from catalog with metadata and preview.
     * Creates clickable cards for asset selection and browsing.
     * 
     * @param {Object[]} [rows=[]] - Array of dataset/asset objects to display
     * 
     * @example
     * renderCatalogShowcase(datasets); // Display catalog with dataset cards
     */
    function renderCatalogShowcase(rows = []) {
      const wrap = document.getElementById('catalogShowcase');
      if (!wrap) return;
      const query = String(document.getElementById('catalogSearchText')?.value || '').trim().toLowerCase();
      const connectorFilter = String(document.getElementById('catalogFilterConnector')?.value || '').trim().toLowerCase();

      const indexed = state.catalogRows.map((row, idx) => ({ row, idx }));
      const filtered = indexed.filter(({ row }) => {
        if (connectorFilter) {
          const connectorText = String(row.connectorId || row.assigner || '').toLowerCase();
          if (!connectorText.includes(connectorFilter)) return false;
        }
        if (!query) return true;
        const haystack = [
          row.assetTitle,
          row.assetDescription,
          row.assetId,
          row.offerId,
          row.connectorId,
          ...(Array.isArray(row.assetKeywords) ? row.assetKeywords : []),
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      });

      if (!rows.length || !filtered.length) {
        wrap.innerHTML = '<div class="card" style="box-shadow:none"><p class="muted" style="margin:0">No hay assets para mostrar con el filtro actual.</p></div>';
        const contractBox = document.getElementById('catalogContractBox');
        if (contractBox) contractBox.style.display = 'none';
        return;
      }

      wrap.innerHTML = filtered.map(({ row, idx }) => {
        const title = htmlEscape(safeText(row.assetTitle, clean(row.assetId)));
        const connector = htmlEscape(safeText(row.connectorId, row.assigner || '-'));
        const connectorBadge = htmlEscape(prettyConnectorLabel(safeText(row.connectorId, row.assigner || '-')));
        const desc = htmlEscape(safeText(row.assetDescription, 'Sin descripción publicada.'));
        const image = resolveAssetImageUrl(row.assetImageUrl);
        const defaultImageClass = isDefaultAssetImage(image) ? ' is-default' : '';
        const keywords = Array.isArray(row.assetKeywords) ? row.assetKeywords.slice(0, 8) : [];
        const delayMs = Math.min(idx * 55, 550);
        const canContract = Boolean(row.offerId);
        const media = `<div class="asset-card-media${defaultImageClass}"><img src="${htmlEscape(image)}" alt="Imagen del asset ${title}" /><span class="asset-card-badge">${connectorBadge}</span><div class="asset-card-media-overlay"><span class="asset-card-media-title">${title}</span></div></div>`;
        const chips = keywords.length
          ? `<div class="asset-card-keywords">${keywords.map(k => `<span class="asset-chip">${htmlEscape(k)}</span>`).join('')}</div>`
          : '<div class="asset-card-meta">Sin keywords</div>';

        return `
          <article class="asset-card" style="--delay:${delayMs}ms">
            ${media}
            <div class="asset-card-body">
              <div class="asset-card-title">${title}</div>
              <div class="asset-card-meta">${connector}</div>
              <details>
                <summary>Detalles</summary>
                <div class="asset-card-desc">${desc}</div>
                ${chips}
              </details>
              <div class="row">
                <button class="primary" onclick="window.useCatalogAssetByIndex(${idx})" ${canContract ? '' : 'disabled'}>${canContract ? 'Iniciar contratacion' : 'Solo visualizacion local'}</button>
              </div>
            </div>
          </article>
        `;
      }).join('');
    }

    function syncCatalogSelectionState() {
      const sel = document.getElementById('catalogAssetId');
      const terms = document.getElementById('catalogPolicyTerms');
      const policyJsonLd = document.getElementById('catalogPolicyJsonLd');
      const accept = document.getElementById('catalogAcceptTerms');
      if (!sel || !accept) return;

      const idx = Number(sel.value);
      const selected = Number.isInteger(idx) && idx >= 0 ? state.catalogRows[idx] : null;
      if (terms) terms.value = selected?.policySummary || '';
      if (policyJsonLd) policyJsonLd.value = selected ? buildPolicyDcatJsonLd(selected) : '';

      const contractBox = document.getElementById('catalogContractBox');
      if (contractBox) contractBox.style.display = selected ? 'block' : 'none';

      const selectedConnector = document.getElementById('catalogSelectedConnector');
      if (selectedConnector) selectedConnector.value = selected?.connectorId || '';
      const selectedDsp = document.getElementById('catalogSelectedDsp');
      if (selectedDsp) selectedDsp.value = selected?.counterPartyAddress || '';
      if (selected?.counterPartyAddress) {
        const resolved = document.getElementById('resolvedAddress');
        const transferAddress = document.getElementById('transferAddress');
        const connectorInput = document.getElementById('searchConnectorId');
        if (resolved) resolved.value = selected.counterPartyAddress;
        if (transferAddress) transferAddress.value = selected.counterPartyAddress;
        if (connectorInput && selected.connectorId) connectorInput.value = selected.connectorId;
      }

      // Explicit flow: contract is only requested when user clicks "Realizar contrato".
    }

    function mapPublishedAssetRows(rawAssets = []) {
      return (Array.isArray(rawAssets) ? rawAssets : []).map((a) => {
        const props = a?.properties || a?.['edc:properties'] || {};
        const id = a?.['@id'] || a?.id || '';
        const title = firstNonEmpty([
          props?.name,
          props?.['dct:title'],
          props?.title,
          id,
        ]);
        const description = firstNonEmpty([
          props?.['dct:description'],
          props?.['eitel:description'],
          props?.description,
        ]);
        const imageUrl = firstNonEmpty([
          props?.['schema:image'],
          props?.['eitel:image'],
          props?.image,
        ]);
        const keywords = [
          ...parseKeywordList(props?.['dcat:keyword']),
          ...parseKeywordList(props?.['eitel:keywords']),
          ...parseKeywordList(props?.keywords),
        ];
        return {
          id,
          title,
          description,
          imageUrl,
          managedBy: firstNonEmpty([props?.['eitel:managedByConnector'], props?.['eitel:managedBy']]),
          keywords: [...new Set(keywords)],
        };
      });
    }

    function mapPublishedAssetsToCatalogVisualRows(rawAssets = []) {
      return mapPublishedAssetRows(rawAssets).map((row) => ({
        offerId: '',
        assetId: row.id || '',
        policyTarget: row.id || '',
        assigner: PROD_CONNECTOR_ID,
        connectorId: PROD_CONNECTOR_ID,
        counterPartyAddress: '',
        policySummary: 'Visualización local. Este asset no tiene una oferta remota de catálogo activa.',
        policyRaw: null,
        sourceHintUrl: '',
        assetTitle: row.title,
        assetDescription: row.description,
        assetKeywords: row.keywords,
        assetImageUrl: row.imageUrl,
      }));
    }

    /**
     * Renders published assets table in UI.
     * Creates HTML table with asset data including name, source, and action buttons.
     * Each row is clickable to select asset for editing.
     * 
     * @param {Object[]} [rows=[]] - Array of published asset objects
     * @returns {void}
     * 
     * @example
     * renderPublishedAssets(assets); // Display assets in table format
     */
    function renderPublishedAssets(rows = []) {
      const wrap = document.getElementById('publishedAssetsGrid');
      if (!wrap) return;
      if (!rows.length) {
        wrap.innerHTML = '<div class="card" style="box-shadow:none"><p class="muted" style="margin:0">No hay assets publicados todavía en este conector.</p></div>';
        return;
      }

      wrap.innerHTML = rows.map((row, idx) => {
        const title = htmlEscape(safeText(row.title, clean(row.id)));
        const desc = htmlEscape(safeText(row.description, 'Sin descripción.'));
        const id = htmlEscape(row.id || '');
        const managedBy = htmlEscape(String(row.managedBy || '-'));
        const image = resolveAssetImageUrl(row.imageUrl);
        const defaultImageClass = isDefaultAssetImage(image) ? ' is-default' : '';
        const delayMs = Math.min(idx * 40, 480);
        const media = `<div class="asset-card-media${defaultImageClass}"><img src="${htmlEscape(image)}" alt="Imagen del asset ${title}" /><span class="asset-card-badge">MI ASSET</span><div class="asset-card-media-overlay"><span class="asset-card-media-title">${title}</span></div></div>`;
        const chips = row.keywords.length
          ? `<div class="asset-card-keywords">${row.keywords.slice(0, 8).map(k => `<span class="asset-chip">${htmlEscape(k)}</span>`).join('')}</div>`
          : '<div class="asset-card-meta">Sin keywords</div>';

        return `
          <article class="asset-card" style="--delay:${delayMs}ms">
            ${media}
            <div class="asset-card-body">
              <div class="asset-card-title">${title}</div>
              <div class="asset-card-meta">${id}</div>
              <div class="asset-card-meta">managedBy: ${managedBy}</div>
              <details>
                <summary>Detalles</summary>
                <div class="asset-card-desc">${desc}</div>
                ${chips}
              </details>
              <div class="row">
                <button class="ghost" onclick="window.editPublishedAsset('${(row.id || '').replace(/'/g, "\\'")}')">Editar</button>
                <button class="danger" onclick="window.deletePublishedAsset('${(row.id || '').replace(/'/g, "\\'")}')">Borrar</button>
              </div>
            </div>
          </article>
        `;
      }).join('');
    }

    /**
     * Loads published assets from Management API.
     * Fetches asset list from connector and updates internal cache.
     * Optionally logs results to console for debugging.
     * 
     * @async
     * @param {boolean} [showOutput=false] - Whether to log results to console
     * @returns {Promise<Object[]>} Array of published assets
     * 
     * @example
     * const assets = await loadPublishedAssets(true);
     */
    async function loadPublishedAssets(showOutput = false) {
      const r = await callApi('POST', '/v3/assets/request', q());
      const allRows = mapPublishedAssetRows(unwrap(r));
      const ownRows = allRows.filter(row => String(row.managedBy || '').trim().toLowerCase() === String(connectorName || '').trim().toLowerCase());
      const rowsToRender = ownRows.length ? ownRows : allRows;
      renderPublishedAssets(rowsToRender);
      if (showOutput) writeOut({ ...r, totalPublishedAssets: allRows.length, connectorOwnedAssets: ownRows.length, rendered: rowsToRender.length });
      return r;
    }

    /**
     * Refreshes all overview panels with latest connector data.
     * Reloads assets, policies, contracts, and transfers from API.
     * Updates all UI sections to reflect current connector state.
     * 
     * @async
     * @returns {Promise<void>}
     * 
     * @example
     * await refreshOverview(); // Reload all connector data
     */
    async function refreshOverview() {
      const [a, p, ags, tps] = await Promise.all([
        callApi('POST', '/v3/assets/request', q()),
        callApi('POST', '/v3/policydefinitions/request', q()),
        callApi('POST', '/v3/contractagreements/request', q()),
        callApi('POST', '/v3/transferprocesses/request', q()),
      ]);
      const assets = unwrap(a);
      const policies = unwrap(p);
      const agreements = unwrap(ags);
      const transfers = getAllTransferRows(unwrap(tps));

      document.getElementById('kpiAssets').textContent = assets.length;
      document.getElementById('kpiPolicies').textContent = policies.length;
      document.getElementById('kpiContracts').textContent = agreements.length;
      document.getElementById('kpiTransfers').textContent = transfers.length;

      const assetsBody = document.getElementById('dashAssetsBody');
      const policiesBody = document.getElementById('dashPoliciesBody');
      const contractsBody = document.getElementById('dashContractsBody');
      const transfersBody = document.getElementById('dashTransfersBody');

      if (assetsBody) {
        if (!assets.length) {
          assetsBody.innerHTML = '<tr><td colspan="3" class="muted">No hay assets publicados.</td></tr>';
        } else {
          assetsBody.innerHTML = assets.slice(0, 10).map((asset) => {
            const id = asset?.['@id'] || asset?.id || '';
            const props = asset?.properties || asset?.['edc:properties'] || {};
            const name = props?.name || props?.title || clean(id);
            const type = props?.contenttype || asset?.dataAddress?.type || '-';
            return `<tr><td class="title-cell" title="${htmlEscape(name)}">${htmlEscape(name)}</td><td title="${htmlEscape(id)}">${htmlEscape(clean(id))}</td><td>${htmlEscape(String(type || '-'))}</td></tr>`;
          }).join('');
        }
      }

      if (policiesBody) {
        if (!policies.length) {
          policiesBody.innerHTML = '<tr><td colspan="3" class="muted">No hay policies activas.</td></tr>';
        } else {
          policiesBody.innerHTML = policies.slice(0, 10).map((policyDef) => {
            const pid = policyDef?.['@id'] || policyDef?.id || '';
            const policy = policyDef?.policy || {};
            const permsRaw = policy?.permission || policy?.['odrl:permission'] || [];
            const perms = Array.isArray(permsRaw) ? permsRaw : [permsRaw];
            const assetId = perms.find(p => p?.target || p?.['odrl:target'])?.target || perms.find(p => p?.target || p?.['odrl:target'])?.['odrl:target'] || '-';
            const constraints = perms.flatMap(p => {
              const c = p?.constraint || p?.['odrl:constraint'] || [];
              return Array.isArray(c) ? c : [c];
            }).filter(Boolean);
            const expiration = constraints.find(c => {
              const left = String(c?.leftOperand || c?.['odrl:leftOperand'] || '').toLowerCase();
              return left.includes('datetime') || left.includes('validuntil') || left.includes('expiration');
            })?.rightOperand || policy?.['dct:validUntil'] || '-';
            return `<tr><td class="title-cell" title="${htmlEscape(pid)}">${htmlEscape(clean(pid))}</td><td title="${htmlEscape(assetId)}">${htmlEscape(clean(assetId))}</td><td>${htmlEscape(expiration === '-' ? '-' : fmtDate(expiration))}</td></tr>`;
          }).join('');
        }
      }

      if (contractsBody) {
        if (!agreements.length) {
          contractsBody.innerHTML = '<tr><td colspan="3" class="muted">No hay contratos vigentes.</td></tr>';
        } else {
          contractsBody.innerHTML = agreements.slice(0, 10).map((agreement) => {
            const id = agreement?.['@id'] || agreement?.id || '';
            const assetId = agreement?.assetId || agreement?.['edc:assetId'] || '-';
            const publishedAt = agreement?.contractSigningDate || agreement?.['edc:contractSigningDate'] || agreement?.createdAt || agreement?.['edc:createdAt'] || '';
            return `<tr><td class="title-cell" title="${htmlEscape(id)}">${htmlEscape(clean(id))}</td><td title="${htmlEscape(assetId)}">${htmlEscape(clean(assetId))}</td><td>${htmlEscape(fmtDate(publishedAt))}</td></tr>`;
          }).join('');
        }
      }

      if (transfersBody) {
        if (!transfers.length) {
          transfersBody.innerHTML = '<tr><td colspan="3" class="muted">No hay transferencias.</td></tr>';
        } else {
          transfersBody.innerHTML = transfers.slice(0, 10).map((transfer) => {
            const id = transfer?.['@id'] || transfer?.id || '';
            const state = normalizeTransferState(transfer?.state || transfer?.['edc:state'] || '-');
            const contract = transfer?.contractId || transfer?.['edc:contractId'] || '-';
            return `<tr><td class="title-cell" title="${htmlEscape(id)}">${htmlEscape(clean(id))}</td><td>${htmlEscape(state)}</td><td title="${htmlEscape(contract)}">${htmlEscape(clean(contract))}</td></tr>`;
          }).join('');
        }
      }

      try { refreshStarTrustPanel(); } catch {}
    }

    const starTrustEnabled = ['1', 'true', 'yes', 'on'].includes(String(cfg.starMode || (String(connectorName || '').toLowerCase().includes('star') ? 'true' : '')).toLowerCase());
    const starTrustConfig = {
      enabled: starTrustEnabled,
      coordinatorName: String(cfg.starCoordinatorName || 'UC3M Coordinador EITEL').trim(),
      coordinatorUrl: String(cfg.starCoordinatorUrl || '').trim(),
      coordinatorStatusUrl: String(cfg.starCoordinatorStatusUrl || '').trim(),
      didMethod: String(cfg.starDidMethod || 'did:key').trim(),
      participantDid: String(cfg.starParticipantDid || '').trim(),
      vcPresent: ['1', 'true', 'yes', 'on'].includes(String(cfg.starVcPresent || '').toLowerCase()),
      vcIssuer: String(cfg.starVcIssuer || 'UC3M').trim(),
    };
    const starTrustState = {
      handshakeState: 'idle',
      handshakeDetail: '',
      transferState: 'idle',
      transferDetail: '',
      lastCounterParty: '',
      lastAssetId: '',
      lastAgreementId: '',
      lastTransferId: '',
      timeline: [],
    };
    const starTrustRemote = {
      loading: false,
      lastLoadedAt: 0,
      snapshot: null,
      participants: {},
      participantErrors: {},
      error: '',
      lastSuccessSignature: '',
    };

    function escapeStarHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getStarSecretMatch(patterns = []) {
      const names = Array.isArray(state?.secretNames) ? state.secretNames : [];
      return names.find((name) => patterns.some((pattern) => pattern.test(String(name || '')))) || '';
    }

    function getRemoteStarCoordinator() {
      return starTrustRemote.snapshot && typeof starTrustRemote.snapshot === 'object'
        ? (starTrustRemote.snapshot.coordinator || null)
        : null;
    }

    function getRemoteStarParticipant() {
      return starTrustRemote.snapshot && typeof starTrustRemote.snapshot === 'object'
        ? (starTrustRemote.snapshot.participant || null)
        : null;
    }

    function getStarParticipantCandidates() {
      const configured = [];
      const current = canonicalConnectorPrefix(connectorName || cfg?.connectorName || '');
      if (current) configured.push(current);

      const configuredList = String(cfg.connectorCatalogList || '').trim();
      if (configuredList) {
        configuredList.split(/[\n,;]+/g)
          .map((value) => canonicalConnectorPrefix(value))
          .filter(Boolean)
          .forEach((value) => configured.push(value));
      }

      Object.keys(getConfiguredConnectorDirectory()).forEach((value) => {
        const normalized = canonicalConnectorPrefix(value);
        if (normalized) configured.push(normalized);
      });

      return [...new Set(configured.map((value) => String(value || '').trim()).filter(Boolean))];
    }

    async function fetchCoordinatorHealthAndKey() {
      const coordinatorUrl = String(starTrustConfig.coordinatorUrl || '').trim();
      if (!coordinatorUrl) throw new Error('Falta la URL del coordinador.');

      const [healthRes, keyRes] = await Promise.allSettled([
        fetch(`${coordinatorUrl}/health`, { headers: { accept: 'application/json' } }),
        fetch(`${coordinatorUrl}/public-key`, { headers: { accept: 'application/json' } }),
      ]);

      const healthy = healthRes.status === 'fulfilled' && healthRes.value?.ok;
      let pubKey = null;
      if (keyRes.status === 'fulfilled' && keyRes.value?.ok) {
        const jwks = await keyRes.value.json().catch(() => null);
        pubKey = jwks?.keys?.[0] ?? null;
      }

      return { healthy, pubKey, coordinatorUrl };
    }

    function getStarParticipantTone(participant, error = '') {
      if (error) return 'warn';
      const didAvailable = Boolean(participant?.did);
      const vcAvailable = Boolean(participant?.vc?.present);
      if (didAvailable && vcAvailable) return 'ok';
      if (didAvailable || vcAvailable) return 'warn';
      return 'danger';
    }

    function getStarParticipantStatusLabel(participant, error = '') {
      if (error) return 'Sin respuesta';
      const didAvailable = Boolean(participant?.did);
      const vcAvailable = Boolean(participant?.vc?.present);
      if (didAvailable && vcAvailable) return 'Identidad completa';
      if (didAvailable || vcAvailable) return 'Identidad parcial';
      return 'Pendiente';
    }

    function buildFallbackStarParticipant(participantId) {
      const current = canonicalConnectorPrefix(connectorName || cfg?.connectorName || '');
      if (participantId !== current) return null;
      return {
        id: participantId,
        did: starTrustConfig.participantDid || '',
        vc: {
          present: Boolean(starTrustConfig.vcPresent),
          issuer: starTrustConfig.vcIssuer || '',
          id: '',
          status: starTrustConfig.vcPresent ? 'configured' : 'pending',
        },
      };
    }

    function renderStarParticipants() {
      const container = document.getElementById('starParticipantsGrid');
      if (!container) return;

      const participantIds = getStarParticipantCandidates();
      const current = canonicalConnectorPrefix(connectorName || cfg?.connectorName || '');
      if (!participantIds.length) {
        container.innerHTML = '<article class="star-participant-card" data-tone="info"><div class="star-participant-head"><div><div class="star-participant-role">Participante</div><div class="star-participant-name">Sin conectores configurados</div></div><div class="star-participant-status">Pendiente</div></div><dl class="star-participant-list"><dt>Detalle</dt><dd>Define los conectores Star en la configuración para mostrar DID, VC y endpoint DSP de cada uno.</dd></dl></article>';
        return;
      }

      const cards = participantIds.map((participantId) => {
        const participant = starTrustRemote.participants[participantId] || buildFallbackStarParticipant(participantId);
        const error = starTrustRemote.participantErrors[participantId] || '';
        const tone = getStarParticipantTone(participant, error);
        const status = getStarParticipantStatusLabel(participant, error);
        const label = prettyConnectorLabel(participantId);
        const did = participant?.did ? clean(participant.did) : 'pendiente';
        const vcId = participant?.vc?.id ? clean(participant.vc.id) : 'pendiente';
        const issuer = participant?.vc?.issuer ? clean(participant.vc.issuer) : (participant?.vc?.present ? 'configurado' : '-');
        const vcStatus = error
          ? `Error: ${clean(error)}`
          : (participant?.vc?.present
            ? `${clean(participant?.vc?.status || 'disponible')}`
            : 'pendiente');
        const dspUrl = resolveConfiguredDspUrl(participantId) || (participantId === current ? String(cfg?.dspUrl || '').trim() : '');

        return `
          <article class="star-participant-card" data-tone="${escapeStarHtml(tone)}">
            <div class="star-participant-head">
              <div>
                <div class="star-participant-role">${participantId === current ? 'Conector local' : 'Conector remoto'}</div>
                <div class="star-participant-name">${escapeStarHtml(label)}</div>
              </div>
              <div class="star-participant-status">${escapeStarHtml(status)}</div>
            </div>
            <dl class="star-participant-list">
              <dt>ID</dt><dd>${escapeStarHtml(clean(participant?.id || participantId))}</dd>
              <dt>DID</dt><dd>${escapeStarHtml(did)}</dd>
              <dt>VC</dt><dd>${escapeStarHtml(vcId)}</dd>
              <dt>Emisor</dt><dd>${escapeStarHtml(issuer)}</dd>
              <dt>Estado</dt><dd>${escapeStarHtml(vcStatus)}</dd>
              <dt>DSP</dt><dd>${escapeStarHtml(dspUrl || 'sin resolver')}</dd>
            </dl>
          </article>
        `;
      });

      container.innerHTML = cards.join('');
    }

    function getStarCounterpartyLabel() {
      const raw = String(starTrustState.lastCounterParty || '').trim();
      if (!raw) return '-';
      const normalized = canonicalConnectorPrefix(raw);
      const pretty = prettyConnectorLabel(normalized || raw);
      return normalized && pretty !== normalized ? `${pretty} (${clean(normalized)})` : clean(raw);
    }

    function renderStarProcess() {
      const container = document.getElementById('starProcessSteps');
      if (!container) return;

      const remoteCoordinator = getRemoteStarCoordinator();
      const coordinatorName = String(remoteCoordinator?.name || starTrustConfig.coordinatorName || 'UC3M Coordinador EITEL').trim();
      const coordinatorUrl = String(remoteCoordinator?.url || starTrustConfig.coordinatorUrl || '').trim();
      const coordinatorReady = Boolean(coordinatorUrl);
      const didReady = hasStarDid();
      const vcReady = hasStarVc();
      const hasCounterparty = Boolean(String(starTrustState.lastCounterParty || '').trim());

      const handshakePhase = {
        idle: ['warn', 'Pendiente', 'Todavía no se ha elegido una contraparte para negociar.'],
        resolving: ['info', 'Resolviendo', starTrustState.handshakeDetail || 'La UI está resolviendo la identidad y el endpoint de la contraparte.'],
        negotiating: ['info', 'En curso', starTrustState.handshakeDetail || 'La negociación P2P ya se ha enviado al nodo remoto.'],
        agreed: ['ok', 'Completado', starTrustState.handshakeDetail || 'Ya existe un agreement y el plano de datos puede arrancar.'],
        failed: ['danger', 'Fallido', starTrustState.handshakeDetail || 'La negociación no ha podido completarse.'],
      };
      const transferPhase = {
        idle: ['warn', 'Pendiente', 'Aún no hay transferencia directa iniciada.'],
        preparing: ['info', 'Preparando', starTrustState.transferDetail || 'Preparando canal y destino de la transferencia.'],
        running: ['info', 'En curso', starTrustState.transferDetail || 'Los datos están viajando de nodo a nodo.'],
        completed: ['ok', 'Completada', starTrustState.transferDetail || 'La transferencia directa ya terminó.'],
        failed: ['danger', 'Fallida', starTrustState.transferDetail || 'La transferencia no pudo completarse.'],
      };

      const steps = [
        {
          num: 1,
          title: 'Coordinador publica confianza',
          tone: coordinatorReady ? 'ok' : 'warn',
          status: coordinatorReady ? 'Listo' : 'Pendiente',
          detail: coordinatorReady
            ? `${coordinatorName} expone la clave pública y el estado inicial. Después sale del camino de la negociación y de la transferencia.`
            : 'Falta configurar o alcanzar el endpoint del coordinador Star.',
        },
        {
          num: 2,
          title: 'Nodo carga DID y VC',
          tone: didReady && vcReady ? 'ok' : (didReady || vcReady ? 'warn' : 'danger'),
          status: didReady && vcReady ? 'Listo' : (didReady || vcReady ? 'Parcial' : 'Pendiente'),
          detail: didReady && vcReady
            ? 'El participante local ya tiene identidad suficiente para operar en Star.'
            : 'Todavía falta completar parte de la identidad del nodo local.',
        },
        {
          num: 3,
          title: 'Se resuelve la contraparte',
          tone: hasCounterparty ? 'ok' : 'warn',
          status: hasCounterparty ? 'Resuelta' : 'Pendiente',
          detail: hasCounterparty
            ? `La contraparte actual es ${getStarCounterpartyLabel()}. Su DSP y material de confianza se usan para el siguiente paso.`
            : 'Aquí aparecerá el conector remoto seleccionado en catálogo o contrato. Esto es lo que estabas buscando como counter party.',
        },
        {
          num: 4,
          title: 'Handshake P2P',
          tone: (handshakePhase[starTrustState.handshakeState] || handshakePhase.idle)[0],
          status: (handshakePhase[starTrustState.handshakeState] || handshakePhase.idle)[1],
          detail: (handshakePhase[starTrustState.handshakeState] || handshakePhase.idle)[2],
        },
        {
          num: 5,
          title: 'Transferencia directa',
          tone: (transferPhase[starTrustState.transferState] || transferPhase.idle)[0],
          status: (transferPhase[starTrustState.transferState] || transferPhase.idle)[1],
          detail: (transferPhase[starTrustState.transferState] || transferPhase.idle)[2],
        },
      ];

      container.innerHTML = steps.map((step) => `
        <article class="star-process-step" data-tone="${escapeStarHtml(step.tone)}">
          <div class="star-process-step-num">${escapeStarHtml(step.num)}</div>
          <div class="star-process-step-title">${escapeStarHtml(step.title)}</div>
          <div class="star-process-step-status">${escapeStarHtml(step.status)}</div>
          <p class="star-process-step-detail">${escapeStarHtml(step.detail)}</p>
        </article>
      `).join('');
    }

    function renderStarSessionFacts() {
      const container = document.getElementById('starSessionFacts');
      if (!container) return;

      const remoteCoordinator = getRemoteStarCoordinator();
      const coordinatorName = String(remoteCoordinator?.name || starTrustConfig.coordinatorName || 'UC3M Coordinador EITEL').trim();
      const coordinatorUrl = String(remoteCoordinator?.url || starTrustConfig.coordinatorUrl || '').trim();
      const facts = [
        { label: 'Coordinador', value: coordinatorUrl ? `${coordinatorName} · ${coordinatorUrl}` : coordinatorName },
        { label: 'Contraparte', value: getStarCounterpartyLabel() },
        { label: 'Asset', value: clean(starTrustState.lastAssetId || '-') },
        { label: 'Agreement', value: clean(starTrustState.lastAgreementId || '-') },
        { label: 'Transfer ID', value: clean(starTrustState.lastTransferId || '-') },
        { label: 'Rol real del coordinador', value: 'Solo publica confianza inicial, clave pública y estado. No mueve el dato ni media en tiempo real en el handshake P2P.' },
      ];

      container.innerHTML = facts.map((fact) => `
        <article class="star-session-card">
          <div class="star-session-label">${escapeStarHtml(fact.label)}</div>
          <div class="star-session-value">${escapeStarHtml(fact.value)}</div>
        </article>
      `).join('');
    }

    function getStarDidLabel() {
      const remoteParticipant = getRemoteStarParticipant();
      const didSecret = getStarSecretMatch([/participant.*did/i, /^did$/i, /star.*did/i]);
      if (remoteParticipant?.did) return String(remoteParticipant.did).trim();
      if (starTrustConfig.participantDid) return starTrustConfig.participantDid;
      if (didSecret) return `vault:${didSecret}`;
      return `${starTrustConfig.didMethod || 'did:key'} pendiente`;
    }

    function hasStarDid() {
      const remoteParticipant = getRemoteStarParticipant();
      return Boolean(remoteParticipant?.did || starTrustConfig.participantDid || getStarSecretMatch([/participant.*did/i, /^did$/i, /star.*did/i]));
    }

    function hasStarVc() {
      const remoteParticipant = getRemoteStarParticipant();
      return Boolean(
        remoteParticipant?.vc?.present ||
        starTrustConfig.vcPresent ||
        getStarSecretMatch([/verifiable.*credential/i, /participant.*vc/i, /^vc$/i, /star.*vc/i, /credential/i])
      );
    }

    async function loadStarTrustSnapshot(force = false) {
      if (!starTrustConfig.enabled) return;
      const now = Date.now();
      if (starTrustRemote.loading) return;
      if (!force && starTrustRemote.snapshot && (now - starTrustRemote.lastLoadedAt) < 30000) return;

      starTrustRemote.loading = true;
      try {
        const { healthy, pubKey, coordinatorUrl } = await fetchCoordinatorHealthAndKey();

        const currentParticipantId = canonicalConnectorPrefix(connectorName || cfg?.connectorName || '');
        const localParticipant = buildFallbackStarParticipant();

        const coordinatorSnapshot = {
          coordinator: {
            name: starTrustConfig.coordinatorName,
            url: starTrustConfig.coordinatorUrl,
            publicKey: pubKey ? { id: pubKey.kid, published: true } : null,
            healthy,
          },
          participant: localParticipant,
        };

        starTrustRemote.participants = { [currentParticipantId]: localParticipant };
        starTrustRemote.participantErrors = {};
        starTrustRemote.snapshot = coordinatorSnapshot;
        starTrustRemote.error = '';
        starTrustRemote.lastLoadedAt = Date.now();

        const participantId = clean(localParticipant?.id || currentParticipantId || 'participante');
        const didValue = clean(localParticipant?.did || 'pendiente');
        const vcState = localParticipant?.vc?.present ? 'disponible' : 'pendiente';
        const signature = JSON.stringify([
          coordinatorUrl || '',
          participantId,
          didValue,
          localParticipant?.vc?.present || false,
        ]);

        if (force || signature !== starTrustRemote.lastSuccessSignature) {
          starTrustRemote.lastSuccessSignature = signature;
          const coordinatorStatus = healthy ? 'disponible' : 'no disponible';
          pushStarTrustEvent('Coordinador consultado', `${coordinatorStatus}. Nodo: ${participantId}, DID ${didValue}, VC ${vcState}.`, localParticipant?.vc?.present ? 'ok' : 'warn');
          return;
        }
      } catch (error) {
        starTrustRemote.error = error?.message ? String(error.message) : 'No se pudo consultar el coordinador.';
        starTrustRemote.lastLoadedAt = Date.now();
        if (force) {
          pushStarTrustEvent('Coordinador no disponible', starTrustRemote.error, 'warn');
          return;
        }
      } finally {
        starTrustRemote.loading = false;
        refreshStarTrustPanel();
      }
    }

    function pushStarTrustEvent(title, detail, tone = 'info') {
      if (!starTrustConfig.enabled) return;
      starTrustState.timeline.unshift({
        title: String(title || 'Estado Star').trim(),
        detail: String(detail || '').trim(),
        tone,
        at: Date.now(),
      });
      starTrustState.timeline = starTrustState.timeline.slice(0, 8);
      refreshStarTrustPanel();
    }

    function setStarTrustCard(prefix, tone, status, detail) {
      const card = document.getElementById(`${prefix}Card`);
      const statusNode = document.getElementById(`${prefix}Status`);
      const detailNode = document.getElementById(`${prefix}Detail`);
      if (card) card.setAttribute('data-tone', tone || 'info');
      if (statusNode) statusNode.textContent = status || '';
      if (detailNode) detailNode.textContent = detail || '';
    }

    function refreshArcgisPublishAssist() {
      const wrap = document.getElementById('arcgisPublishAssist');
      const status = document.getElementById('publishArcgisAuthState');
      if (!wrap || !status) return;

      const authType = document.getElementById('pubAuthType')?.value || 'none';
      const shouldShow = Boolean(arcgis?.enabled) && (starTrustConfig.enabled || authType === 'arcgis-login');
      wrap.style.display = shouldShow ? '' : 'none';
      if (!shouldShow) return;

      const token = getArcgisAccessTokenForPublish();
      const expiresAt = getStoredArcgisTokenExpiresAt();
      const remainingMs = expiresAt ? (expiresAt - Date.now()) : 0;
      status.className = 'status-pill';

      if (!token) {
        status.classList.add('warn');
        status.textContent = 'ArcGIS pendiente de login';
        return;
      }
      if (expiresAt && remainingMs <= 0) {
        status.classList.add('danger');
        status.textContent = 'Token ArcGIS expirado';
        return;
      }
      if (expiresAt && remainingMs < 30 * 60 * 1000) {
        status.classList.add('warn');
        status.textContent = `Token ArcGIS activo (${formatRemainingTimeMs(remainingMs)})`;
        return;
      }

      status.classList.add('ok');
      status.textContent = expiresAt ? `Token ArcGIS activo (${formatRemainingTimeMs(remainingMs)})` : 'Sesion ArcGIS activa';
    }

    function refreshStarTrustPanel() {
      const banner = document.getElementById('starTrustBanner');
      const summary = document.getElementById('starTrustSummary');
      const timeline = document.getElementById('starTrustTimeline');
      if (!banner || !summary || !timeline) return;

      banner.style.display = starTrustConfig.enabled ? '' : 'none';
      if (!starTrustConfig.enabled) return;

      loadStarTrustSnapshot(false);

      summary.textContent = 'Proceso Star: 1) el coordinador publica confianza inicial, 2) cada nodo expone DID y VC, 3) se resuelve la contraparte, 4) el handshake ocurre P2P, 5) el dato viaja directo entre nodos.';

      const remoteCoordinator = getRemoteStarCoordinator();
      const remoteParticipant = getRemoteStarParticipant();
      const coordinatorName = String(remoteCoordinator?.name || starTrustConfig.coordinatorName || 'UC3M Coordinador EITEL').trim();
      const coordinatorUrl = String(remoteCoordinator?.url || starTrustConfig.coordinatorUrl || '').trim();
      const coordinatorHasKey = Boolean(remoteCoordinator?.publicKey?.published || remoteCoordinator?.publicKey?.id);
      const coordinatorTone = starTrustRemote.loading ? 'info' : (coordinatorUrl ? (coordinatorHasKey ? 'ok' : 'warn') : 'warn');
      const coordinatorStatus = starTrustRemote.loading
        ? 'Consultando coordinador'
        : (coordinatorUrl ? (coordinatorHasKey ? 'Coordinador verificado' : 'Coordinador configurado') : 'Coordinador sin endpoint');
      const coordinatorDetail = starTrustRemote.error
        ? `${coordinatorName}. ${starTrustRemote.error}`
        : (coordinatorUrl
          ? `${coordinatorName} · ${coordinatorUrl}${coordinatorHasKey ? ` · clave ${clean(remoteCoordinator?.publicKey?.id || 'publicada')}` : ''}`
          : `${coordinatorName}. Falta exponer el endpoint público de clave o metadatos.`);
      setStarTrustCard('starCoordinator', coordinatorTone, coordinatorStatus, coordinatorDetail);

      const didLabel = getStarDidLabel();
      const remoteVc = remoteParticipant?.vc || null;
      const vcAvailable = hasStarVc();
      const didAvailable = hasStarDid();
      const vcTone = vcAvailable && didAvailable ? 'ok' : (vcAvailable || didAvailable ? 'warn' : 'danger');
      const vcStatus = vcAvailable && didAvailable ? 'Identidad preparada' : (vcAvailable || didAvailable ? 'Identidad parcial' : 'VC y DID pendientes');
      const vcSource = remoteVc?.id
        ? `coordinador:${clean(remoteVc.id)}`
        : getStarSecretMatch([/verifiable.*credential/i, /participant.*vc/i, /^vc$/i, /star.*vc/i, /credential/i]);
      const vcIssuer = String(remoteVc?.issuer || starTrustConfig.vcIssuer || 'UC3M').trim();
      const vcDetail = `DID: ${didLabel}. VC: ${vcAvailable ? `disponible${vcSource ? ` en ${vcSource}` : ''}` : `pendiente (${vcIssuer} emite una sola vez)`}.${remoteVc?.status ? ` Estado: ${clean(remoteVc.status)}.` : ''}`;
      setStarTrustCard('starVc', vcTone, vcStatus, vcDetail);
      renderStarProcess();
      renderStarSessionFacts();
      renderStarParticipants();

      const arcgisToken = getArcgisAccessTokenForPublish();
      const arcgisTone = !arcgis?.enabled ? 'info' : (arcgisToken || authState.username ? 'ok' : 'warn');
      const arcgisStatus = !arcgis?.enabled
        ? 'ArcGIS no requerido'
        : (arcgisToken || authState.username ? 'Sesion ArcGIS activa' : 'Login requerido');
      const arcgisDetail = !arcgis?.enabled
        ? 'Este despliegue puede operar sin ArcGIS. El token solo se pide cuando el asset o el destino lo requieren.'
        : ((authState.username || arcgisToken)
          ? `Portal ${arcgis.portalUrl || '-'} · ${authState.username ? `usuario ${authState.username}` : 'token disponible para publicar o subir datos'}`
          : `Portal ${arcgis.portalUrl || '-'} · inicia sesión para publicar assets ArcGIS o subir transferencias al portal.`);
      setStarTrustCard('starArcgis', arcgisTone, arcgisStatus, arcgisDetail);

      const handshakeByState = {
        idle: ['warn', 'Sin negociación', 'Todavía no se ha abierto una negociación de contrato con otro participante.'],
        resolving: ['info', 'Resolviendo identidad', starTrustState.handshakeDetail || 'Resolviendo el participante remoto, su DSP y el material de confianza disponible.'],
        negotiating: ['info', 'Negociando contrato', starTrustState.handshakeDetail || 'El plano de control está creando el acuerdo entre nodos.'],
        agreed: ['ok', 'Handshake preparado', starTrustState.handshakeDetail || 'Existe acuerdo y la relación P2P puede pasar al plano de datos.'],
        failed: ['danger', 'Handshake con incidencia', starTrustState.handshakeDetail || 'La negociación no ha terminado correctamente.'],
      };
      const [handshakeTone, handshakeStatus, handshakeDetail] = handshakeByState[starTrustState.handshakeState] || handshakeByState.idle;
      setStarTrustCard('starHandshake', handshakeTone, handshakeStatus, handshakeDetail);

      const transferByState = {
        idle: ['warn', 'Sin transferencia', 'No hay un intercambio directo activo entre nodos en este momento.'],
        preparing: ['info', 'Preparando canal', starTrustState.transferDetail || 'La UI está preparando la transferencia directa entre participante consumidor y proveedor.'],
        running: ['info', 'Transferencia en curso', starTrustState.transferDetail || 'El dato está viajando directamente por el plano de datos.'],
        completed: ['ok', 'Transferencia completada', starTrustState.transferDetail || 'La transferencia directa ha finalizado correctamente.'],
        failed: ['danger', 'Transferencia con incidencia', starTrustState.transferDetail || 'La transferencia no se ha completado correctamente.'],
      };
      const [transferTone, transferStatus, transferDetail] = transferByState[starTrustState.transferState] || transferByState.idle;
      setStarTrustCard('starTransfer', transferTone, transferStatus, transferDetail);

      if (!starTrustState.timeline.length) {
        timeline.innerHTML = '<div class="star-event" data-tone="info"><div class="star-event-head"><span class="star-event-title">Star listo para PoC</span><span class="star-event-time">ahora</span></div><div class="star-event-detail">La UI está preparada para reflejar coordinador, VC, DID, handshake P2P y transferencia directa. Si hay endpoint configurado, consulta su estado automáticamente.</div></div>';
      } else {
        timeline.innerHTML = starTrustState.timeline.map((event) => `\n          <div class="star-event" data-tone="${escapeStarHtml(event.tone || 'info')}">\n            <div class="star-event-head">\n              <span class="star-event-title">${escapeStarHtml(event.title)}</span>\n              <span class="star-event-time">${escapeStarHtml(new Date(event.at).toLocaleTimeString())}</span>\n            </div>\n            <div class="star-event-detail">${escapeStarHtml(event.detail)}</div>\n          </div>\n        `).join('');
      }

      refreshArcgisPublishAssist();
    }

    window.refreshStarTrustPanel = refreshStarTrustPanel;
  window.refreshStarTrustSnapshot = loadStarTrustSnapshot;

    let lastArcgisPublishToken = '';

    function getArcgisAccessTokenForPublish() {
      try {
        if (typeof getStoredArcgisToken === 'function') {
          const token = (getStoredArcgisToken() || '').trim();
          if (token) {
            lastArcgisPublishToken = token;
            return token;
          }
        }
      } catch {}
      try {
        const token = (sessionStorage.getItem('eitel.arcgis.access_token') || '').trim();
        if (token) {
          lastArcgisPublishToken = token;
          return token;
        }
        return lastArcgisPublishToken;
      } catch {
        return lastArcgisPublishToken;
      }
    }

    /**
     * Fetches ArcGIS access token from existing browser portal session.
     * Attempts to retrieve token from active ArcGIS Portal login.
     * 
     * @async
     * @returns {Promise<string|null>} Access token if found, null otherwise
     * 
     * @example
     * const token = await fetchArcgisAccessTokenFromPortalSession();
     */
    async function fetchArcgisAccessTokenFromPortalSession() {
      if (!arcgis?.portalUrl) return '';
      try {
        // Use window.location.origin (stable base URL, e.g. https://gis.eiteldata.eu) so the token's
        // referer is a prefix that both the browser validation fetch AND the EDC connector request match.
        const stableReferer = window.location.origin;
        const body = new URLSearchParams({
          f: 'json',
          client: 'referer',
          referer: stableReferer,
          expiration: '20160'
        });
        const res = await fetch(`${arcgis.portalUrl}/sharing/rest/generateToken`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: body.toString(),
          credentials: 'include',
        });
        const data = await res.json();
        const token = (data?.token || '').trim();
        const expiresAt = Number(data?.expires || 0);
        if (token) {
          lastArcgisPublishToken = token;
          try { sessionStorage.setItem('eitel.arcgis.access_token', token); } catch {}
          if (Number.isFinite(expiresAt) && expiresAt > 0) setStoredArcgisTokenExpiresAt(expiresAt);
          refreshArcgisTokenIndicator();
        }
        return token;
      } catch {
        return '';
      }
    }

    /**
     * Resolves ArcGIS access token for asset publishing operations.
     * Checks session, portal token storage, and user input fields.
     * Returns cached token or fetches new one from portal.
     * 
     * @async
     * @returns {Promise<string|null>} Valid ArcGIS access token or null if unavailable
     * 
     * @example
     * const token = await resolveArcgisTokenForPublish();
     * if (!token) { ensureArcgisLogin(); }
     */
    async function resolveArcgisTokenForPublish() {
      // Prefer a fresh token from ArcGIS session to avoid stale-token transfers.
      const fresh = await fetchArcgisAccessTokenFromPortalSession();
      if (fresh) return fresh;
      return getArcgisAccessTokenForPublish();
    }

    function resolveAuthTokenForPublish(authType) {
      if (authType === 'arcgis-login') {
        return getArcgisAccessTokenForPublish() || lastArcgisPublishToken;
      }
      return (document.getElementById('pubAuthToken')?.value || '').trim();
    }

    function buildAuthHeaders(baseHeaders = {}) {
      const authType = document.getElementById('pubAuthType')?.value || 'none';
      const authHeader = (document.getElementById('pubAuthHeader')?.value || 'Authorization').trim();
      const authPrefix = (document.getElementById('pubAuthPrefix')?.value || '').trim();
      const authToken = resolveAuthTokenForPublish(authType);
      const authSecret = (document.getElementById('pubAuthSecret')?.value || '').trim();
      const headers = { ...baseHeaders };

      if (authType === 'none') return headers;
      if (authType === 'arcgis-login') {
        if (authToken) {
          headers.token = authToken;
        }
        return headers;
      }

      let authValue = '';
      if (authToken) {
        // token provided directly in the form (useful for OAuth2 or API tokens)
        if (authType === 'apikey') {
          authValue = authToken;
        } else {
          const prefix = authPrefix || 'Bearer ';
          authValue = `${prefix}${authToken}`;
        }
      } else if (authSecret) {
        const secretRef = `{{vault:${authSecret}}}`;
        authValue = authType === 'apikey' ? secretRef : `${authPrefix || 'Bearer '}${secretRef}`;
      }

      if (authValue) headers[authHeader] = authValue;
      return headers;
    }

    function appendQueryParams(path, params) {
      const basePath = String(path || '').trim();
      const [rawPath, rawQuery = ''] = basePath.split('?', 2);
      const qs = new URLSearchParams(rawQuery);
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') return;
        if (!qs.has(k)) qs.set(k, String(v));
      });
      const query = qs.toString();
      return query ? `${rawPath}?${query}` : rawPath;
    }

    function buildArcgisPathWithToken(path, token) {
      const withFormat = setQueryParams(path, { f: 'json' });
      return setQueryParams(withFormat, { token });
    }

    function setQueryParams(path, params) {
      const basePath = String(path || '').trim();
      const [rawPath, rawQuery = ''] = basePath.split('?', 2);
      const qs = new URLSearchParams(rawQuery);
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') return;
        qs.set(k, String(v));
      });
      const query = qs.toString();
      return query ? `${rawPath}?${query}` : rawPath;
    }

    function removeQueryParams(path, keys = []) {
      const basePath = String(path || '').trim();
      const [rawPath, rawQuery = ''] = basePath.split('?', 2);
      const qs = new URLSearchParams(rawQuery);
      keys.forEach(key => qs.delete(key));
      const query = qs.toString();
      return query ? `${rawPath}?${query}` : rawPath;
    }

    function normalizeHttpDataUrlParts(rawBaseUrl, rawPath) {
      let baseUrl = String(rawBaseUrl || '').trim();
      let path = String(rawPath || '').trim();

      // Accept full URL pasted in path field.
      if (/^https?:\/\//i.test(path)) {
        try {
          const u = new URL(path);
          baseUrl = `${u.origin}${u.pathname}`;
          const q = u.search ? u.search.replace(/^\?/, '') : '';
          path = q ? `?${q}` : '';
        } catch {}
      }

      // If baseUrl already contains query, move it to path query to avoid double '?'.
      const qIndex = baseUrl.indexOf('?');
      if (qIndex >= 0) {
        const baseQuery = baseUrl.slice(qIndex + 1);
        baseUrl = baseUrl.slice(0, qIndex);
        path = appendQueryParams(path, Object.fromEntries(new URLSearchParams(baseQuery).entries()));
      }

      if (path && !path.startsWith('/') && !path.startsWith('?')) {
        path = `/${path}`;
      }

      return { baseUrl: baseUrl.trim(), path: path.trim() };
    }

    function getSelectedTransferMode() {
      return (document.getElementById('transferMode')?.value || 'push').trim();
    }

    function getSelectedAssetSourceMode() {
      return (document.getElementById('assetSourceMode')?.value || 'remote-url').trim();
    }

    function syncAssetSourceModeUi() {
      const mode = getSelectedAssetSourceMode();
      const baseUrlWrap = document.getElementById('assetRemoteBaseUrlWrap');
      const pathWrap = document.getElementById('assetRemotePathWrap');
      const localFileWrap = document.getElementById('assetLocalFileWrap');
      if (baseUrlWrap) baseUrlWrap.style.display = mode === 'local-file' ? 'none' : '';
      if (pathWrap) pathWrap.style.display = mode === 'local-file' ? 'none' : '';
      if (localFileWrap) localFileWrap.style.display = mode === 'local-file' ? '' : 'none';
    }

    function syncTransferModeUi() {
      const mode = getSelectedTransferMode();
      const sinkWrap = document.getElementById('sinkBaseUrlWrap');
      const arcgisWrap = document.getElementById('arcgisUploadWrap');
      const startBtn = document.getElementById('btnStartTransfer');
      if (sinkWrap) sinkWrap.style.display = mode === 'push' ? '' : 'none';
      if (arcgisWrap) arcgisWrap.style.display = mode === 'arcgis-upload' ? '' : 'none';
      if (startBtn && !transferStartInFlight) {
        startBtn.textContent = mode === 'local-download'
          ? 'Descargar en local'
          : (mode === 'arcgis-upload' ? 'Subir a ArcGIS' : 'Iniciar transferencia');
      }
    }

    function guessFileExtension(contentType, fallback = 'json') {
      const lower = String(contentType || '').toLowerCase();
      if (lower.includes('application/json')) return 'json';
      if (lower.includes('geo+json')) return 'geojson';
      if (lower.includes('text/csv')) return 'csv';
      if (lower.includes('application/zip')) return 'zip';
      if (lower.includes('application/pdf')) return 'pdf';
      if (lower.includes('text/plain')) return 'txt';
      if (lower.includes('text/html')) return 'html';
      return fallback;
    }

    function inferDownloadFilename(assetId, sourceUrl, contentType, contentDisposition) {
      const cd = String(contentDisposition || '');
      const matchUtf8 = cd.match(/filename\*=UTF-8''([^;]+)/i);
      if (matchUtf8?.[1]) {
        try { return decodeURIComponent(matchUtf8[1]); } catch {}
      }
      const matchSimple = cd.match(/filename="?([^";]+)"?/i);
      if (matchSimple?.[1]) return matchSimple[1];

      try {
        const url = new URL(sourceUrl, window.location.origin);
        const lastSegment = (url.pathname.split('/').filter(Boolean).pop() || '').trim();
        if (lastSegment && lastSegment.includes('.')) return lastSegment;
      } catch {}

      const safeAssetId = String(assetId || 'dataset').trim().replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'dataset';
      return `${safeAssetId}.${guessFileExtension(contentType)}`;
    }

    /**
     * Downloads asset from remote source to local storage via EDC transfer.
     * Initiates transfer process and stores downloaded file in download-sink service.
     * Handles error cases including missing assets and failed transfers.
     * 
     * @async
     * @param {string} contractId - Contract ID for the transfer
     * @param {string} assetId - Asset ID to download
     * @returns {Promise<Object>} Response with status and file information
     * 
     * @example
     * const result = await downloadAssetLocally('contract-123', 'asset-456');
     */
    async function downloadAssetLocally(contractId, assetId) {
      if (!assetId) {
        return { status: 404, error: 'No se pudo resolver el asset asociado al contrato seleccionado.' };
      }

      const assetsResp = await callApi('POST', '/v3/assets/request', q(), { retries: 0, timeoutMs: 5000 });
      const assets = unwrap(assetsResp);
      const asset = assets.find(a => (a['@id'] || a.id || '') === assetId);
      if (!asset) {
        return { status: 404, error: 'El asset del contrato no existe en este conector.', contractId, assetId };
      }

      const props = asset.properties || {};
      const dataAddress = asset.dataAddress || asset['edc:dataAddress'] || {};
      const sourceMode = String(props['eitel:sourceMode'] || '').trim();
      const baseUrl = String(dataAddress.baseUrl || '').trim();
      let path = String(dataAddress.path || '').trim();
      let headers = { ...(dataAddress.headers || {}) };
      const authType = String(props['eitel:authType'] || '').trim();

      if (!baseUrl || String(dataAddress.type || '').trim() !== 'HttpData') {
        return { status: 400, error: 'El asset seleccionado no usa un origen HttpData descargable.', contractId, assetId, dataAddress };
      }

      if (authType === 'arcgis-login') {
        const authToken = await resolveArcgisTokenForPublish();
        if (!authToken) {
          return { status: 401, error: 'No se pudo obtener un token ArcGIS válido para la descarga local.' };
        }
        path = buildArcgisPathWithToken(removeQueryParams(path, ['token']), authToken);
        headers = { ...headers, token: authToken };
      }

      const sourceUrl = sourceMode === 'local-file' && props['eitel:localAssetPublicUrl']
        ? String(props['eitel:localAssetPublicUrl']).trim()
        : `${baseUrl.replace(/\/+$/, '')}${path || ''}`;
      try {
        const response = await fetch(sourceUrl, {
          method: 'GET',
          headers,
          credentials: 'include',
        });
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        if (!response.ok) {
          const detail = await response.text();
          return {
            status: response.status,
            error: 'La descarga local devolvió error HTTP.',
            contractId,
            assetId,
            sourceUrl,
            contentType,
            detail: detail.slice(0, 1000)
          };
        }

        const blob = await response.blob();
        const filename = inferDownloadFilename(
          assetId,
          sourceUrl,
          contentType,
          response.headers.get('content-disposition') || ''
        );
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

        return {
          status: 200,
          downloaded: true,
          contractId,
          assetId,
          sourceUrl,
          filename,
          contentType,
          bytes: blob.size,
        };
      } catch (error) {
        return {
          status: 500,
          error: 'No se pudo descargar el recurso en el navegador.',
          contractId,
          assetId,
          sourceUrl,
          detail: String(error),
        };
      }
    }

    function canonicalConnectorPrefix(input) {
      const raw = String(input || '').trim();
      if (!raw) return '';
      const lower = raw.toLowerCase();
      if (lower === 'conectorfuenlabrada' || lower === 'fuenlabrada') return 'conectorFuenlabrada';
      if (lower === 'conectoruc3m' || lower === 'uc3m') return 'conectoruc3m';
      return lower.startsWith('conector') ? raw : `conector${raw}`;
    }

    function extractConnectorIdHint(rawValue) {
      const raw = String(rawValue || '').trim();
      if (!raw) return '';

      const direct = raw.match(/conector[a-z0-9-]+/i);
      if (direct?.[0]) return canonicalConnectorPrefix(direct[0]);

      const short = raw.toLowerCase();
      if (short === 'uc3m' || short === 'fuenlabrada' || short === 'provider' || short === 'consumer') return short;

      return '';
    }

    function resolveAgreementPartnerConnector(agreementId) {
      const row = (state.agreementRows || []).find(a => a.id === agreementId);
      if (!row) return '';
      const candidates = [row.provider, row.consumer, row.cp, row.asset];
      for (const candidate of candidates) {
        const hint = extractConnectorIdHint(candidate);
        if (hint) return hint;
      }
      return '';
    }

    function syncTransferAddressFromAgreement(agreementId) {
      const contractId = String(agreementId || '').trim();
      if (!contractId) return;
      const partnerConnector = resolveAgreementPartnerConnector(contractId);
      if (!partnerConnector) return;

      const resolved = buildDspUrl(partnerConnector);
      if (!resolved) return;
      const transferInput = document.getElementById('transferAddress');
      if (transferInput) transferInput.value = resolved;
    }

    function resolveTransferParty(contractId, selectedAgreement = null) {
      const currentTransferAddress = (document.getElementById('transferAddress')?.value || '').trim();
      const row = selectedAgreement || (state.agreementRows || []).find(a => a.id === contractId) || null;

      const providerRaw = row?.providerId || row?.['edc:providerId'] || row?.provider || row?.cp || '';
      const hint = extractConnectorIdHint(providerRaw);
      const resolvedAddress = hint ? buildDspUrl(hint) : currentTransferAddress;

      let counterPartyId = String(providerRaw || '').trim();
      if (!counterPartyId && hint) {
        counterPartyId = String(hint).trim();
      }

      // If provider is a URL path/host alias, use connector hint as participant id fallback.
      if (counterPartyId.startsWith('http://') || counterPartyId.startsWith('https://') || counterPartyId.startsWith('/')) {
        counterPartyId = String(hint || '').trim();
      }

      return {
        address: resolvedAddress,
        counterPartyId,
        providerRaw,
      };
    }

    function getUiPrefix() {
      const configured = canonicalConnectorPrefix(cfg.connectorName || '');
      if (configured) return `/${configured}`;
      const first = (window.location.pathname || '/').split('/').filter(Boolean)[0] || '';
      return first ? `/${canonicalConnectorPrefix(first) || first}` : '';
    }

    function buildLocalDownloadSinkPublicBaseUrl() {
      return `${window.location.origin}${getUiPrefix()}/download-sink`;
    }

    function buildLocalDownloadSinkInternalBaseUrl() {
      const connector = String(cfg.connectorName || '').trim().toLowerCase();
      const normalized = connector ? connector.replace(/[^a-z0-9-]/g, '') : 'conectoruc3m';
      return `http://${normalized}-download-sink:8082`;
    }

    function shouldUsePublicSinkForRemoteTransfer(transferAddress) {
      const addr = String(transferAddress || '').trim().toLowerCase();
      // Si el partner viene por URL pública, el sink también debe ser público para que sea alcanzable entre máquinas.
      return addr.startsWith('http://') || addr.startsWith('https://');
    }

    function sleepMs(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Waits for a transfer to complete or reach terminal state.
     * Polls transfer status at intervals until completion or timeout.
     * 
     * @async
     * @param {string} transferId - Transfer ID to monitor
     * @param {number} [maxWaitMs=120000] - Maximum wait time in milliseconds (default 2 minutes)
     * @returns {Promise<Object|null>} Final transfer state or null if timed out
     * 
     * @example
     * const transfer = await waitTransferToFinish('transfer-123', 60000);
     */
    async function waitTransferToFinish(transferId, maxWaitMs = 120000) {
      const started = Date.now();
      while (Date.now() - started < maxWaitMs) {
        await sleepMs(2500);
        const stateResp = await callApi('GET', `/v3/transferprocesses/${encodeURIComponent(transferId)}/state`, undefined, { silent: true, retries: 0 });
        const st = normalizeTransferState(stateResp?.data?.state || stateResp?.data?.['edc:state'] || '');
        if (st === 'COMPLETED') return { ok: true, state: st };
        if (st === 'FAILED' || st === 'TERMINATED') {
          const detailResp = await callApi('GET', `/v3/transferprocesses/${encodeURIComponent(transferId)}`, undefined, { silent: true, retries: 0 });
          const err = detailResp?.data?.errorDetail || detailResp?.data?.['edc:errorDetail'] || 'Sin detalle de error.';
          return { ok: false, state: st, error: err };
        }
      }
      return { ok: false, state: 'TIMEOUT', error: 'La transferencia no finalizó a tiempo.' };
    }

    /**
     * Retrieves latest download sink record for a contract.
     * Gets most recent downloaded file associated with contract/asset.
     * 
     * @async
     * @param {string} contractId - Contract ID to check
     * @returns {Promise<Object|null>} Latest download record or null if none found
     * 
     * @example
     * const download = await getLatestDownloadSinkRecord('contract-123');
     */
    async function getLatestDownloadSinkRecord(contractId) {
      const sinkBaseUrl = buildLocalDownloadSinkPublicBaseUrl();
      const recordsRes = await fetch(`${sinkBaseUrl}/records?contractId=${encodeURIComponent(contractId)}`);
      const recordsData = await recordsRes.json();
      const records = Array.isArray(recordsData?.items) ? recordsData.items : [];
      return records[0] || null;
    }

    function triggerBrowserDownload(url, filename = '') {
      const anchor = document.createElement('a');
      anchor.href = url;
      if (filename) anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }

    function collectUrlCandidatesFromObject(obj, out = []) {
      if (!obj) return out;
      if (Array.isArray(obj)) {
        obj.forEach(item => collectUrlCandidatesFromObject(item, out));
        return out;
      }
      if (typeof obj !== 'object') return out;

      Object.entries(obj).forEach(([k, v]) => {
        if (typeof v === 'string' && /^https?:\/\//i.test(v)) {
          const key = String(k || '').toLowerCase();
          if (
            key.includes('endpointurl') ||
            key.includes('download') ||
            key.includes('publicurl') ||
            key.includes('baseurl') ||
            key.includes('accessurl') ||
            key.includes('localassetpublicurl') ||
            key.includes('url')
          ) {
            out.push(v);
          }
        } else if (typeof v === 'object' && v) {
          collectUrlCandidatesFromObject(v, out);
        }
      });
      return out;
    }

    function pickBestSourceUrl(urls = []) {
      const unique = [...new Set((Array.isArray(urls) ? urls : []).filter(Boolean))];
      const filtered = unique.filter(u => {
        const s = String(u).toLowerCase();
        return !s.includes('/api/management') && !s.includes('/api/v1/dsp');
      });
      return filtered[0] || unique[0] || '';
    }

    /**
     * Downloads asset from alternate source hint URL.
     * Used as fallback when EDC transfer fails or asset is unavailable.
     * Directly fetches asset from provided URL hint.
     * 
     * @async
     * @param {string} contractId - Contract ID context
     * @param {string} assetId - Asset ID context
     * @param {string} sourceUrl - Alternate source URL to download from
     * @returns {Promise<Object>} Download response with status and data
     * 
     * @example
     * const result = await downloadFromSourceHint('contract-123', 'asset-456', 'https://example.com/asset');
     */
    async function downloadFromSourceHint(contractId, assetId, sourceUrl) {
      const url = String(sourceUrl || '').trim();
      if (!url) return { status: 404, error: 'Sin URL de origen alternativa para descarga directa.', contractId, assetId };
      try {
        const response = await fetch(url, { method: 'GET', credentials: 'include' });
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        if (!response.ok) {
          const detail = await response.text();
          return {
            status: response.status,
            error: 'La descarga directa desde catálogo devolvió error HTTP.',
            contractId,
            assetId,
            sourceUrl: url,
            detail: String(detail || '').slice(0, 1000),
          };
        }
        const blob = await response.blob();
        const filename = inferDownloadFilename(assetId, url, contentType, response.headers.get('content-disposition') || '');
        const objectUrl = URL.createObjectURL(blob);
        triggerBrowserDownload(objectUrl, filename);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
        return {
          status: 200,
          downloaded: true,
          contractId,
          assetId,
          sourceUrl: url,
          filename,
          contentType,
          bytes: blob.size,
          via: 'catalog-source-hint',
        };
      } catch (error) {
        return {
          status: 500,
          error: 'No se pudo descargar desde URL alternativa de catálogo.',
          contractId,
          assetId,
          sourceUrl: url,
          detail: String(error),
        };
      }
    }

    function mapContentTypeToArcgisType(contentType, fallback = 'File') {
      const txt = String(contentType || '').toLowerCase();
      if (txt.includes('csv')) return 'CSV';
      if (txt.includes('json')) return 'GeoJson';
      if (txt.includes('zip')) return 'Shapefile';
      if (txt.includes('pdf')) return 'PDF';
      if (txt.includes('xml')) return 'File Geodatabase';
      return fallback;
    }

    function mapFilenameToArcgisType(filename, fallback = 'File') {
      const txt = String(filename || '').toLowerCase();
      if (txt.endsWith('.csv')) return 'CSV';
      if (txt.endsWith('.geojson') || txt.endsWith('.json')) return 'GeoJson';
      if (txt.endsWith('.zip')) return 'Shapefile';
      if (txt.endsWith('.pdf')) return 'PDF';
      if (txt.endsWith('.xlsx') || txt.endsWith('.xls')) return 'Microsoft Excel';
      if (txt.endsWith('.kml')) return 'KML';
      return fallback;
    }

    function normalizeArcgisItemType(rawType, filename, contentType) {
      const value = String(rawType || '').trim();
      const lower = value.toLowerCase();
      if (!value) {
        const byName = mapFilenameToArcgisType(filename, '');
        if (byName) return byName;
        return mapContentTypeToArcgisType(contentType, 'File');
      }

      const aliases = {
        csv: 'CSV',
        geojson: 'GeoJson',
        'geo json': 'GeoJson',
        json: 'GeoJson',
        shapefile: 'Shapefile',
        shp: 'Shapefile',
        pdf: 'PDF',
        file: 'File',
        excel: 'Microsoft Excel',
        xlsx: 'Microsoft Excel',
        xls: 'Microsoft Excel',
        kml: 'KML',
      };

      return aliases[lower] || value;
    }

    function isArcgisUnknownTypeError(payload) {
      const text = JSON.stringify(payload || {}).toLowerCase();
      return text.includes('type') && (
        text.includes('not recognized') ||
        text.includes('unsupported') ||
        text.includes('invalid') ||
        text.includes('no se ha podido reconocer') ||
        text.includes('cannot recognize')
      );
    }

    function isArcgisTypeRequiredError(payload) {
      const text = JSON.stringify(payload || {}).toLowerCase();
      return text.includes('type') && (
        text.includes('required') ||
        text.includes('missing') ||
        text.includes('obligatorio')
      );
    }

    function isArcgisGeoJsonAnalysisError(payload) {
      const text = JSON.stringify(payload || {}).toLowerCase();
      return text.includes('geojson') && (
        text.includes("doesn't have 'type'") ||
        text.includes('analyzing geojson') ||
        text.includes('error while analyzing geojson')
      );
    }

    /**
     * Resolves complete asset metadata required for ArcGIS upload.
     * Fetches asset details including title, description, and type information.
     * 
     * @async
     * @param {string} assetId - Asset ID to retrieve metadata for
     * @returns {Promise<Object>} Asset metadata object for ArcGIS operations
     * 
     * @example
     * const metadata = await resolveAssetMetadataForArcgis('asset-123');
     */
    async function resolveAssetMetadataForArcgis(assetId) {
      const safeAssetId = String(assetId || '').trim();
      if (!safeAssetId) return { title: '', description: '', keywords: [] };
      try {
        const assetsResp = await callApi('POST', '/v3/assets/request', q(), { silent: true, retries: 0 });
        const assets = unwrap(assetsResp);
        const asset = assets.find(a => (a['@id'] || a.id || '') === safeAssetId);
        if (!asset) return { title: '', description: '', keywords: [] };
        const props = asset?.properties || asset?.['edc:properties'] || {};
        const title = firstNonEmpty([props?.title, props?.name, safeAssetId]);
        const description = firstNonEmpty([props?.description, '']);
        const keywords = [...new Set(parseKeywordList(props?.keywords || '').filter(Boolean))];
        return { title, description, keywords };
      } catch {
        return { title: '', description: '', keywords: [] };
      }
    }

    function buildArcgisMetadataEnvelope({
      manualTitle,
      manualTags,
      manualDescription,
      contractId,
      assetId,
      sourceUrl,
      blobFilename,
      fallbackTitle,
      fallbackDescription,
      fallbackKeywords,
    }) {
      const cleanAsset = clean(assetId || blobFilename || 'asset');
      const today = new Date().toISOString().slice(0, 10);
      const title = String(manualTitle || '').trim() || fallbackTitle || `EITEL ${cleanAsset} ${today}`;

      const manualTagList = parseKeywordList(manualTags || '');
      const autoTagList = [
        ...(Array.isArray(fallbackKeywords) ? fallbackKeywords : []),
        'eitel',
        String(connectorName || '').toLowerCase(),
        contractId ? `contract:${contractId}` : '',
        assetId ? `asset:${assetId}` : '',
      ].map(v => String(v || '').trim()).filter(Boolean);
      const tags = [...new Set((manualTagList.length ? manualTagList : autoTagList).slice(0, 20))].join(', ');

      const descriptionAuto = [
        fallbackDescription || '',
        `Asset: ${assetId || '-'}`,
        `Contract: ${contractId || '-'}`,
        sourceUrl ? `Origen: ${sourceUrl}` : '',
      ].filter(Boolean).join(' | ');
      const description = String(manualDescription || '').trim() || descriptionAuto || 'Item creado desde transferencia EDC.';

      const snippet = `${title} · ${contractId ? `Contrato ${clean(contractId)}` : 'Sin contrato'} · ${cleanAsset}`.slice(0, 240);
      return { title, tags, description, snippet };
    }

    /**
     * Fetches asset blob/file data for uploading to ArcGIS.
     * Retrieves binary data from local storage or remote source for upload.
     * Handles authentication and data formatting for ArcGIS compatibility.
     * 
     * @async
     * @param {string} contractId - Contract ID for transfer context
     * @param {string} assetId - Asset ID to fetch blob for
     * @returns {Promise<Object>} Blob object with binary data and metadata
     * 
     * @example
     * const blob = await fetchAssetBlobForArcgisUpload('contract-123', 'asset-456');
     */
    async function fetchAssetBlobForArcgisUpload(contractId, assetId) {
      if (!assetId) return { status: 404, error: 'No se pudo resolver el asset asociado al contrato.' };

      const assetsResp = await callApi('POST', '/v3/assets/request', q(), { silent: true, retries: 0 });
      const assets = unwrap(assetsResp);
      const asset = assets.find(a => (a['@id'] || a.id || '') === assetId);
      if (!asset) {
        const hintedUrl = agreementSourceHints.get(contractId) || '';
        if (!hintedUrl) {
          return { status: 404, error: 'El asset no está localmente y no hay URL alternativa para ArcGIS.' };
        }
        try {
          const hintedRes = await fetch(hintedUrl, { method: 'GET', credentials: 'include' });
          if (!hintedRes.ok) return { status: hintedRes.status, error: 'No se pudo descargar el asset remoto para subir a ArcGIS.' };
          const hintedBlob = await hintedRes.blob();
          return {
            status: 200,
            blob: hintedBlob,
            filename: inferDownloadFilename(assetId, hintedUrl, hintedRes.headers.get('content-type') || hintedBlob.type, hintedRes.headers.get('content-disposition') || ''),
            contentType: hintedRes.headers.get('content-type') || hintedBlob.type || 'application/octet-stream',
            sourceUrl: hintedUrl,
          };
        } catch (error) {
          return { status: 500, error: `Error descargando asset remoto: ${String(error)}` };
        }
      }

      const props = asset.properties || {};
      const dataAddress = asset.dataAddress || asset['edc:dataAddress'] || {};
      const sourceMode = String(props['eitel:sourceMode'] || '').trim();
      const baseUrl = String(dataAddress.baseUrl || '').trim();
      let path = String(dataAddress.path || '').trim();
      let headers = { ...(dataAddress.headers || {}) };
      const authType = String(props['eitel:authType'] || '').trim();
      if (!baseUrl || String(dataAddress.type || '').trim() !== 'HttpData') {
        return { status: 400, error: 'El asset seleccionado no usa un origen HttpData válido.' };
      }

      if (authType === 'arcgis-login') {
        const authToken = await resolveArcgisTokenForPublish();
        if (!authToken) return { status: 401, error: 'No se pudo obtener token ArcGIS para leer el asset.' };
        path = buildArcgisPathWithToken(removeQueryParams(path, ['token']), authToken);
        headers = { ...headers, token: authToken };
      }

      const sourceUrl = sourceMode === 'local-file' && props['eitel:localAssetPublicUrl']
        ? String(props['eitel:localAssetPublicUrl']).trim()
        : `${baseUrl.replace(/\/+$/, '')}${path || ''}`;

      try {
        const response = await fetch(sourceUrl, { method: 'GET', headers, credentials: 'include' });
        if (!response.ok) return { status: response.status, error: 'No se pudo descargar el asset para ArcGIS.' };
        const blob = await response.blob();
        const contentType = response.headers.get('content-type') || blob.type || 'application/octet-stream';
        const filename = inferDownloadFilename(assetId, sourceUrl, contentType, response.headers.get('content-disposition') || '');
        return { status: 200, blob, filename, contentType, sourceUrl };
      } catch (error) {
        return { status: 500, error: `Error descargando asset para ArcGIS: ${String(error)}` };
      }
    }

    /**
     * Fetches remote asset blob using EDC transfer and download sink.
     * Initiates transfer to download-sink service and retrieves binary file data.
     * Handles counter-party resolution and transfer monitoring.
     * 
     * @async
     * @param {string} contractId - Contract ID for transfer
     * @param {string} assetId - Asset ID to fetch
     * @param {string|null} [transferParty=null] - Optional counter-party identifier
     * @returns {Promise<Object>} Blob response with binary data and metadata
     * 
     * @example
     * const blob = await fetchRemoteBlobViaTransferSink('contract-123', 'asset-456');
     */
    async function fetchRemoteBlobViaTransferSink(contractId, assetId, transferParty = null) {
      const transferAddress = String(transferParty?.address || '').trim() || (document.getElementById('transferAddress')?.value || '').trim();
      const counterPartyId = String(transferParty?.counterPartyId || '').trim();
      if (!transferAddress) {
        return { status: 400, error: 'Falta dirección DSP del partner para recuperar el asset remoto.' };
      }

      const sinkPublicBaseUrl = buildLocalDownloadSinkPublicBaseUrl();
      const sinkInternalBaseUrl = buildLocalDownloadSinkInternalBaseUrl();
      const sinkBaseUrlForTransfer = shouldUsePublicSinkForRemoteTransfer(transferAddress)
        ? sinkPublicBaseUrl
        : sinkInternalBaseUrl;

      try { await fetch(`${sinkPublicBaseUrl}/records`, { method: 'DELETE' }); } catch {}

      const path = `/ingest?contractId=${encodeURIComponent(contractId)}&assetId=${encodeURIComponent(assetId || '')}`;
      const transferReq = {
        '@context': { edc: 'https://w3id.org/edc/v0.0.1/ns/' },
        '@type': 'TransferRequest',
        protocol: 'dataspace-protocol-http:2025-1',
        counterPartyAddress: transferAddress,
        ...(counterPartyId ? { counterPartyId } : {}),
        contractId,
        transferType: 'HttpData-PUSH',
        dataDestination: {
          type: 'HttpData',
          baseUrl: sinkBaseUrlForTransfer,
          method: 'POST',
          path,
        }
      };

      const startResp = await callApi('POST', '/v3/transferprocesses', JSON.stringify(transferReq), { retries: 0, silent: true });
      const transferId = startResp?.data?.['@id'] || startResp?.data?.id || '';
      if (!(startResp.status >= 200 && startResp.status < 300) || !transferId) {
        return {
          status: startResp.status || 500,
          error: 'No se pudo iniciar la transferencia remota al sink local para ArcGIS.',
          response: startResp,
        };
      }

      const started = Date.now();
      const timeoutMs = 180000;
      while (Date.now() - started < timeoutMs) {
        await sleepMs(2500);

        const record = await getLatestDownloadSinkRecord(contractId).catch(() => null);
        if (record?.downloadPath) {
          const fileUrl = `${sinkPublicBaseUrl}${record.downloadPath}`;
          try {
            const fileResp = await fetch(fileUrl, { method: 'GET', credentials: 'include' });
            if (!fileResp.ok) {
              return {
                status: fileResp.status,
                error: 'El sink local recibió registro pero no se pudo leer el archivo.',
                sourceUrl: fileUrl,
              };
            }
            const blob = await fileResp.blob();
            const contentType = fileResp.headers.get('content-type') || blob.type || 'application/octet-stream';
            const filename = record.filename || inferDownloadFilename(assetId, fileUrl, contentType, fileResp.headers.get('content-disposition') || '');
            return { status: 200, blob, filename, contentType, sourceUrl: fileUrl, transferId };
          } catch (error) {
            return { status: 500, error: `Error leyendo archivo del sink local: ${String(error)}`, transferId };
          }
        }

        const stateResp = await callApi('GET', `/v3/transferprocesses/${encodeURIComponent(transferId)}/state`, undefined, { silent: true, retries: 0 });
        const st = normalizeTransferState(stateResp?.data?.state || stateResp?.data?.['edc:state'] || '');
        if (st === 'FAILED' || st === 'TERMINATED') {
          return {
            status: 502,
            error: 'La transferencia remota terminó en error antes de guardar archivo en sink local.',
            transferId,
            state: st,
          };
        }
      }

      return {
        status: 504,
        error: 'Timeout esperando archivo remoto en sink local para subida ArcGIS.',
      };
    }

    /**
     * Uploads asset blob to ArcGIS Portal as an item.
     * Handles file upload, item creation, and metadata assignment on ArcGIS server.
     * Supports various item types and includes error recovery strategies.
     * 
     * @async
     * @param {string} contractId - Contract ID context
     * @param {string} assetId - Asset ID being uploaded
     * @param {string|null} [transferParty=null] - Optional counter-party context
     * @returns {Promise<Object>} Upload response with item creation status
     * 
     * @example
     * const result = await uploadTransferToArcgis('contract-123', 'asset-456');
     */
    async function uploadTransferToArcgis(contractId, assetId, transferParty = null) {
      const title = String(document.getElementById('arcgisUploadTitle')?.value || '').trim();
      const typeInput = String(document.getElementById('arcgisUploadType')?.value || '').trim();
      const tags = String(document.getElementById('arcgisUploadTags')?.value || '').trim();
      const description = String(document.getElementById('arcgisUploadDescription')?.value || '').trim();

      if (!arcgis?.portalUrl) return { status: 400, error: 'Falta ARCGIS_PORTAL_URL en configuración.' };
      if (!authState?.username) return { status: 401, error: 'No hay sesión ArcGIS activa para subir el item.' };

      const token = await resolveArcgisTokenForPublish();
      if (!token) return { status: 401, error: 'No se pudo obtener token ArcGIS para subida.' };

      let blobResult = await fetchAssetBlobForArcgisUpload(contractId, assetId);
      if (!(blobResult.status >= 200 && blobResult.status < 300)) {
        blobResult = await fetchRemoteBlobViaTransferSink(contractId, assetId, transferParty);
      }
      if (!(blobResult.status >= 200 && blobResult.status < 300)) return blobResult;

      const assetMeta = await resolveAssetMetadataForArcgis(assetId);
      const arcgisMeta = buildArcgisMetadataEnvelope({
        manualTitle: title,
        manualTags: tags,
        manualDescription: description,
        contractId,
        assetId,
        sourceUrl: blobResult.sourceUrl,
        blobFilename: blobResult.filename,
        fallbackTitle: assetMeta.title,
        fallbackDescription: assetMeta.description,
        fallbackKeywords: assetMeta.keywords,
      });

      const resolvedType = normalizeArcgisItemType(typeInput, blobResult.filename, blobResult.contentType);
      const autoMode = !String(typeInput || '').trim();
      const buildForm = (itemType) => {
        const form = new FormData();
        form.append('f', 'json');
        form.append('token', token);
        form.append('title', arcgisMeta.title);
        const normalizedType = String(itemType || '').trim();
        if (normalizedType) form.append('type', normalizedType);
        form.append('tags', arcgisMeta.tags || 'eitel,edc');
        form.append('description', arcgisMeta.description || 'Item generado desde transferencia del conector EITEL');
        form.append('snippet', arcgisMeta.snippet || 'Item publicado desde EITEL Connector');
        form.append('file', blobResult.blob, blobResult.filename || `${assetId || 'asset'}.bin`);
        return form;
      };

      const sendAddItem = async (itemType) => {
        const endpoint = `${arcgis.portalUrl}/sharing/rest/content/users/${encodeURIComponent(authState.username)}/addItem`;
        const response = await fetch(endpoint, { method: 'POST', body: buildForm(itemType), credentials: 'include' });
        const data = await response.json();
        return { endpoint, response, data, itemType };
      };

      try {
        let result = await sendAddItem(autoMode ? '' : resolvedType);
        if (!result.response.ok || result.data?.error || result.data?.success === false) {
          const shouldRetryWithFile = autoMode
            ? (isArcgisTypeRequiredError(result.data) || isArcgisGeoJsonAnalysisError(result.data))
            : (isArcgisUnknownTypeError(result.data) || isArcgisGeoJsonAnalysisError(result.data));
          if (shouldRetryWithFile && result.itemType !== 'File') {
            result = await sendAddItem('File');
          }
        }
        if (!result.response.ok || result.data?.error || result.data?.success === false) {
          return {
            status: result.response.status || 500,
            error: result.data?.error?.message || result.data?.error || 'ArcGIS no aceptó la subida del item.',
            detail: result.data,
            usedType: result.itemType,
          };
        }
        return {
          status: 200,
          uploaded: true,
          contractId,
          assetId,
          itemId: result.data?.id || '',
          title: arcgisMeta.title,
          tags: arcgisMeta.tags,
          description: arcgisMeta.description,
          filename: blobResult.filename,
          contentType: blobResult.contentType,
          usedType: result.itemType,
          sourceUrl: blobResult.sourceUrl,
          arcgisResponse: result.data,
        };
      } catch (error) {
        return { status: 500, error: `Error subiendo item a ArcGIS: ${String(error)}` };
      }
    }

    /**
     * Monitors remote download transfer and fetches resulting asset blob.
     * Polls transfer status and retrieves downloaded file from sink service.
     * Coordinates multi-step asset download from remote connector.
     * 
     * @async
     * @param {string} contractId - Contract ID for transfer
     * @param {string} transferId - Transfer ID to monitor
     * @param {string} assetId - Asset ID being transferred
     * @returns {Promise<Object>} Final blob data from sink service
     * 
     * @example
     * const blob = await monitorRemoteDownloadAndFetch('contract-123', 'transfer-456', 'asset-789');
     */
    async function monitorRemoteDownloadAndFetch(contractId, transferId, assetId) {
      try {
        const started = Date.now();
        const maxWaitMs = 600000; // 10 minutos
        let loops = 0;

        while (Date.now() - started < maxWaitMs) {
          // 1) Prioridad: si el sink ya recibió archivo, descargar inmediatamente.
          const latest = await getLatestDownloadSinkRecord(contractId).catch(() => null);
          if (latest && latest.downloadPath) {
            const fileUrl = `${buildLocalDownloadSinkPublicBaseUrl()}${latest.downloadPath || ''}`;
            triggerBrowserDownload(fileUrl, latest.filename || 'download.bin');
            writeOut({
              status: 200,
              downloaded: true,
              remoteTransfer: true,
              transferId,
              contractId,
              assetId,
              filename: latest.filename,
              bytes: latest.bytes,
              sourceUrl: fileUrl,
            });
            return;
          }

          // 2) Cada pocas iteraciones, revisar estado de transferencia para detectar fallo terminal.
          if (loops % 3 === 0) {
            const stateResp = await callApi('GET', `/v3/transferprocesses/${encodeURIComponent(transferId)}/state`, undefined, { silent: true, retries: 0 });
            const st = normalizeTransferState(stateResp?.data?.state || stateResp?.data?.['edc:state'] || '');
            if (st === 'FAILED' || st === 'TERMINATED') {
              const detailResp = await callApi('GET', `/v3/transferprocesses/${encodeURIComponent(transferId)}`, undefined, { silent: true, retries: 0 });
              const err = detailResp?.data?.errorDetail || detailResp?.data?.['edc:errorDetail'] || 'Sin detalle de error.';
              writeOut({
                status: 502,
                error: 'La transferencia remota para descarga local no finalizó correctamente.',
                transferId,
                state: st,
                detail: err,
              });
              return;
            }
          }

          loops += 1;
          await sleepMs(3000);
        }

        writeOut({
          status: 504,
          error: 'La descarga remota sigue en curso y no llegó archivo al sink a tiempo.',
          transferId,
          contractId,
          assetId,
          hint: 'Comprueba /download-sink/records y conectividad entre conectores hacia el sink.',
        });
      } finally {
        _remoteLocalDownloadInFlightByContract.delete(contractId);
      }
    }

    /**
     * Downloads remote asset via EDC transfer contract.
     * Orchestrates full process: initiates transfer, monitors progress, retrieves file.
     * Stores result in local download-sink for user access.
     * 
     * @async
     * @param {string} contractId - Contract ID for transfer
     * @param {string} assetId - Asset ID to download
     * @param {string|null} [transferParty=null] - Optional counter-party identifier
     * @returns {Promise<Object>} Download completion status and file information
     * 
     * @example
     * const result = await downloadRemoteAssetViaTransfer('contract-123', 'asset-456');
     */
    async function downloadRemoteAssetViaTransfer(contractId, assetId, transferParty = null) {
      if (_remoteLocalDownloadInFlightByContract.has(contractId)) {
        return { status: 409, error: 'Ya hay una descarga remota en curso para este contrato.', contractId, assetId };
      }
      _remoteLocalDownloadInFlightByContract.add(contractId);

      const sinkPublicBaseUrl = buildLocalDownloadSinkPublicBaseUrl();
      const sinkInternalBaseUrl = buildLocalDownloadSinkInternalBaseUrl();
      const transferAddress = String(transferParty?.address || '').trim() || (document.getElementById('transferAddress').value || '').trim();
      const counterPartyId = String(transferParty?.counterPartyId || '').trim();
      if (!transferAddress) {
        _remoteLocalDownloadInFlightByContract.delete(contractId);
        return { status: 400, error: 'Falta dirección DSP del partner para la transferencia remota.' };
      }

      // Limpiar registros previos del sink para evitar descargar archivos antiguos por error.
      try { await fetch(`${sinkPublicBaseUrl}/records`, { method: 'DELETE' }); } catch {}

      const dataplanesResp = await callApi('GET', '/v3/dataplanes', undefined, { silent: true, retries: 0 });
      const dataplanes = Array.isArray(dataplanesResp?.data) ? dataplanesResp.data : [];
      if (dataplanesResp.status >= 200 && dataplanesResp.status < 300 && dataplanes.length === 0) {
        _remoteLocalDownloadInFlightByContract.delete(contractId);
        return {
          status: 503,
          error: 'No hay dataplanes registrados en este conector para ejecutar la descarga remota.',
          transferAddress,
        };
      }

      const sinkBaseUrlForTransfer = shouldUsePublicSinkForRemoteTransfer(transferAddress)
        ? sinkPublicBaseUrl
        : sinkInternalBaseUrl;

      const path = `/ingest?contractId=${encodeURIComponent(contractId)}&assetId=${encodeURIComponent(assetId || '')}`;
      const transferReq = {
        '@context': { edc: 'https://w3id.org/edc/v0.0.1/ns/' },
        '@type': 'TransferRequest',
        protocol: 'dataspace-protocol-http:2025-1',
        counterPartyAddress: transferAddress,
        ...(counterPartyId ? { counterPartyId } : {}),
        contractId,
        transferType: 'HttpData-PUSH',
        dataDestination: {
          type: 'HttpData',
          baseUrl: sinkBaseUrlForTransfer,
          method: 'POST',
          path,
        }
      };

      const startResp = await callApi('POST', '/v3/transferprocesses', JSON.stringify(transferReq), { retries: 0 });
      const transferId = startResp?.data?.['@id'] || startResp?.data?.id || '';
      if (!(startResp.status >= 200 && startResp.status < 300) || !transferId) {
        _remoteLocalDownloadInFlightByContract.delete(contractId);
        return {
          status: startResp.status || 500,
          error: 'No se pudo iniciar la transferencia remota para descarga local.',
          transferRequest: transferReq,
          response: startResp,
        };
      }

      writeOut({
        status: 202,
        info: 'Transferencia remota iniciada para descarga local.',
        transferId,
        contractId,
        assetId,
      });

      // No bloquear la UI: continuar en segundo plano y devolver control inmediato.
      monitorRemoteDownloadAndFetch(contractId, transferId, assetId);
      return {
        status: 202,
        pendingRemoteTransfer: true,
        transferId,
        contractId,
        assetId,
        message: 'Transferencia remota iniciada en segundo plano. El archivo se descargará al completarse.',
        sinkBaseUrl: sinkBaseUrlForTransfer,
      };
    }

    function looksLikeSourceErrorPayload(text, contentType) {
      const sample = String(text || '').slice(0, 5000);
      const lower = sample.toLowerCase();
      if (String(contentType || '').toLowerCase().includes('text/html')) return true;
      if (lower.includes('<html') || lower.includes('sign in') || lower.includes('arcgis login')) return true;
      try {
        const parsed = JSON.parse(sample);
        if (parsed?.error) return true;
        if (typeof parsed?.message === 'string' && parsed.message.toLowerCase().includes('error')) return true;
      } catch {}
      return false;
    }

    /**
     * Validates that a source endpoint can be reached and returns valid data.
     * Tests connectivity to asset source URL with proper authentication headers.
     * Used to verify asset availability before publishing.
     * 
     * @async
     * @param {string} baseUrl - Base URL of the source
     * @param {string} path - API path on source
     * @param {Object} [headers={}] - Authentication headers for the request
     * @returns {Promise<Object>} Validation result with ok flag and response metadata
     * 
     * @example
     * const validation = await validateSourcePayloadPreview('https://api.example.com', '/data', {});
     */
    async function validateSourcePayloadPreview(baseUrl, path, headers) {
      const url = `${String(baseUrl || '').replace(/\/+$/, '')}${path || ''}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: headers || {},
          signal: controller.signal,
        });
        const text = await res.text();
        const contentType = res.headers.get('content-type') || '';
        const badPayload = looksLikeSourceErrorPayload(text, contentType);
        return {
          ok: res.ok && !badPayload,
          status: res.status,
          contentType,
          preview: text.slice(0, 240),
          url,
          badPayload,
        };
      } catch (e) {
        return {
          ok: true,
          inconclusive: true,
          url,
          error: String(e),
        };
      } finally {
        clearTimeout(timer);
      }
    }

    /**
     * Uploads a local asset file to the connector's local assets service.
     * Attempts multiple upload methods (raw, multipart) for compatibility.
     * Stores file and generates accessible public URL.
     * 
     * @async
     * @param {string} assetId - Asset ID for file association
     * @returns {Promise<Object>} Upload response with file info and public URL
     * 
     * @example
     * const result = await uploadLocalAssetSource('asset-123');
     */
    async function uploadLocalAssetSource(assetId) {
      const fileInput = document.getElementById('assetLocalFile');
      const file = fileInput?.files?.[0];
      if (!file) {
        return { status: 400, error: 'Selecciona un archivo local antes de publicar el asset.' };
      }

      const filename = file.name || `${assetId || 'asset'}.bin`;
      let baseCandidates = getLocalAssetsApiBaseUrlCandidates();
      baseCandidates = await prioritizeHealthyLocalAssetsCandidates(baseCandidates);
      let lastHttpFailure = null;

      // First try raw upload to avoid multipart/proxy edge cases.
      for (const baseUrl of baseCandidates) {
        try {
          const rawUrl = `${baseUrl}/upload-raw?filename=${encodeURIComponent(filename)}`;
          const rawRes = await fetch(rawUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
              'X-Filename': filename,
            },
            body: file,
          });
          const rawText = await rawRes.text();
          let rawData = rawText;
          try { rawData = JSON.parse(rawText); } catch {}
          if (rawRes.status >= 200 && rawRes.status < 300) {
            return { status: rawRes.status, data: rawData };
          }
          lastHttpFailure = {
            status: rawRes.status,
            error: 'Upload raw rechazado por el gateway/servicio local-assets.',
            endpoint: rawUrl,
            data: rawData,
          };
        } catch {}
      }

      for (const baseUrl of baseCandidates) {
        const formData = new FormData();
        formData.append('file', file, filename);
        try {
          const res = await fetch(`${baseUrl}/upload`, {
            method: 'POST',
            body: formData,
          });
          const text = await res.text();
          let data = text;
          try { data = JSON.parse(text); } catch {}
          if (res.status >= 200 && res.status < 300) {
            return { status: res.status, data };
          }
          lastHttpFailure = {
            status: res.status,
            error: 'Upload multipart rechazado por el gateway/servicio local-assets.',
            endpoint: `${baseUrl}/upload`,
            data,
          };
        } catch (error) {
          if (baseUrl === baseCandidates[baseCandidates.length - 1]) {
            return { status: 500, error: `No se pudo subir el archivo local: ${String(error)}` };
          }
        }
      }

      if (lastHttpFailure) {
        return {
          status: Number(lastHttpFailure.status || 502),
          error: lastHttpFailure.error,
          endpoint: lastHttpFailure.endpoint,
          data: lastHttpFailure.data,
          tried: baseCandidates,
        };
      }

      return { status: 502, error: 'No se pudo resolver una ruta de upload local-assets válida desde la UI.', tried: baseCandidates };
    }

    /**
     * Uploads a local asset image/icon file.
     * Handles image file selection from UI and uploads to local assets service.
     * Skips gracefully if no image selected.
     * 
     * @async
     * @param {string} assetId - Asset ID to associate image with
     * @returns {Promise<Object>} Upload response with image URL or skipped status
     * 
     * @example
     * const result = await uploadLocalAssetImage('asset-123');
     */
    async function uploadLocalAssetImage(assetId) {
      const fileInput = document.getElementById('assetImageFile');
      const file = fileInput?.files?.[0];
      if (!file) return { status: 204, skipped: true };

      const formData = new FormData();
      formData.append('file', file, file.name || `${assetId || 'asset'}-image.png`);

      try {
        const res = await fetch(`${getLocalAssetsApiBaseUrl()}/upload`, {
          method: 'POST',
          body: formData,
        });
        const text = await res.text();
        let data = text;
        try { data = JSON.parse(text); } catch {}
        return { status: res.status, data };
      } catch (error) {
        return { status: 500, error: `No se pudo subir la imagen local: ${String(error)}` };
      }
    }

    function syncAuthHeadersJson() {
      // Prevent recursive re-entry (e.g. if input events trigger sync again).
      if (syncAuthHeadersJson._running) return;
      syncAuthHeadersJson._running = true;
      try {
        const headersEl = document.getElementById('assetHeadersJson');
        if (!headersEl) return;
        const headers = buildAuthHeaders({});
        try {
          headersEl.value = JSON.stringify(headers, null, 2);
        } catch {
          // ignore if JSON can't be stringified
        }
      } finally {
        syncAuthHeadersJson._running = false;
      }
    }

    function applyAuthTypeForm() {
      const authType = document.getElementById('pubAuthType')?.value || 'none';
      const clientFields = document.getElementById('pubAuthClientFields');
      const tokenRow = document.getElementById('pubAuthTokenRow');
      const headerRow = document.getElementById('pubAuthHeaderRow');
      const tokenLabel = document.getElementById('pubAuthTokenLabel');
      const tokenInput = document.getElementById('pubAuthToken');
      const headerInput = document.getElementById('pubAuthHeader');
      const prefixInput = document.getElementById('pubAuthPrefix');
      const authSecretSelect = document.getElementById('pubAuthSecret');

      if (!clientFields || !tokenRow || !headerRow || !tokenLabel || !headerInput || !prefixInput || !tokenInput) return;

      if (authType === 'none') {
        clientFields.style.display = 'none';
        tokenRow.style.display = 'none';
        headerRow.style.display = 'none';
        tokenInput.readOnly = false;
        if (authSecretSelect) authSecretSelect.disabled = false;
      } else if (authType === 'oauth2') {
        clientFields.style.display = '';
        tokenRow.style.display = '';
        headerRow.style.display = '';
        tokenLabel.textContent = 'Token temporal';
        headerInput.placeholder = 'Authorization';
        prefixInput.placeholder = 'Bearer ';
        tokenInput.readOnly = false;
        if (authSecretSelect) authSecretSelect.disabled = false;
      } else if (authType === 'arcgis-login') {
        clientFields.style.display = 'none';
        tokenRow.style.display = 'none';
        headerRow.style.display = 'none';
        tokenLabel.textContent = 'Access token (login ArcGIS)';
        if (!headerInput.value) headerInput.value = 'Authorization';
        if (!prefixInput.value) prefixInput.value = 'Bearer ';
        headerInput.placeholder = 'Authorization';
        prefixInput.placeholder = 'Bearer ';
        tokenInput.value = getArcgisAccessTokenForPublish();
        tokenInput.readOnly = true;
        if (authSecretSelect) {
          authSecretSelect.value = '';
          authSecretSelect.disabled = true;
        }
      } else if (authType === 'apikey') {
        clientFields.style.display = 'none';
        tokenRow.style.display = '';
        headerRow.style.display = '';
        tokenLabel.textContent = 'API token';
        headerInput.placeholder = 'X-API-Key';
        prefixInput.placeholder = '';
        tokenInput.readOnly = false;
        if (authSecretSelect) authSecretSelect.disabled = false;
      } else {
        clientFields.style.display = 'none';
        tokenRow.style.display = '';
        headerRow.style.display = '';
        tokenLabel.textContent = 'Token';
        headerInput.placeholder = 'Authorization';
        prefixInput.placeholder = 'Bearer ';
        tokenInput.readOnly = false;
        if (authSecretSelect) authSecretSelect.disabled = false;
      }

      syncAuthHeadersJson();
      refreshArcgisTokenIndicator();
      refreshArcgisPublishAssist();
      refreshStarTrustPanel();
    }

    function parseJsonSafe(text, fallback = null) {
      try { return JSON.parse(text); } catch { return fallback; }
    }

    function buildPolicyFromTemplate(assetId, policyId) {
      const mode = document.getElementById('policyMode')?.value || 'form';
      if (mode === 'jsonld') {
        const custom = parseJsonSafe(document.getElementById('policyCustomJson')?.value || '', null);
        if (!custom) throw new Error('Policy JSON-LD inválido');
        return custom;
      }

      const accessLevel = (document.getElementById('policyAccessLevel')?.value || 'public').trim();
      const purpose = (document.getElementById('policyUsagePurpose')?.value || 'analytics').trim();
      const geography = (document.getElementById('policyGeography')?.value || 'local').trim();
      const dataCategory = (document.getElementById('policyDataCategory')?.value || 'energy').trim();
      const commercialUse = (document.getElementById('policyCommercialUse')?.value || 'no').trim();
      const expirationRaw = (document.getElementById('policyExpiration')?.value || '').trim();
      let expirationIso = '';
      if (expirationRaw) {
        const parsedDate = new Date(expirationRaw);
        if (!Number.isNaN(parsedDate.getTime())) expirationIso = parsedDate.toISOString();
      }

      const constraints = [];
      constraints.push({ leftOperand: 'dct:accessRights', operator: 'eq', rightOperand: accessLevel });
      constraints.push({ leftOperand: 'dct:purpose', operator: 'eq', rightOperand: purpose });
      constraints.push({ leftOperand: 'dct:spatial', operator: 'eq', rightOperand: geography });
      constraints.push({ leftOperand: 'dcat:theme', operator: 'eq', rightOperand: dataCategory });
      constraints.push({ leftOperand: 'eitel:commercialUse', operator: 'eq', rightOperand: commercialUse });
      if (expirationIso) constraints.push({ leftOperand: 'odrl:dateTime', operator: 'lteq', rightOperand: expirationIso });

      return {
        '@context': {
          odrl: 'http://www.w3.org/ns/odrl/2/',
          dcat: 'https://www.w3.org/ns/dcat#',
          dct: 'http://purl.org/dc/terms/',
          eitel: 'https://w3id.org/eitel/ns/'
        },
        '@id': policyId,
        '@type': 'http://www.w3.org/ns/odrl/2/Set',
        'dct:accessRights': accessLevel,
        'dct:purpose': purpose,
        'dct:spatial': geography,
        'dcat:theme': dataCategory,
        ...(expirationIso ? { 'dct:validUntil': expirationIso } : {}),
        permission: [{
          action: 'use',
          target: assetId,
          ...(constraints.length ? { constraint: constraints } : {})
        }],
        prohibition: [],
        obligation: []
      };
    }

    /**
     * Creates or updates a policy definition in the connector.
     * Parses policy JSON from UI input and posts to Management API.
     * Handles validation and displays success/error messages.
     * 
     * @async
     * @returns {Promise<Object>} API response with creation status
     * 
     * @example
     * await createOrUpdatePolicy(); // Creates policy from UI input
     */
    async function createOrUpdatePolicy() {
      const policyId = document.getElementById('policyIdPreview')?.value;
      const assetId = document.getElementById('assetIdPreview')?.value;
      if (!policyId || !assetId) { writeOut({ status: 400, error: 'Falta policyId o assetId.' }); return { status: 400 }; }
      let policy;
      try { policy = buildPolicyFromTemplate(assetId, policyId); } catch (e) { writeOut({ status: 400, error: String(e) }); return { status: 400 }; }

      const body = {
        '@context': { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' },
        '@id': policyId,
        '@type': 'PolicyDefinition',
        policy
      };
      const response = await callApi('POST', '/v3/policydefinitions', JSON.stringify(body));
      if (response.status >= 200 && response.status < 300) {
        upsertAssetBundleBackup({ assetId, policyId, policyBody: body });
        showInfoPopup('Policy creada/actualizada', { assetId, policyId, status: response.status });
      } else {
        showInfoPopup('Error creando policy', response);
      }
      return response;
    }

    /**
     * Retrieves all policy definitions from the connector.
     * Fetches policy list from Management API and displays in UI.
     * 
     * @async
     * @returns {Promise<Object>} API response with policy list
     * 
     * @example
     * await listPolicies(); // Reload and display all policies
     */
    async function listPolicies() {
      const r = await callApi('POST', '/v3/policydefinitions/request', q());
      writeOut(r);
      return r;
    }

    /**
     * Deletes a policy definition from the connector.
     * Removes selected policy by ID from Management API.
     * Refreshes policy list after deletion.
     * 
     * @async
     * @returns {Promise<Object>} API response with deletion status
     * 
     * @example
     * await deletePolicy(); // Delete selected policy from UI
     */
    async function deletePolicy() {
      const policyId = document.getElementById('policyIdPreview')?.value;
      if (!policyId) { writeOut({ status: 400, error: 'Policy ID requerido.' }); return; }
      writeOut(await callApi('DELETE', `/v3/policydefinitions/${encodeURIComponent(policyId)}`));
    }

    /**
     * Creates a new contract definition in the connector.
     * Generates contract definition linking asset and policy.
     * Posts definition to Management API for connector activation.
     * 
     * @async
     * @returns {Promise<Object>} API response with contract creation status
     * 
     * @example
     * await createContractDefinition(); // Create contract from UI selections
     */
    async function createContractDefinition() {
      const contractDefId = document.getElementById('contractDefIdPreview')?.value;
      const assetId = document.getElementById('assetIdPreview')?.value;
      const policyId = document.getElementById('policyIdPreview')?.value;
      if (!contractDefId || !assetId || !policyId) {
        writeOut({ status: 400, error: 'Faltan IDs de contractDef, asset o policy.' });
        return { status: 400 };
      }
      const body = {
        '@context': { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' },
        '@id': contractDefId,
        '@type': 'ContractDefinition',
        accessPolicyId: policyId,
        contractPolicyId: policyId,
        assetsSelector: [[{ '@type': 'Criterion', operandLeft: 'https://w3id.org/edc/v0.0.1/ns/id', operator: '=', operandRight: assetId }]]
      };
      const response = await callApi('POST', '/v3/contractdefinitions', JSON.stringify(body));
      if (response.status >= 200 && response.status < 300) {
        upsertAssetBundleBackup({ assetId, contractDefId, contractBody: body, policyId });
        showInfoPopup('Contract Definition creada/actualizada', { assetId, contractDefId, policyId, status: response.status });
      } else {
        showInfoPopup('Error creando Contract Definition', response);
      }
      return response;
    }

    /**
     * Retrieves all contract definitions from the connector.
     * Fetches contract list from Management API and displays in UI.
     * 
     * @async
     * @returns {Promise<Object>} API response with contract list
     * 
     * @example
     * await listContractDefinitions(); // Reload and display contracts
     */
    async function listContractDefinitions() {
      const r = await callApi('POST', '/v3/contractdefinitions/request', q());
      writeOut(r);
      return r;
    }

    /**
     * Deletes a contract definition from the connector.
     * Removes selected contract definition from Management API.
     * Refreshes contract list after deletion.
     * 
     * @async
     * @returns {Promise<Object>} API response with deletion status
     * 
     * @example
     * await deleteContractDefinition(); // Delete selected contract
     */
    async function deleteContractDefinition() {
      const id = document.getElementById('contractDefIdPreview')?.value;
      if (!id) { writeOut({ status: 400, error: 'ContractDefinition ID requerido.' }); return; }
      writeOut(await callApi('DELETE', `/v3/contractdefinitions/${encodeURIComponent(id)}`));
    }

    async function purgeConnectorArtifacts() {
      const removed = { contractDefinitions: 0, policyDefinitions: 0, assets: 0 };
      const contractDefs = unwrap(await callApi('POST', '/v3/contractdefinitions/request', q()));
      for (const c of contractDefs) {
        const id = c['@id'] || c.id;
        if (!id) continue;
        const d = await callApi('DELETE', `/v3/contractdefinitions/${encodeURIComponent(id)}`);
        if (d.status >= 200 && d.status < 300) removed.contractDefinitions++;
      }

      const policies = unwrap(await callApi('POST', '/v3/policydefinitions/request', q()));
      for (const p of policies) {
        const id = p['@id'] || p.id;
        if (!id) continue;
        const d = await callApi('DELETE', `/v3/policydefinitions/${encodeURIComponent(id)}`);
        if (d.status >= 200 && d.status < 300) removed.policyDefinitions++;
      }

      const assets = unwrap(await callApi('POST', '/v3/assets/request', q()));
      for (const a of assets) {
        const id = a['@id'] || a.id;
        if (!id) continue;
        const d = await callApi('DELETE', `/v3/assets/${encodeURIComponent(id)}`);
        if (d.status >= 200 && d.status < 300) removed.assets++;
      }

      await refreshOverview();
      writeOut({ purged: removed });
      showInfoPopup('Conector vaciado', { removed, note: 'Se eliminaron assets, policies y contract definitions del conector actual.' });
    }

    /**
     * Creates or updates an asset in the connector.
     * Handles local file uploads, metadata input, and publishes asset to Management API.
     * Supports multiple source types and authentication methods.
     * Triggers asset backup and handles various error scenarios.
     * 
     * @async
     * @returns {Promise<Object>} API response with asset creation/update status
     * 
     * @example
     * await createOrUpdateAsset(); // Create/update asset from UI input
     */
    async function createOrUpdateAsset() {
      const id = document.getElementById('assetIdPreview').value;
      const assetName = (document.getElementById('assetName').value || '').trim();
      const assetDescription = (document.getElementById('assetDescription')?.value || '').trim();
      const assetKeywords = parseKeywordList(document.getElementById('assetKeywords')?.value || '');
      let assetImageUrl = '';
      const sourceMode = getSelectedAssetSourceMode();

      const authType = sourceMode === 'local-file'
        ? 'none'
        : (document.getElementById('pubAuthType')?.value || 'none');
      let authToken = authType === 'arcgis-login'
        ? await resolveArcgisTokenForPublish()
        : resolveAuthTokenForPublish(authType);
      const authHeader = (document.getElementById('pubAuthHeader')?.value || '').trim();
      const authClientId = (document.getElementById('pubAuthClientId')?.value || '').trim();
      const authClientSecret = (document.getElementById('pubAuthClientSecret')?.value || '').trim();

      if (authType !== 'none') {
        if (!authHeader && authType !== 'arcgis-login') {
          writeOut({ status: 400, error: 'El campo "Header auth" es obligatorio para el tipo de autenticación seleccionado.' });
          return { status: 400 };
        }
        if (!authToken) {
          if (authType === 'arcgis-login' && typeof ensureArcgisLogin === 'function') {
            // Re-validate ArcGIS login and retry token retrieval one more time.
            await ensureArcgisLogin();
            authToken = await resolveArcgisTokenForPublish();
          }

          if (authToken) {
            // continue with publish
          } else {
          const msg = authType === 'arcgis-login'
            ? 'No se detectó access token de ArcGIS. Inicia sesión de nuevo y vuelve a intentarlo.'
            : 'El token/api token es obligatorio para el tipo de autenticación seleccionado.';
          writeOut({ status: 400, error: msg });
          return { status: 400 };
          }
        }
        if (authType === 'arcgis-login') {
          pushStarTrustEvent('ArcGIS listo para asset', `Se ha resuelto un token ArcGIS para publicar el asset ${clean(id || assetName || 'sin-id')}.`, 'ok');
        }
        if (authType === 'oauth2' && (!authClientId || !authClientSecret)) {
          writeOut({ status: 400, error: 'clientId y clientSecret son obligatorios para OAuth2.' });
          return { status: 400 };
        }
      }

      let headers = {};
      try { headers = JSON.parse(document.getElementById('assetHeadersJson').value || '{}'); } catch { writeOut({ status: 400, error: 'Headers JSON inválido.' }); return { status: 400 }; }

      let baseUrl = document.getElementById('assetBaseUrl').value.trim();
      let path = document.getElementById('assetPath').value.trim();
      let contentType = 'application/json';
      let localUploadInfo = null;

      if (sourceMode === 'local-file') {
        const uploadResp = await uploadLocalAssetSource(id);
        if (uploadResp.status < 200 || uploadResp.status >= 300) {
          writeOut(uploadResp);
          showInfoPopup('Error subiendo archivo local', uploadResp);
          return uploadResp;
        }
        localUploadInfo = uploadResp.data || {};
        baseUrl = String(localUploadInfo.internalBaseUrl || '').trim();
        path = String(localUploadInfo.path || '').trim();
        headers = {};
        contentType = String(localUploadInfo.contentType || 'application/octet-stream').trim();
      }

      const normalizedUrlParts = normalizeHttpDataUrlParts(baseUrl, path);
      baseUrl = normalizedUrlParts.baseUrl;
      path = normalizedUrlParts.path;

      if (authType === 'arcgis-login') {
        headers = {
          token: authToken
        };
        path = buildArcgisPathWithToken(path, authToken);
      } else {
        headers = buildAuthHeaders(headers);
      }

      if (authType !== 'none' && sourceMode !== 'local-file') {
        const sourcePreview = await validateSourcePayloadPreview(baseUrl, path, headers);
        if (!sourcePreview.ok) {
          showInfoPopup('Origen con error', {
            message: 'El endpoint origen devuelve una respuesta de error/login. No se publica el asset para evitar transferir errores al destino.',
            sourcePreview
          });
          writeOut({ status: 400, error: 'Endpoint origen no válido para transferencia', sourcePreview });
          return { status: 400, data: { sourcePreview } };
        }
      }

      const imageUploadResp = await uploadLocalAssetImage(id);
      if (imageUploadResp.status >= 400) {
        writeOut(imageUploadResp);
        showInfoPopup('Error subiendo imagen local', imageUploadResp);
        return imageUploadResp;
      }
      if (imageUploadResp.status >= 200 && imageUploadResp.status < 300) {
        const data = imageUploadResp.data || {};
        assetImageUrl = String(data.publicUrl || '').trim();
      }

      const body = {
        '@context': { edc: 'https://w3id.org/edc/v0.0.1/ns/' },
        '@id': id,
        '@type': 'Asset',
        properties: {
          name: assetName,
          title: assetName,
          description: assetDescription,
          keywords: assetKeywords.join(', '),
          'eitel:managedByConnector': connectorName,
          image: assetImageUrl,
          contenttype: contentType,
          'eitel:authType': authType,
          'eitel:sourceMode': sourceMode,
          'eitel:localAssetPublicUrl': localUploadInfo?.publicUrl || '',
          'eitel:localAssetFilename': localUploadInfo?.filename || '',
          'eitel:authSecret': document.getElementById('pubAuthSecret')?.value || '',
          'eitel:authClientId': document.getElementById('pubAuthClientId')?.value.trim() || '',
          'eitel:authClientSecret': document.getElementById('pubAuthClientSecret')?.value.trim() || '',
          'eitel:authToken': authType === 'arcgis-login' ? '' : (document.getElementById('pubAuthToken')?.value.trim() || ''),
          'eitel:authTokenSource': authType === 'arcgis-login' ? 'arcgis-login' : ''
        },
        dataAddress: {
          '@type': 'DataAddress',
          type: 'HttpData',
          baseUrl,
          method: 'GET',
          path,
          headers,
          // For ArcGIS token (client=referer), the EDC connector must send the Referer header.
          // EDC's HttpData extension forwards DataAddress properties with the 'header:' prefix as HTTP headers.
          ...(authType === 'arcgis-login' ? { 'header:Referer': window.location.origin } : {})
        }
      };
      const publishResp = await callApi('POST', '/v3/assets', JSON.stringify(body));
      if (publishResp.status >= 200 && publishResp.status < 300) {
        upsertAssetBundleBackup({
          assetId: id,
          assetName,
          authType,
          sourceMode,
          assetBody: body,
        });
        showInfoPopup('Asset publicado', {
          status: publishResp.status,
          assetId: id,
          name: assetName,
          description: assetDescription,
          keywords: assetKeywords,
          image: assetImageUrl,
          sourceMode,
          baseUrl,
          path,
          authType,
          localUpload: localUploadInfo,
          hint: 'El asset se ha creado/actualizado correctamente en Management API.'
        });
        if (starTrustConfig.enabled) {
          pushStarTrustEvent(
            'Asset preparado en nodo Star',
            `Asset ${clean(id || assetName || 'sin-id')} publicado con origen ${sourceMode === 'local-file' ? 'local y soberano' : 'remoto'}${authType === 'arcgis-login' ? ' usando token ArcGIS' : ''}.`,
            'ok'
          );
        }
      }
      if (authType === 'arcgis-login') {
        return {
          ...publishResp,
          requestPreview: {
            authMode: 'arcgis-header-token',
            baseUrl,
            path,
            headers: {
              token: authToken
            }
          },
        };
      }
      return publishResp;
    }

    /**
     * Deletes a published asset and cleans up associated local backups.
     * Removes asset from connector and deletes offline backup copy.
     * 
     * @async
     * @returns {Promise<Object>} API response with deletion status
     * 
     * @example
     * await deleteAssetAndCleanupBackup(); // Delete selected asset entirely
     */
    async function deleteAssetAndCleanupBackup() {
      const assetId = String(document.getElementById('assetIdPreview')?.value || '').trim();
      if (!assetId) return { status: 400, error: 'Asset ID requerido.' };
      const response = await callApi('DELETE', `/v3/assets/${encodeURIComponent(assetId)}`);
      if (response.status >= 200 && response.status < 300) {
        removeAssetBundleBackup(assetId);
      }
      return response;
    }

    async function restoreAssetsFromBackup(options = {}) {
      const onlyIfEmpty = options.onlyIfEmpty !== false;
      const localBackups = getAssetBundleBackups();
      const serverBackups = await listServerAssetBundleBackups();
      const merged = [...serverBackups, ...localBackups];
      const dedup = new Map();
      merged.forEach(row => {
        const id = String(row?.assetId || '').trim();
        if (!id) return;
        if (!dedup.has(id)) dedup.set(id, row);
      });
      const backups = [...dedup.values()];
      if (!backups.length) {
        const response = { status: 404, action: 'restore-from-backup', restored: 0, skipped: 0, message: 'No hay backups de assets ni en navegador ni en almacenamiento local persistente del conector.' };
        if (!options.silent) writeOut(response);
        return response;
      }

      const assetsResp = await callApi('POST', '/v3/assets/request', q(), { silent: true, retries: 0 });
      const existingAssets = new Set(unwrap(assetsResp).map(a => a['@id'] || a.id).filter(Boolean));
      if (onlyIfEmpty && existingAssets.size > 0) {
        const response = { status: 200, action: 'restore-from-backup', restored: 0, skipped: backups.length, message: 'No se restaura porque el conector ya tiene assets publicados.' };
        if (!options.silent) writeOut(response);
        return response;
      }

      const policiesResp = await callApi('POST', '/v3/policydefinitions/request', q(), { silent: true, retries: 0 });
      const contractsResp = await callApi('POST', '/v3/contractdefinitions/request', q(), { silent: true, retries: 0 });
      const existingPolicies = new Set(unwrap(policiesResp).map(p => p['@id'] || p.id).filter(Boolean));
      const existingContracts = new Set(unwrap(contractsResp).map(c => c['@id'] || c.id).filter(Boolean));

      let restored = 0;
      const errors = [];

      for (const bundle of backups.slice(0, 80)) {
        const assetId = String(bundle?.assetId || '').trim();
        if (!assetId || !bundle?.assetBody) continue;

        if (!existingAssets.has(assetId)) {
          const assetResp = await callApi('POST', '/v3/assets', JSON.stringify(bundle.assetBody), { silent: true, retries: 0 });
          if (assetResp.status >= 200 && assetResp.status < 300) {
            existingAssets.add(assetId);
            restored += 1;
          } else {
            errors.push({ assetId, stage: 'asset', status: assetResp.status, detail: assetResp.error || assetResp.message || '' });
            continue;
          }
        }

        const policyId = String(bundle?.policyId || bundle?.policyBody?.['@id'] || '').trim();
        if (policyId && bundle?.policyBody && !existingPolicies.has(policyId)) {
          const policyResp = await callApi('POST', '/v3/policydefinitions', JSON.stringify(bundle.policyBody), { silent: true, retries: 0 });
          if (policyResp.status >= 200 && policyResp.status < 300) existingPolicies.add(policyId);
        }

        const contractDefId = String(bundle?.contractDefId || bundle?.contractBody?.['@id'] || '').trim();
        if (contractDefId && bundle?.contractBody && !existingContracts.has(contractDefId)) {
          const contractResp = await callApi('POST', '/v3/contractdefinitions', JSON.stringify(bundle.contractBody), { silent: true, retries: 0 });
          if (contractResp.status >= 200 && contractResp.status < 300) existingContracts.add(contractDefId);
        }
      }

      await refreshOverview();
      await loadPublishedAssets(false);
      const response = {
        status: errors.length ? 207 : 200,
        action: 'restore-from-backup',
        restored,
        skipped: Math.max(0, backups.length - restored),
        errors,
      };
      if (!options.silent) {
        writeOut(response);
        showInfoPopup('Restauración de assets', response);
      }
      return response;
    }

    async function editPublishedAsset(assetId) {
      const id = String(assetId || '').trim();
      if (!id) return;
      const assetsResp = await callApi('POST', '/v3/assets/request', q(), { silent: true, retries: 0 });
      const assets = unwrap(assetsResp);
      const asset = assets.find(a => (a['@id'] || a.id || '') === id);
      if (!asset) {
        showInfoPopup('Asset no encontrado', { assetId: id });
        return;
      }
      const props = asset.properties || asset['edc:properties'] || {};
      const dataAddress = asset.dataAddress || asset['edc:dataAddress'] || {};
      const keyGuess = String(id || '').replace(/^asset-/, '');
      const setVal = (elId, value) => { const el = document.getElementById(elId); if (el) el.value = value; };
      setVal('assetKey', keyGuess);
      setVal('assetName', firstNonEmpty([props?.name, props?.title, clean(id)]));
      setVal('assetDescription', firstNonEmpty([props?.description, props?.['eitel:description'], '']));
      setVal('assetKeywords', parseKeywordList(props?.keywords || '').join(', '));
      setVal('assetBaseUrl', dataAddress?.baseUrl || '');
      setVal('assetPath', dataAddress?.path || '');
      if (typeof updateAssetPreview === 'function') updateAssetPreview();
      activateView('asset');
      showInfoPopup('Asset cargado para edición', { assetId: id, note: 'Revisa y pulsa Crear/Actualizar asset para guardar cambios.' });
    }

    /**
     * Deletes a single published asset from the connector.
     * Removes asset by ID from Management API.
     * 
     * @async
     * @param {string} assetId - Asset ID to delete
     * @returns {Promise<Object>} API response with deletion status
     * 
     * @example
     * await deletePublishedAsset('asset-123'); // Delete specific asset
     */
    async function deletePublishedAsset(assetId) {
      const id = String(assetId || '').trim();
      if (!id) return;
      const r = await callApi('DELETE', `/v3/assets/${encodeURIComponent(id)}`);
      if (r.status >= 200 && r.status < 300) {
        removeAssetBundleBackup(id);
        showInfoPopup('Asset eliminado', { assetId: id, status: r.status });
      } else {
        showInfoPopup('Error eliminando asset', { assetId: id, response: r });
      }
      await loadPublishedAssets(false);
      await refreshOverview();
    }

    async function ensurePolicyAndContractDefinition() {
      const assetId = document.getElementById('assetIdPreview').value;
      const policyId = document.getElementById('policyIdPreview')?.value;
      const contractDefId = document.getElementById('contractDefIdPreview')?.value;
      if (!policyId || !contractDefId) return { skipped: true };

      const existingPolicies = unwrap(await callApi('POST', '/v3/policydefinitions/request', q()));
      const policyExists = existingPolicies.some(p => (p['@id'] || p.id) === policyId);
      const policyResult = policyExists ? { status: 200, data: { message: 'Policy existente', id: policyId } } : await createOrUpdatePolicy();

      const contractDefs = unwrap(await callApi('POST', '/v3/contractdefinitions/request', q()));
      const duplicateById = contractDefs.find(c => (c['@id'] || c.id) === contractDefId);
      const duplicateByAsset = contractDefs.find(c => {
        const ac = c.assetsSelector?.[0]?.[0]?.rightValue || c.assetsSelector?.[0]?.[0]?.rightOperand;
        const cp = c.contractPolicyId || c['edc:contractPolicyId'];
        return ac === assetId && cp === policyId;
      });

      let contractResult;
      if (duplicateById || duplicateByAsset) {
        contractResult = { status: 200, data: { message: 'ContractDefinition existente', id: (duplicateById || duplicateByAsset)['@id'] || (duplicateById || duplicateByAsset).id } };
      } else {
        contractResult = await createContractDefinition();
      }
      return { policyResult, contractResult };
    }

    async function publishBundle() {
      const asset = await createOrUpdateAsset();
      const linked = await ensurePolicyAndContractDefinition();
      writeOut({ publish: 'bundle', asset, ...linked });
      await refreshOverview();
    }

    function mapCatalogRowsFromResponse(root, connectorId, address) {
      const datasets = root?.['dcat:dataset'] || root?.dataset || [];
      const list = Array.isArray(datasets) ? datasets : [datasets];
      const rows = list.flatMap(d => {
        const policiesRaw = d?.['odrl:hasPolicy'] || d?.hasPolicy || [];
        const policies = Array.isArray(policiesRaw) ? policiesRaw : [policiesRaw];
        const datasetId = d?.['@id'] || d?.id || '';
        const sourceHintUrl = pickBestSourceUrl(collectUrlCandidatesFromObject(d));
        const meta = extractDatasetMetadata(d);

        return policies.map(pol => {
          const permsRaw = pol?.['odrl:permission'] || pol?.permission || [];
          const perms = Array.isArray(permsRaw) ? permsRaw : [permsRaw];
          const target = perms.find(p => p?.['odrl:target'] || p?.target)?.['odrl:target'] || perms.find(p => p?.['odrl:target'] || p?.target)?.target || datasetId;
          return {
            offerId: pol?.['@id'] || pol?.id || '',
            assetId: datasetId || target,
            policyTarget: target || '',
            assigner: pol?.assigner || pol?.['odrl:assigner'] || connectorId,
            connectorId,
            counterPartyAddress: address,
            policySummary: summarizePolicyTerms(pol),
            policyRaw: pol,
            sourceHintUrl,
            assetTitle: meta.title,
            assetDescription: meta.description,
            assetKeywords: meta.keywords,
            assetImageUrl: meta.imageUrl,
          };
        });
      }).filter(x => x.offerId || x.assetId);

      return rows;
    }

    async function fetchCatalogRowsForConnector(connectorId) {
      const normalizedConnector = String(connectorId || '').trim() || 'provider';
      const address = buildDspUrl(normalizedConnector);
      const counterPartyId = resolveCounterPartyId(normalizedConnector, address);
      const response = await callApi('POST', '/v3/catalog/request', JSON.stringify({
        '@context': { edc: 'https://w3id.org/edc/v0.0.1/ns/' },
        '@type': 'CatalogRequest',
        counterPartyId,
        counterPartyAddress: address,
        protocol: 'dataspace-protocol-http:2025-1'
      }));
      const rows = mapCatalogRowsFromResponse(response?.data || {}, normalizedConnector, address);
      return { response, rows, connectorId: normalizedConnector, address };
    }

    function ensureDspVersion(url) {
      const trimmed = String(url || '').replace(/\/+$/, '');
      if (!trimmed) return trimmed;
      if (/\/api\/v1\/dsp\/2025-1$/i.test(trimmed)) return trimmed;
      if (/\/api\/v1\/dsp$/i.test(trimmed)) return `${trimmed}/2025-1`;
      return trimmed;
    }

    function getConfiguredConnectorDirectory() {
      const source = cfg.connectorDirectory;
      const parsed = (source && typeof source === 'object' && !Array.isArray(source))
        ? source
        : parseJsonSafe(String(source || '').trim(), {});
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

      const normalized = {};
      Object.entries(parsed).forEach(([key, value]) => {
        const normalizedKey = canonicalConnectorPrefix(key).toLowerCase();
        const url = String(value || '').trim();
        if (normalizedKey && url) normalized[normalizedKey] = ensureDspVersion(url);
      });
      return normalized;
    }

    function resolveConfiguredDspUrl(connectorId) {
      const raw = String(connectorId || '').trim();
      if (!raw) return '';

      const directory = getConfiguredConnectorDirectory();
      const canonical = canonicalConnectorPrefix(raw);
      const candidates = [raw, canonical, raw.toLowerCase(), canonical.toLowerCase()].filter(Boolean);

      for (const candidate of candidates) {
        const found = directory[String(candidate).toLowerCase()];
        if (found) return found;
      }
      return '';
    }

    // Construir URL DSP absoluta en base al conector remoto indicado por el usuario.
    function buildDspUrl(connectorId) {
      const raw = String(connectorId || 'provider').trim();
      if (!raw) return 'http://provider-connector:19103/api/v1/dsp/2025-1';

      const currentConnectorRaw = String(cfg?.connectorName || '').trim();
      const currentCanonical = canonicalConnectorPrefix(currentConnectorRaw).toLowerCase();
      const targetCanonical = canonicalConnectorPrefix(raw).toLowerCase();

      // Si el usuario consulta el mismo conector que aloja esta UI, usar DSP interno
      // para evitar pasar por WAF/proxy publico y reducir 502 intermitentes.
      if (currentCanonical && targetCanonical && currentCanonical === targetCanonical) {
        const internalHost = currentConnectorRaw.toLowerCase();
        if (internalHost) {
          return ensureDspVersion(`http://${internalHost}:11003/api/v1/dsp/2025-1`);
        }
      }

      // Si llega URL absoluta, normalizarla.
      if (raw.startsWith('http://') || raw.startsWith('https://')) {
        return ensureDspVersion(raw);
      }

      // Si llega ruta relativa (/conectorX/...), convertirla a absoluta en el host actual.
      if (raw.startsWith('/')) {
        return ensureDspVersion(`${window.location.origin}${raw}`);
      }

      const configuredUrl = resolveConfiguredDspUrl(raw);
      if (configuredUrl) {
        return ensureDspVersion(configuredUrl);
      }

      const connectorIdLower = raw.toLowerCase();
      if (connectorIdLower === 'provider') return 'http://provider-connector:19103/api/v1/dsp/2025-1';
      if (connectorIdLower === 'consumer') return 'http://consumer-connector:19203/api/v1/dsp/2025-1';

      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname.startsWith('127.');
      if (isLocalHost) {
        return ensureDspVersion(`http://${raw}-connector:19103/api/v1/dsp/2025-1`);
      }

      // Producción: resolver por mismo dominio público y prefijo canónico del conector remoto.
      const connectorPrefix = canonicalConnectorPrefix(raw);
      const publicOrigin = getPublicConnectorOrigin();
      return ensureDspVersion(`${publicOrigin}/${connectorPrefix}/api/v1/dsp/2025-1`);
    }

    function resolveCounterPartyId(connectorId, address) {
      const raw = String(connectorId || '').trim();
      if (raw && !raw.startsWith('http://') && !raw.startsWith('https://') && !raw.startsWith('/')) return raw;
      try {
        const url = new URL(address);
        const segment = (url.pathname || '/').split('/').filter(Boolean)[0] || '';
        return segment || PROD_CONNECTOR_ID;
      } catch {
        return PROD_CONNECTOR_ID;
      }
    }

    async function loadCatalogs(showOutput = true) {
      const connectorId = (document.getElementById('searchConnectorId').value || 'provider').trim() || 'provider';
      const { response, rows, address } = await fetchCatalogRowsForConnector(connectorId);
      document.getElementById('resolvedAddress').value = address;
      document.getElementById('transferAddress').value = address;
      state.catalogRows = rows;
      renderCatalogShowcase(state.catalogRows);
      refreshCatalogAssetOptions();
      syncCatalogSelectionState();
      if (showOutput) writeOut(response);
    }

    async function loadCatalogShowcase(showOutput = true) {
      const connectors = parseConnectorCandidates();
      const allRows = [];
      const connectorSummaries = [];

      for (const connectorId of connectors) {
        const result = await fetchCatalogRowsForConnector(connectorId);
        if (result?.response?.status >= 200 && result?.response?.status < 300) {
          allRows.push(...(result.rows || []));
        }
        connectorSummaries.push({
          connectorId,
          status: result?.response?.status || 0,
          assets: (result.rows || []).length,
          dspUrl: result?.address || ''
        });
      }

      const dedupe = new Map();
      allRows.forEach(row => {
        const key = `${row.connectorId}::${row.assetId}::${row.offerId}`;
        if (!dedupe.has(key)) dedupe.set(key, row);
      });
      state.catalogRows = [...dedupe.values()];
      if (!state.catalogRows.length) {
        const localAssetsResp = await callApi('POST', '/v3/assets/request', q(), { silent: true, retries: 0 });
        const localAssets = unwrap(localAssetsResp);
        state.catalogRows = mapPublishedAssetsToCatalogVisualRows(localAssets);
      }

      renderCatalogShowcase(state.catalogRows);
      refreshCatalogAssetOptions();
      syncCatalogSelectionState();

      if (showOutput) {
        writeOut({
          status: 200,
          action: 'catalog-showcase',
          connectors: connectorSummaries,
          totalAssets: state.catalogRows.length,
        });
      }
      state.catalogShowcaseLoaded = state.catalogRows.length > 0;
    }

    async function requestContractByAsset() {
      const actionBtn = document.getElementById('btnRequestContract');
      if (actionBtn) {
        actionBtn.disabled = true;
        actionBtn.textContent = 'Procesando...';
      }
      const acceptedTerms = document.getElementById('catalogAcceptTerms')?.checked;
      if (!acceptedTerms) {
        writeOut({ status: 400, error: 'Debes aceptar los términos de uso de la política antes de solicitar contrato.' });
        if (actionBtn) {
          actionBtn.disabled = false;
          actionBtn.textContent = 'Realizar contrato';
        }
        return;
      }

      const selectedIdxRaw = document.getElementById('catalogAssetId').value;
      if (selectedIdxRaw === '') {
        writeOut({ status: 400, error: 'Selecciona un data-offer del desplegable.' });
        if (actionBtn) {
          actionBtn.disabled = false;
          actionBtn.textContent = 'Realizar contrato';
        }
        return;
      }
      if (!state.catalogRows.length) await loadCatalogShowcase(false);

      const selected = state.catalogRows[Number(selectedIdxRaw)];
      if (!selected) {
        writeOut({ status: 404, error: 'No se encontró ese asset en el catálogo.' });
        if (actionBtn) {
          actionBtn.disabled = false;
          actionBtn.textContent = 'Realizar contrato';
        }
        return;
      }

      if (starTrustConfig.enabled) {
        starTrustState.lastCounterParty = selected.connectorId || selected.assigner || '';
        starTrustState.lastAssetId = selected.assetId || '';
        starTrustState.handshakeState = 'resolving';
        starTrustState.handshakeDetail = `Preparando handshake con ${selected.connectorId || selected.assigner || 'participant'} para el asset ${clean(selected.assetId || '-')}. Se resolverá el endpoint remoto y el material de confianza disponible.`;
        pushStarTrustEvent('Inicio de handshake', starTrustState.handshakeDetail, 'info');
      }

      if (!selected.offerId) {
        writeOut({
          status: 400,
          error: 'La oferta del catálogo no tiene policy/@id. Recarga catálogos y selecciona otro asset.',
          selected
        });
        if (actionBtn) {
          actionBtn.disabled = false;
          actionBtn.textContent = 'Realizar contrato';
        }
        return;
      }

      if (selected.counterPartyAddress) {
        const resolvedAddressInput = document.getElementById('resolvedAddress');
        const transferAddressInput = document.getElementById('transferAddress');
        const connectorInput = document.getElementById('searchConnectorId');
        const selectedConnector = document.getElementById('catalogSelectedConnector');
        if (resolvedAddressInput) resolvedAddressInput.value = selected.counterPartyAddress;
        if (transferAddressInput) transferAddressInput.value = selected.counterPartyAddress;
        if (connectorInput) connectorInput.value = selected.connectorId || connectorInput.value;
        if (selectedConnector) selectedConnector.value = selected.connectorId || '';
      }

      const policy = selected.policyRaw
        ? JSON.parse(JSON.stringify(selected.policyRaw))
        : {};

      // Para ContractRequest, EDC espera los términos ODRL compactados (assigner/target)
      // con el contexto oficial ODRL JSON-LD.
      policy['@context'] = 'http://www.w3.org/ns/odrl.jsonld';
      policy['@type'] = 'odrl:Offer';
      policy['@id'] = policy['@id'] || selected.offerId;
      const resolvedAssigner = (policy.assigner || policy['odrl:assigner'] || selected.assigner || 'provider').toString().trim();
      policy.assigner = resolvedAssigner || 'provider';
      // Forzar el asset real del dataset seleccionado; algunas policies publicadas traen target placeholder.
      const resolvedTarget = (selected.assetId || policy.target || policy['odrl:target'] || selected.policyTarget || '').toString().trim();
      policy.target = resolvedTarget;
      policy['odrl:target'] = resolvedTarget;

      const normalizeRuleTarget = (rule) => {
        if (!rule || typeof rule !== 'object') return rule;
        const resolved = (selected.assetId || rule.target || rule['odrl:target'] || selected.policyTarget || '').toString().trim();
        return { ...rule, target: resolved, 'odrl:target': resolved };
      };

      if (!resolvedTarget) {
        writeOut({ status: 400, error: 'No se pudo determinar el target del asset para la negociación.' });
        if (actionBtn) {
          actionBtn.disabled = false;
          actionBtn.textContent = 'Realizar contrato';
        }
        return;
      }

      if (!Array.isArray(policy.permission)) policy.permission = policy.permission ? [policy.permission] : [];
      if (!Array.isArray(policy.prohibition)) policy.prohibition = policy.prohibition ? [policy.prohibition] : [];
      if (!Array.isArray(policy.obligation)) policy.obligation = policy.obligation ? [policy.obligation] : [];
      policy.permission = policy.permission.map(normalizeRuleTarget);
      policy.prohibition = policy.prohibition.map(normalizeRuleTarget);
      policy.obligation = policy.obligation.map(normalizeRuleTarget);

      const beforeAgreementsResp = await callApi('POST', '/v3/contractagreements/request', q());
      const beforeAgreementIds = new Set(unwrap(beforeAgreementsResp).map(a => a['@id'] || a.id).filter(Boolean));

      const r = await callApi('POST', '/v3/contractnegotiations', JSON.stringify({
        '@context': { edc: 'https://w3id.org/edc/v0.0.1/ns/' },
        '@type': 'ContractRequest',
        protocol: 'dataspace-protocol-http:2025-1',
        counterPartyAddress: document.getElementById('resolvedAddress').value,
        policy
      }));
      if (starTrustConfig.enabled) {
        if (r.status >= 200 && r.status < 300) {
          starTrustState.handshakeState = 'negotiating';
          starTrustState.handshakeDetail = `Negociación enviada al participante ${selected.connectorId || selected.assigner || 'remoto'} en ${document.getElementById('resolvedAddress').value || '-'}. El coordinador ya no interviene en tiempo real.`;
          pushStarTrustEvent('Negociación P2P enviada', starTrustState.handshakeDetail, 'info');
        } else {
          starTrustState.handshakeState = 'failed';
          starTrustState.handshakeDetail = `No se pudo iniciar la negociación con ${selected.connectorId || selected.assigner || 'el participante remoto'}.`;
          pushStarTrustEvent('Handshake fallido', `${starTrustState.handshakeDetail} HTTP ${r.status}.`, 'danger');
        }
      }
      writeOut(r);

      if (r.status < 200 || r.status >= 300) {
        const detail = typeof r.data === 'string' ? r.data : JSON.stringify(r.data || {}, null, 2);
        showInfoPopup(
          'Aviso',
          `No se pudo iniciar el contrato.\nEstado HTTP: ${r.status}.\nDetalle: ${detail}`,
          { plainText: true }
        );
        if (actionBtn) {
          actionBtn.disabled = false;
          actionBtn.textContent = 'Realizar contrato';
        }
        return;
      }

      const negotiationId = r.data?.['@id'] || r.data?.id || '-';
      showInfoPopup(
        'Aviso',
        `Solicitud enviada correctamente.\nNegotiation ID: ${negotiationId}\nEstamos comprobando automáticamente cuándo aparece el contrato en la pestaña Contratos.`,
        { plainText: true }
      );

      if (actionBtn) {
        actionBtn.disabled = false;
        actionBtn.textContent = 'Realizar contrato';
      }

      // Espera corta para que el agreement aparezca si la negociación finaliza rápido.
      let createdAgreement = null;
      for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        const agreementsResp = await callApi('POST', '/v3/contractagreements/request', q());
        const agreements = unwrap(agreementsResp);
        const fresh = agreements.find(a => {
          const id = a['@id'] || a.id;
          return id && !beforeAgreementIds.has(id);
        });
        if (fresh) {
          createdAgreement = fresh;
          break;
        }
      }

      await listAgreements();

      if (createdAgreement) {
        const agreementId = createdAgreement['@id'] || createdAgreement.id;
        const assetId = createdAgreement.assetId || createdAgreement['edc:assetId'] || selected.assetId;
        const providerId = createdAgreement.providerId || createdAgreement['edc:providerId'] || selected.assigner;
        const consumerId = createdAgreement.consumerId || createdAgreement['edc:consumerId'] || connectorName;
        if (agreementId) {
          const hint = String(selected.sourceHintUrl || '').trim();
          if (hint) agreementSourceHints.set(agreementId, hint);
        }
        if (starTrustConfig.enabled) {
          starTrustState.lastAgreementId = agreementId || '';
          starTrustState.handshakeState = 'agreed';
          starTrustState.handshakeDetail = `Handshake preparado con ${providerId || selected.assigner || 'provider'} para el asset ${clean(assetId || selected.assetId || '-')}. Agreement ${clean(agreementId || '-')}.`;
          pushStarTrustEvent('Contrato disponible', starTrustState.handshakeDetail, 'ok');
        }
        showInfoPopup('Aviso', `Contrato concretado correctamente.\nAgreement ID: ${agreementId}\nNegotiation ID: ${negotiationId}\nAsset: ${assetId}\nProvider: ${providerId}\nConsumer: ${consumerId}`, {
          plainText: true,
          actionLabel: 'Ir al contrato',
          onAction: () => window.useAgreement(agreementId)
        });
      } else {
        if (starTrustConfig.enabled) {
          starTrustState.handshakeState = 'negotiating';
          starTrustState.handshakeDetail = `La negociación ${clean(negotiationId)} sigue en curso. La UI seguirá reflejando que el handshake está pendiente de acuerdo.`;
          pushStarTrustEvent('Handshake en espera', starTrustState.handshakeDetail, 'warn');
        }
        showInfoPopup(
          'Aviso',
          `Negociación iniciada correctamente (ID: ${negotiationId}), pero el contrato todavía no aparece en la lista. Espera unos segundos y revisa la pestaña Contratos.`,
          { plainText: true }
        );
      }
    }

    /**
     * Retrieves all catalog agreements (purchase contracts) from connector.
     * Fetches active agreements where this connector is data provider or consumer.
     * Displays agreements in catalog view with counter-party and asset information.
     * 
     * @async
     * @returns {Promise<Object>} API response with agreement list
     * 
     * @example
     * await listAgreements(); // Load all available agreements
     */
    async function listAgreements() {
      const r = await callApi('POST', '/v3/contractagreements/request', q());
      const raw = unwrap(r).map(a => ({
        id: a['@id'] || a.id || '',
        asset: a.assetId || a['edc:assetId'] || a.asset || '',
        provider: a.providerId || a['edc:providerId'] || a.provider || '',
        consumer: a.consumerId || a['edc:consumerId'] || a.consumer || '',
        publishedAt: a.contractSigningDate || a['edc:contractSigningDate'] || a.createdAt || a.created || a['edc:createdAt'] || '',
        cp: a.counterPartyId || ''
      })).filter(x => x.id);

      const seenId = new Set();
      const seenTuple = new Set();
      state.agreementRows = raw.filter(a => {
        if (seenId.has(a.id)) return false;
        const tuple = `${a.asset}::${a.provider}::${a.consumer}`;
        if (seenTuple.has(tuple)) return false;
        seenId.add(a.id);
        seenTuple.add(tuple);
        return true;
      });

      const tbody = document.getElementById('tblAgreements');
      const sel = document.getElementById('agreementSelect');
      sel.innerHTML = state.agreementRows.length ? '' : '<option value="">No hay contratos</option>';

      if (!state.agreementRows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted">No hay contratos.</td></tr>';
      } else {
        tbody.innerHTML = state.agreementRows.map((a, i) => {
          const alias = `Contrato ${i + 1} · ${clean(a.asset || 'asset')}`;
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = `${alias} · ${fmtDate(a.publishedAt)}`;
          sel.appendChild(opt);
          return `
            <tr>
              <td class="title-cell" title="${a.id}">${alias}</td>
              <td class="title-cell" title="${a.asset}">${clean(a.asset)}</td>
              <td>${a.provider || '-'}</td>
              <td>${a.consumer || (a.cp || '-')}</td>
              <td>${fmtDate(a.publishedAt)}</td>
              <td>
                <button class="ghost" onclick="window.showAgreementDetail(${i})">Detalle</button>
                <button class="ghost" onclick="window.useAgreement('${a.id.replace(/'/g, "\\'")}')">Usar</button>
              </td>
            </tr>
          `;
        }).join('');
      }
      const deduplicated = raw.length - state.agreementRows.length;
      const selectedNow = (document.getElementById('agreementSelect')?.value || '').trim();
      if (selectedNow) syncTransferAddressFromAgreement(selectedNow);
      try { refreshStarTrustPanel(); } catch {}
      writeOut({ ...r, deduplicated });
      showInfoPopup('Contratos cargados', {
        total: state.agreementRows.length,
        deduplicated,
        preview: state.agreementRows.slice(0, 5)
      });
    }

    async function startTransfer() {
      if (transferStartInFlight) {
        writeOut({ status: 409, error: 'Ya hay una transferencia iniciándose. Espera unos segundos.' });
        return;
      }

      const startBtn = document.getElementById('btnStartTransfer');
      transferStartInFlight = true;
      if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = 'Iniciando...';
      }

      try {
      const typedContractId = (document.getElementById('agreementId').value || '').trim();
      const selectedContractId = (document.getElementById('agreementSelect').value || '').trim();
      const contractId = (typedContractId || selectedContractId || '').trim();
      const transferMode = getSelectedTransferMode();
      const sinkBaseUrl = (document.getElementById('sinkBaseUrl').value || '').trim();
      if (!contractId) { writeOut({ status: 400, error: 'Selecciona un contrato.' }); return; }
      if (transferMode === 'push' && (!sinkBaseUrl || !/^https?:\/\//i.test(sinkBaseUrl))) {
        writeOut({ status: 400, error: 'Destination URL inválida. Debe empezar por http:// o https://.' });
        return;
      }

      // Validación fuerte: solo permitir contratos vigentes del conector
      const agreementsResp = await callApi('POST', '/v3/contractagreements/request', q());
      const validAgreementIds = new Set(
        unwrap(agreementsResp)
          .map(a => a['@id'] || a.id)
          .filter(Boolean)
      );
      const selectedAgreement = unwrap(agreementsResp).find(a => (a['@id'] || a.id || '') === contractId) || null;
      const agreementAssetId = selectedAgreement?.assetId || selectedAgreement?.['edc:assetId'] || state.agreementRows.find(a => a.id === contractId)?.asset || '';
      const transferParty = resolveTransferParty(contractId, selectedAgreement);
      if (starTrustConfig.enabled) {
        starTrustState.lastAgreementId = contractId;
        starTrustState.lastAssetId = agreementAssetId || starTrustState.lastAssetId;
        starTrustState.lastCounterParty = transferParty?.counterPartyId || transferParty?.providerRaw || starTrustState.lastCounterParty;
        starTrustState.transferState = 'preparing';
        starTrustState.transferDetail = `Preparando transferencia directa para el contrato ${clean(contractId)} hacia ${transferParty?.address || document.getElementById('transferAddress').value.trim() || '-'}.`;
        pushStarTrustEvent('Preparación de transferencia', starTrustState.transferDetail, 'info');
      }
      if (transferParty?.address) {
        const transferAddressInput = document.getElementById('transferAddress');
        if (transferAddressInput) transferAddressInput.value = transferParty.address;
      }

      if (!validAgreementIds.has(contractId)) {
        showInfoPopup('Contrato no reconocido', {
          message: 'Ese contrato no existe o ya no es válido en este conector. Carga contratos y selecciona uno del desplegable.',
          selectedOrTypedContractId: contractId,
          availableContracts: state.agreementRows.slice(0, 10).map(a => ({
            id: a.id,
            asset: a.asset,
            provider: a.provider,
            consumer: a.consumer,
            publishedAt: a.publishedAt
          }))
        });
        writeOut({ status: 400, error: 'Contract agreement not found/valid for transfer', contractId });
        return;
      }

      const activeTransfersResp = await callApi('POST', '/v3/transferprocesses/request', q(), { retries: 0 });
      const activeByContract = unwrap(activeTransfersResp).find(tp => {
        const tpContractId = tp.contractId || tp['edc:contractId'] || '';
        const tpState = tp.state || tp['edc:state'] || '';
        return tpContractId === contractId && !isTransferTerminalState(tpState);
      });
      if (activeByContract || _remoteLocalDownloadInFlightByContract.has(contractId)) {
        const activeState = normalizeTransferState(activeByContract?.state || activeByContract?.['edc:state'] || '-');
        showInfoPopup('Transferencia ya en curso', {
          message: 'Ya existe una transferencia activa para este contrato. Espera a que termine antes de crear otra.',
          contractId,
          activeTransferId: activeByContract?.['@id'] || activeByContract?.id || '',
          activeState
        });
        writeOut({ status: 409, error: 'Ya hay una transferencia activa para este contrato.', contractId, activeState });
        return;
      }

      if (transferMode === 'local-download') {
        let downloadResp = await downloadAssetLocally(contractId, agreementAssetId);
        if (downloadResp?.status === 404) {
          const hintedUrl = agreementSourceHints.get(contractId) || '';
          if (hintedUrl) {
            const hintedResp = await downloadFromSourceHint(contractId, agreementAssetId, hintedUrl);
            if (hintedResp?.status >= 200 && hintedResp?.status < 300) {
              downloadResp = hintedResp;
            }
          }
        }
        // Si el asset no existe localmente (contrato remoto), usar transferencia EDC al sink local.
        if (downloadResp?.status === 404) {
          downloadResp = await downloadRemoteAssetViaTransfer(contractId, agreementAssetId, transferParty);
        }
        const localTransfer = addLocalTransferRecord(buildLocalTransferRecord(downloadResp));
        if (starTrustConfig.enabled) {
          starTrustState.lastTransferId = localTransfer.id || '';
          starTrustState.transferState = downloadResp.status >= 200 && downloadResp.status < 300 ? 'completed' : 'failed';
          starTrustState.transferDetail = downloadResp.status >= 200 && downloadResp.status < 300
            ? `El consumidor ha obtenido el dato ${clean(downloadResp.filename || agreementAssetId || '-')} directamente desde el nodo proveedor.`
            : `La descarga directa del asset ${clean(agreementAssetId || '-')} no se ha completado correctamente.`;
          pushStarTrustEvent(downloadResp.status >= 200 && downloadResp.status < 300 ? 'Transferencia directa completada' : 'Transferencia directa con error', starTrustState.transferDetail, downloadResp.status >= 200 && downloadResp.status < 300 ? 'ok' : 'danger');
        }
        writeOut(downloadResp);
        await refreshOverview();
        await listTransfers();
        if (downloadResp.status >= 200 && downloadResp.status < 300) {
          showInfoPopup('Descarga iniciada', {
            transferId: localTransfer.id,
            contractId,
            assetId: agreementAssetId,
            filename: downloadResp.filename,
            bytes: downloadResp.bytes,
            sourceUrl: downloadResp.sourceUrl,
            message: 'El navegador ha iniciado la descarga local. Normalmente se guardará en Descargas según tu configuración del navegador.'
          });
        } else {
          showInfoPopup('Error en descarga local', downloadResp);
        }
        return;
      }

      if (transferMode === 'arcgis-upload') {
        const uploadResp = await uploadTransferToArcgis(contractId, agreementAssetId, transferParty);
        const localTransfer = addLocalTransferRecord(buildLocalTransferRecord(uploadResp));
        if (starTrustConfig.enabled) {
          starTrustState.lastTransferId = localTransfer.id || '';
          starTrustState.transferState = uploadResp.status >= 200 && uploadResp.status < 300 ? 'completed' : 'failed';
          starTrustState.transferDetail = uploadResp.status >= 200 && uploadResp.status < 300
            ? `El dato ${clean(uploadResp.filename || agreementAssetId || '-')} se ha cargado en ArcGIS tras la transferencia directa.`
            : `La subida a ArcGIS tras la transferencia del asset ${clean(agreementAssetId || '-')} ha fallado.`;
          pushStarTrustEvent(uploadResp.status >= 200 && uploadResp.status < 300 ? 'Carga ArcGIS completada' : 'Carga ArcGIS fallida', starTrustState.transferDetail, uploadResp.status >= 200 && uploadResp.status < 300 ? 'ok' : 'danger');
        }
        writeOut(uploadResp);
        await refreshOverview();
        await listTransfers();
        if (uploadResp.status >= 200 && uploadResp.status < 300) {
          showInfoPopup('Subida a ArcGIS completada', {
            transferId: localTransfer.id,
            contractId,
            assetId: agreementAssetId,
            itemId: uploadResp.itemId,
            title: uploadResp.title,
            filename: uploadResp.filename,
          });
        } else {
          showInfoPopup('Error subiendo a ArcGIS', uploadResp);
        }
        return;
      }

      const dataplanesResp = await callApi('GET', '/v3/dataplanes', undefined, { silent: true, retries: 0 });
      const dataplanes = Array.isArray(dataplanesResp?.data) ? dataplanesResp.data : [];
      if (dataplanesResp.status >= 200 && dataplanesResp.status < 300 && dataplanes.length === 0) {
        showInfoPopup('Transferencia bloqueada: sin dataplane', {
          message: 'Este conector no tiene dataplanes registrados. Si inicias la transferencia se quedará en STARTED.',
          transferId: null,
          hint: 'Despliega/activa dataplane y vuelve a intentar. Puedes usar el botón "⚙️ Dataplanes" para verificarlo.'
        });
        writeOut({ status: 503, error: 'No hay dataplanes registrados en este conector.' });
        return;
      }

      const body = {
        '@context': { edc: 'https://w3id.org/edc/v0.0.1/ns/' },
        '@type': 'TransferRequest',
        protocol: 'dataspace-protocol-http:2025-1',
        counterPartyAddress: transferParty?.address || document.getElementById('transferAddress').value.trim(),
        ...(transferParty?.counterPartyId ? { counterPartyId: transferParty.counterPartyId } : {}),
        contractId,
        transferType: 'HttpData-PUSH',
        dataDestination: {
          type: 'HttpData',
          baseUrl: sinkBaseUrl,
          method: 'POST',
          path: '/'
        }
      };

      const r = await callApi('POST', '/v3/transferprocesses', JSON.stringify(body));
      if (starTrustConfig.enabled) {
        starTrustState.transferState = r.status >= 200 && r.status < 300 ? 'running' : 'failed';
        starTrustState.transferDetail = r.status >= 200 && r.status < 300
          ? `La transferencia ${clean(r?.data?.['@id'] || r?.data?.id || contractId)} ha sido aceptada. El dato viajará de nodo a nodo sin pasar por el coordinador.`
          : `La transferencia del contrato ${clean(contractId)} no ha podido iniciarse.`;
        pushStarTrustEvent(r.status >= 200 && r.status < 300 ? 'Transferencia P2P iniciada' : 'Inicio de transferencia fallido', starTrustState.transferDetail, r.status >= 200 && r.status < 300 ? 'info' : 'danger');
      }
      writeOut(r);

      const transferId = r?.data?.['@id'] || r?.data?.id || '';
      if (r.status >= 200 && r.status < 300) {
        if (starTrustConfig.enabled) starTrustState.lastTransferId = transferId || '';
        showInfoPopup('Transferencia iniciada', {
          status: r.status,
          transferId,
          contractId,
          message: 'La transferencia se ha enviado. Se refresca la lista automáticamente. Monitorizando estado...'
        });
        await listTransfers();
        if (transferId) {
          // Iniciar polling de estado hasta que la transferencia sea terminal
          pollTransferUntilDone(transferId);
        }
      } else {
        await listTransfers();
      }
      } finally {
        transferStartInFlight = false;
        if (startBtn) {
          startBtn.disabled = false;
          startBtn.textContent = getSelectedTransferMode() === 'local-download'
            ? 'Descargar en local'
            : (getSelectedTransferMode() === 'arcgis-upload' ? 'Subir a ArcGIS' : 'Iniciar transferencia');
        }
      }
    }

    const TRANSFER_STATE_COLORS = {
      INITIAL: 'color:#888',
      PROVISIONING: 'color:#f5a623',
      PROVISIONED: 'color:#f5a623',
      REQUESTED: 'color:#4a90e2',
      STARTED: 'color:#2ac37a;font-weight:bold',
      SUSPENDED: 'color:#e67e22',
      COMPLETED: 'color:#27ae60;font-weight:bold',
      TERMINATED: 'color:#c0392b;font-weight:bold',
      FAILED: 'color:#c0392b;font-weight:bold',
    };

    /**
     * Retrieves all transfer processes from connector API.
     * Fetches completed, active, and failed transfers.
     * Combines local storage records with remote API data.
     * 
     * @async
     * @returns {Promise<Object>} API response with transfer list
     * 
     * @example
     * await listTransfers(); // Load all transfer records
     */
    async function listTransfers() {
      const r = await callApi('POST', '/v3/transferprocesses/request', q());
      const rows = getAllTransferRows(unwrap(r));
      const tbody = document.getElementById('tblTransfers');
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="muted">No hay transferencias.</td></tr>';
      } else {
        tbody.innerHTML = rows.map((t, i) => {
          const id = t['@id'] || t.id || '';
          const st = normalizeTransferState(t.state || t['edc:state'] || '-');
          const style = TRANSFER_STATE_COLORS[st] || '';
          const contract = t.contractId || t['edc:contractId'] || '';
          const errorDetail = t.errorDetail || t['edc:errorDetail'] || '';
          const errorTip = errorDetail ? ` title="${errorDetail.replace(/"/g, '&quot;')}"` : '';
          const isTerminal = isTransferTerminalState(t.state || t['edc:state'] || '');
          const title = t.localDownload ? `Descarga local · ${clean(t.filename || id)}` : `Transferencia ${i + 1}`;
          return `
            <tr>
              <td class="title-cell" title="${id}">${title}</td>
              <td><span style="${style}"${errorTip}>${st}${errorDetail ? ' ⚠️' : ''}</span></td>
              <td class="title-cell" title="${contract}">${clean(contract)}</td>
              <td>
                <button class="ghost" onclick="window.showTransferDetail(${i})">Detalle</button>
                <button class="ghost" onclick="window.retryTransferMonitor('${id.replace(/'/g, "\\'")}')">Estado</button>
                ${!isTerminal && !t.localDownload ? `<button class="danger" onclick="window.terminateTransfer('${id.replace(/'/g, "\\'")}')">Terminar</button>` : ''}
                <button class="danger" onclick="window.deleteTransferRecord('${id.replace(/'/g, "\\'")}', ${t.localDownload ? 'true' : 'false'})">Borrar</button>
              </td>
            </tr>
          `;
        }).join('');
      }
      state.transferRows = rows;
      try { refreshStarTrustPanel(); } catch {}
      writeOut(r);
    }

    async function checkTransfer(transferId) {
      const localTransfer = getLocalTransferRecords().find(t => (t['@id'] || t.id || '') === transferId);
      if (localTransfer) {
        const st = normalizeTransferState(localTransfer.state || '-');
        showInfoPopup(`Estado: ${st}`, {
          transferId,
          state: st,
          contractId: localTransfer.contractId || '',
          assetId: localTransfer.assetId || '',
          transferType: localTransfer.transferType || 'LOCAL-DOWNLOAD',
          destinationType: localTransfer.destinationType || 'browser-download',
          filename: localTransfer.filename || '',
          bytes: localTransfer.bytes || 0,
          sourceUrl: localTransfer.sourceUrl || '',
          contentType: localTransfer.contentType || '',
          createdAt: fmtDate(localTransfer.createdAt || ''),
          errorDetail: localTransfer.errorDetail || '',
        });
        writeOut({ status: 200, data: localTransfer, localDownload: true });
        return;
      }

      // Obtener detalle completo (no solo estado) para ver errorDetail
      const full = await callApi('GET', `/v3/transferprocesses/${encodeURIComponent(transferId)}`);
      const st = normalizeTransferState(full?.data?.state || full?.data?.['edc:state'] || '-');
      const errorDetail = full?.data?.errorDetail || full?.data?.['edc:errorDetail'] || '';
      showInfoPopup(`Estado: ${st}`, {
        transferId,
        state: st,
        errorDetail: errorDetail || '(sin detalle)',
        type: full?.data?.type || full?.data?.['edc:type'] || '',
        assetId: full?.data?.assetId || full?.data?.['edc:assetId'] || '',
        contractId: full?.data?.contractId || full?.data?.['edc:contractId'] || '',
        dataDestination: full?.data?.dataDestination || full?.data?.['edc:dataDestination'] || {},
        stateTimestamp: fmtDate(full?.data?.stateTimestamp || full?.data?.['edc:stateTimestamp'] || ''),
        dataplaneMetadata: full?.data?.['edc:dataplaneMetadata'] || full?.data?.dataplaneMetadata || {},
        diagnosisHint: st === 'STARTED'
          ? 'STARTED significa que el dataplane arrancó la transferencia pero no completó el PUSH. Causas más comunes: (1) token ArcGIS expirado en el asset origen, (2) webhook.site/destino no alcanzable desde dentro del contenedor Docker del servidor, (3) URL origen inaccesible desde el servidor.'
          : ''
      });
      writeOut(full);
    }

    async function terminateTransfer(transferId) {
      if (!transferId) return;
      const r = await callApi('POST', `/v3/transferprocesses/${encodeURIComponent(transferId)}/terminate`, JSON.stringify({
        '@context': { edc: 'https://w3id.org/edc/v0.0.1/ns/' },
        reason: 'Terminado manualmente desde la UI'
      }));
      if (r.status >= 200 && r.status < 300) {
        showInfoPopup('Transferencia terminada', { transferId, message: 'La transferencia fue terminada. Ahora puedes iniciar una nueva.' });
      } else {
        showInfoPopup('Error al terminar', { transferId, status: r.status, detail: r.data });
      }
      writeOut(r);
      await listTransfers();
    }
    window.terminateTransfer = terminateTransfer;

    /**
     * Deletes a transfer record from local or remote storage.
     * Removes transfer from visible list and optionally hides from future display.
     * 
     * @async
     * @param {string} transferId - Transfer ID to delete
     * @param {boolean} [isLocal=false] - Whether to delete from local storage only
     * @returns {Promise<void>}
     * 
     * @example
     * await deleteTransferRecord('transfer-123'); // Delete transfer record
     */
    async function deleteTransferRecord(transferId, isLocal = false) {
      if (!transferId) return;

      const localDeleted = removeLocalTransferRecordById(transferId);
      if (!localDeleted && !isLocal) {
        hideTransferRecordById(transferId);
      }

      writeOut({
        status: 200,
        action: 'delete-transfer-record',
        transferId,
        localDeleted,
        hidden: !localDeleted,
        note: localDeleted
          ? 'Registro local eliminado.'
          : 'Transferencia remota ocultada de la tabla (no se puede borrar del historial del runtime EDC).'
      });

      await listTransfers();
    }
    window.deleteTransferRecord = deleteTransferRecord;

    async function checkDataplanes() {
      const r = await callApi('GET', '/v3/dataplanes');
      const planes = Array.isArray(r?.data) ? r.data : [];
      if (!planes.length) {
        showInfoPopup('Sin Dataplanes registrados ⚠️', {
          message: 'No hay ningún dataplane registrado en este conector. Eso explica por qué las transferencias se quedan en STARTED: no hay motor de transferencia activo.',
          hint: 'Necesitas añadir un componente EDC Data Plane en docker-compose o que el conector tenga embedded dataplane activado. Revisa la configuración del runtime.'
        });
      } else {
        showInfoPopup(`Dataplanes (${planes.length})`, planes.map(p => ({
          id: p['@id'] || p.id,
          url: p.url || p['edc:url'] || '',
          state: p.state || p['edc:state'] || '',
          allowedSourceTypes: p.allowedSourceTypes || p['edc:allowedSourceTypes'] || [],
          allowedTransferTypes: p.allowedTransferTypes || p['edc:allowedTransferTypes'] || []
        })));
      }
      writeOut(r);
    }
    window.checkDataplanes = checkDataplanes;

    const _transferPollingActive = new Set();

    async function pollTransferUntilDone(transferId, maxWaitMs = 120000) {
      if (_transferPollingActive.has(transferId)) return;
      _transferPollingActive.add(transferId);
      const started = Date.now();
      const intervals = [2000, 3000, 5000, 5000, 10000];
      let step = 0;

      try {
        while (true) {
          const elapsed = Date.now() - started;
          if (elapsed > maxWaitMs) {
            const detail = await callApi('GET', `/v3/transferprocesses/${encodeURIComponent(transferId)}`, undefined, { silent: true, retries: 0 });
            const dp = await callApi('GET', '/v3/dataplanes', undefined, { silent: true, retries: 0 });
            const dataplanes = Array.isArray(dp?.data) ? dp.data : [];
            const errorDetail = detail?.data?.errorDetail || detail?.data?.['edc:errorDetail'] || '(sin errorDetail)';
            const stateRaw = detail?.data?.state || detail?.data?.['edc:state'] || 'STARTED';
            const stateNow = normalizeTransferState(stateRaw);
            const dpMeta = detail?.data?.['edc:dataplaneMetadata'] || detail?.data?.dataplaneMetadata || {};

            showInfoPopup('Transferencia estancada ⚠️', {
              message: `La transferencia lleva más de ${Math.round(maxWaitMs / 1000)}s en estado no terminal. Posibles causas: el origen no es accesible desde el conector (comprueba que la URL y autenticación son válidas desde el servidor, no solo desde el navegador), o el destino (sinkBaseUrl) no acepta la conexión del conector. El estado quedó en STARTED porque el conector no pudo completar el PUSH.`,
              transferId,
              state: stateNow,
              elapsed: `${Math.round(elapsed / 1000)}s`,
              errorDetail,
              dataplanesCount: dataplanes.length,
              dataplaneMetadata: dpMeta,
              hint: dataplanes.length === 0
                ? 'No hay dataplanes registrados en Management API. Sin dataplane activo las transferencias quedan en STARTED.'
                : 'Hay dataplane registrado. Revisa token ArcGIS (caducidad) y conectividad saliente desde el contenedor hacia origen y destino.'
            });
            writeOut({ warning: 'Transfer stalled', transferId, elapsed, stateNow, errorDetail, dataplanesCount: dataplanes.length, dataplaneMetadata: dpMeta });
            break;
          }

          const waitMs = intervals[Math.min(step, intervals.length - 1)];
          await new Promise(res => setTimeout(res, waitMs));
          step++;

          const r = await callApi('GET', `/v3/transferprocesses/${encodeURIComponent(transferId)}/state`, undefined, { silent: true });
          const stateRaw = r?.data?.state || r?.data?.['edc:state'] || '';
          const st = normalizeTransferState(stateRaw);

          await listTransfers();

          if (st === 'COMPLETED') {
            showInfoPopup('Transferencia completada ✅', {
              message: 'La transferencia finalizó con éxito. Revisa webhook.site (o tu destino) para ver los datos recibidos.',
              transferId
            });
            writeOut({ info: 'Transfer COMPLETED', transferId });
            break;
          }
          if (st === 'TERMINATED' || st === 'FAILED') {
            const err = r?.data?.errorDetail || r?.data?.['edc:errorDetail'] || 'Sin detalle de error.';
            showInfoPopup('Transferencia terminada con error ❌', {
              message: `La transferencia terminó en estado ${st}. Revisa el errorDetail.`,
              transferId,
              errorDetail: err,
              hint: 'Causas comunes: token de ArcGIS expirado, URL origen errónea, host destino inaccesible desde el contenedor Docker, o política rechazada.'
            });
            writeOut({ error: `Transfer ${st}`, transferId, errorDetail: err });
            break;
          }
        }
      } finally {
        _transferPollingActive.delete(transferId);
      }
    }

    window.retryTransferMonitor = (transferId) => {
      if (!transferId) return;
      const localTransfer = getLocalTransferRecords().find(t => (t['@id'] || t.id || '') === transferId);
      if (localTransfer) {
        window.checkTransfer(transferId);
        writeOut({ info: `Transferencia local ${transferId} registrada en historial.` });
        return;
      }
      pollTransferUntilDone(transferId, 120000);
      writeOut({ info: `Monitoreando transferencia ${transferId}...` });
    };

    /**
     * Checks status of the dummy sink test service.
     * Fetches recorded messages from dummy inbox endpoint.
     * Useful for testing connector message flow without real transfers.
     * 
     * @async
     * @returns {Promise<void>}
     * 
     * @example
     * await checkDummy(); // Check dummy sink records
     */
    async function checkDummy() {
      try {
        const res = await fetch(`${settings.dummyUrl}/v1/dummy-sink/records`);
        const data = await res.json();
        writeOut({ status: res.status, data });
      } catch (e) {
        writeOut({ step: 'Dummy inbox error', error: String(e), hint: `${settings.dummyUrl}/health` });
      }
    }

    /**
     * Clears all records from the dummy sink test service.
     * Resets dummy inbox for fresh testing of connector message flow.
     * 
     * @async
     * @returns {Promise<void>}
     * 
     * @example
     * await clearDummy(); // Clear dummy sink records
     */
    async function clearDummy() {
      try {
        const res = await fetch(`${settings.dummyUrl}/v1/dummy-sink/records`, { method: 'DELETE' });
        const data = await res.json();
        writeOut({ status: res.status, data });
      } catch (e) {
        writeOut({ error: String(e) });
      }
    }

