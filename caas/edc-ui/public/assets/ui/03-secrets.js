async function saveSecret() {
      if (!state.secretsAvailable) {
        await discoverSecretsApi(false);
        if (!state.secretsAvailable) { writeOut({ status: 404, error: 'Secrets API no disponible en este runtime.' }); return; }
      }
      const name = document.getElementById('secretName').value.trim();
      const value = document.getElementById('secretValue').value.trim();
      if (!name || !value) { writeOut({ status: 400, error: 'Nombre y valor requeridos.' }); return; }
      const payloads = [
        { '@context': { edc: 'https://w3id.org/edc/v0.0.1/ns/' }, '@type': 'Secret', '@id': name, value },
        { key: name, value },
      ];
      const endpoints = ['/v3/secrets', '/v3/secret'];
      let last = null;
      for (const endpoint of endpoints) {
        for (const payload of payloads) {
          const r = await callApi('POST', endpoint, JSON.stringify(payload), { silent: true });
          last = r;
          if (r.status >= 200 && r.status < 300) {
            writeOut({ status: r.status, data: r.data, endpoint, payloadType: payload['@type'] ? 'edc-secret' : 'key-value' });
            await listSecrets(false);
            return;
          }
        }
      }
      const local = await callLocalAssetsApi('POST', '/local-secrets', { body: JSON.stringify({ name, value }) });
      if (local.status >= 200 && local.status < 300) {
        writeOut({ status: 200, message: 'Secret guardado en almacenamiento local del conector.', endpoint: local.endpoint, name });
        await listSecrets(false);
        return;
      }
      writeOut({ status: last?.status || local?.status || 500, error: 'No se pudo guardar el secret ni en runtime ni en almacenamiento local.', lastResponse: last, localResponse: local });
      await listSecrets(false);
    }

    function refreshSecretSelect() {
      const sel = document.getElementById('pubAuthSecret');
      if (!sel) return;
      const current = sel.value;
      sel.innerHTML = '<option value="">(opcional)</option>';
      state.secretNames.forEach(n => {
        const o = document.createElement('option');
        o.value = n;
        o.textContent = n;
        sel.appendChild(o);
      });
      if (state.secretNames.includes(current)) sel.value = current;
    }

    async function listSecrets(showOutput = true) {
          const runtime = await discoverSecretsApi(false);
          if (runtime.status >= 200 && runtime.status < 300) {
            if (showOutput) writeOut(runtime);
            return runtime;
          }

          const local = await callLocalAssetsApi('GET', '/local-secrets');
          if (local.status >= 200 && local.status < 300) {
            const names = (Array.isArray(local?.data?.items) ? local.data.items : [])
              .map(row => String(row?.name || '').trim())
              .filter(Boolean);
            state.secretNames = names;
            state.secretsApi = { method: 'LOCAL', path: '/local-secrets' };
            state.secretsAvailable = true;
            refreshSecretSelect();
            updateSecretsStatus('warn', 'Secrets runtime no disponible: usando almacenamiento local persistente');
            const outSecrets = document.getElementById('secretsOut');
            if (outSecrets) outSecrets.textContent = JSON.stringify(local.data, null, 2);
            try { refreshStarTrustPanel(); } catch {}
            if (showOutput) writeOut({ status: 200, source: 'local', data: local.data });
            return { status: 200, source: 'local', data: local.data };
          }

          state.secretsAvailable = false;
          updateSecretsStatus('danger', 'Secrets no disponible ni en runtime ni en almacenamiento local');
          try { refreshStarTrustPanel(); } catch {}
          if (showOutput) writeOut(local);
          return local;
    }
    async function deleteSecret() {
      if (!state.secretsAvailable) {
        await discoverSecretsApi(false);
        if (!state.secretsAvailable) { writeOut({ status: 404, error: 'Secrets API no disponible en este runtime.' }); return; }
      }
      const name = document.getElementById('secretName').value.trim();
      if (!name) { writeOut({ status: 400, error: 'Nombre requerido.' }); return; }
      const candidates = [`/v3/secrets/${encodeURIComponent(name)}`, `/v3/secret/${encodeURIComponent(name)}`];
      let last = null;
      for (const path of candidates) {
        const r = await callApi('DELETE', path, undefined, { silent: true });
        last = r;
        if (r.status >= 200 && r.status < 300) {
          writeOut({ status: r.status, data: r.data, endpoint: path });
          await listSecrets(false);
          return;
        }
      }
      const local = await callLocalAssetsApi('DELETE', `/local-secrets/${encodeURIComponent(name)}`);
      if (local.status >= 200 && local.status < 300) {
        writeOut({ status: 200, message: 'Secret eliminado de almacenamiento local del conector.', endpoint: local.endpoint, name });
        await listSecrets(false);
        return;
      }
      writeOut({ status: last?.status || local?.status || 500, error: 'No se pudo borrar el secret ni del runtime ni del almacenamiento local.', lastResponse: last, localResponse: local });
      await listSecrets(false);
    }

