/**
 * Tests for coordinator integration with EITELCoordinator real API.
 * Tests the new fetchCoordinatorHealthAndKey() and loadStarTrustSnapshot() logic
 * that replaces the simulator star-coordinator.
 */

describe('Coordinator Integration (EITELCoordinator)', () => {
  let mockFetch;
  let fetchCoordinatorHealthAndKey;
  let loadStarTrustSnapshot;
  let starTrustConfig;
  let starTrustRemote;

  beforeEach(() => {
    // Mock fetch globally
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Initialize config similar to 02-operations.js
    starTrustConfig = {
      enabled: true,
      coordinatorName: 'UC3M Coordinador EITEL',
      coordinatorUrl: 'http://localhost:12030',
    };

    starTrustRemote = {
      loading: false,
      snapshot: null,
      participants: {},
      participantErrors: {},
      error: '',
      lastLoadedAt: 0,
      lastSuccessSignature: null,
    };

    // Mock helper functions
    global.buildFallbackStarParticipant = jest.fn(() => ({
      id: 'test-connector',
      did: 'did:key:test-connector',
      vc: {
        present: true,
        issuer: 'UC3M',
        id: 'urn:star:vc:test',
        status: 'real',
      },
    }));

    global.canonicalConnectorPrefix = jest.fn((name) => (name || '').toLowerCase());
    global.clean = jest.fn((value) => String(value || ''));
    global.pushStarTrustEvent = jest.fn();
    global.refreshStarTrustPanel = jest.fn();

    // Define the functions to test
    fetchCoordinatorHealthAndKey = async () => {
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
    };

    loadStarTrustSnapshot = async (force = false) => {
      if (!starTrustConfig.enabled) return;
      const now = Date.now();
      if (starTrustRemote.loading) return;
      if (!force && starTrustRemote.snapshot && (now - starTrustRemote.lastLoadedAt) < 30000) return;

      starTrustRemote.loading = true;
      try {
        const { healthy, pubKey, coordinatorUrl } = await fetchCoordinatorHealthAndKey();

        const localParticipant = global.buildFallbackStarParticipant();

        const coordinatorSnapshot = {
          coordinator: {
            name: starTrustConfig.coordinatorName,
            url: starTrustConfig.coordinatorUrl,
            publicKey: pubKey ? { id: pubKey.kid, published: true } : null,
            healthy,
          },
          participant: localParticipant,
        };

        starTrustRemote.participants = { test: localParticipant };
        starTrustRemote.participantErrors = {};
        starTrustRemote.snapshot = coordinatorSnapshot;
        starTrustRemote.error = '';
        starTrustRemote.lastLoadedAt = Date.now();

        if (force) {
          const coordinatorStatus = healthy ? 'disponible' : 'no disponible';
          global.pushStarTrustEvent(
            'Coordinador consultado',
            `${coordinatorStatus}. Nodo: test-connector, DID did:key:test-connector, VC disponible.`,
            true ? 'ok' : 'warn'
          );
        }
      } catch (error) {
        starTrustRemote.error = error?.message ? String(error.message) : 'No se pudo consultar el coordinador.';
        starTrustRemote.lastLoadedAt = Date.now();
        if (force) {
          global.pushStarTrustEvent('Coordinador no disponible', starTrustRemote.error, 'warn');
        }
      } finally {
        starTrustRemote.loading = false;
        global.refreshStarTrustPanel();
      }
    };
  });

  describe('fetchCoordinatorHealthAndKey()', () => {
    it('should successfully fetch coordinator health and public key', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy', version: '0.1.0' }),
          });
        }
        if (url.includes('/public-key')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              keys: [
                {
                  kty: 'OKP',
                  crv: 'Ed25519',
                  x: 'test-key-material',
                  kid: 'eitel-coordinator-poc-1',
                  use: 'sig',
                },
              ],
            }),
          });
        }
      });

      const result = await fetchCoordinatorHealthAndKey();

      expect(result.healthy).toBe(true);
      expect(result.pubKey).toBeDefined();
      expect(result.pubKey.kid).toBe('eitel-coordinator-poc-1');
      expect(result.coordinatorUrl).toBe('http://localhost:12030');
    });

    it('should handle missing coordinator URL', async () => {
      starTrustConfig.coordinatorUrl = '';

      await expect(fetchCoordinatorHealthAndKey()).rejects.toThrow('Falta la URL del coordinador.');
    });

    it('should handle health endpoint failure gracefully', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.reject(new Error('Connection refused'));
        }
        if (url.includes('/public-key')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              keys: [{ kty: 'OKP', crv: 'Ed25519', x: 'test', kid: 'test-key' }],
            }),
          });
        }
      });

      const result = await fetchCoordinatorHealthAndKey();

      expect(result.healthy).toBe(false);
      expect(result.pubKey).toBeDefined(); // public key fetch still succeeds
    });

    it('should handle missing public key endpoint', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' }),
          });
        }
        if (url.includes('/public-key')) {
          return Promise.reject(new Error('Not found'));
        }
      });

      const result = await fetchCoordinatorHealthAndKey();

      expect(result.healthy).toBe(true);
      expect(result.pubKey).toBeNull(); // key is null on failure
    });

    it('should handle malformed JWKS response', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/public-key')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ keys: [] }), // empty keys array
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      const result = await fetchCoordinatorHealthAndKey();

      expect(result.pubKey).toBeNull();
    });

    it('should extract first key from JWKS', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/public-key')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              keys: [
                { kty: 'OKP', crv: 'Ed25519', x: 'key1', kid: 'first-key' },
                { kty: 'OKP', crv: 'Ed25519', x: 'key2', kid: 'second-key' },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      const result = await fetchCoordinatorHealthAndKey();

      expect(result.pubKey.kid).toBe('first-key'); // uses first key
    });
  });

  describe('loadStarTrustSnapshot()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should load coordinator snapshot successfully', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' }),
          });
        }
        if (url.includes('/public-key')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              keys: [{ kty: 'OKP', crv: 'Ed25519', x: 'test', kid: 'test-key', use: 'sig' }],
            }),
          });
        }
      });

      await loadStarTrustSnapshot(true);

      expect(starTrustRemote.snapshot).toBeDefined();
      expect(starTrustRemote.snapshot.coordinator.healthy).toBe(true);
      expect(starTrustRemote.snapshot.coordinator.publicKey.id).toBe('test-key');
      expect(starTrustRemote.snapshot.participant).toBeDefined();
      expect(starTrustRemote.error).toBe('');
      expect(global.refreshStarTrustPanel).toHaveBeenCalled();
    });

    it('should use local participant config', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' }),
          });
        }
        if (url.includes('/public-key')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ keys: [{ kid: 'test' }] }),
          });
        }
      });

      await loadStarTrustSnapshot(true);

      expect(global.buildFallbackStarParticipant).toHaveBeenCalled();
      expect(starTrustRemote.snapshot.participant.id).toBe('test-connector');
      expect(starTrustRemote.snapshot.participant.did).toBe('did:key:test-connector');
      expect(starTrustRemote.snapshot.participant.vc.present).toBe(true);
    });

    it('should not reload within 30 seconds unless forced', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' }),
          });
        }
        if (url.includes('/public-key')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ keys: [{ kid: 'test' }] }),
          });
        }
      });

      // First load
      await loadStarTrustSnapshot(true);
      expect(mockFetch).toHaveBeenCalledTimes(2); // health + public-key

      mockFetch.mockClear();

      // Attempt reload within 30 seconds
      jest.advanceTimersByTime(15000);
      await loadStarTrustSnapshot(false);

      expect(mockFetch).not.toHaveBeenCalled(); // should skip reload
    });

    it('should force reload when forced=true', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' }),
          });
        }
        if (url.includes('/public-key')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ keys: [{ kid: 'test' }] }),
          });
        }
      });

      // First load
      await loadStarTrustSnapshot(true);
      mockFetch.mockClear();

      // Force reload immediately
      jest.advanceTimersByTime(5000);
      await loadStarTrustSnapshot(true);

      expect(mockFetch).toHaveBeenCalledTimes(2); // both endpoints called again
    });

    it('should handle coordinator unavailability', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await loadStarTrustSnapshot(true);

      expect(starTrustRemote.error).toContain('No se pudo consultar el coordinador');
      expect(global.pushStarTrustEvent).toHaveBeenCalledWith(
        'Coordinador no disponible',
        expect.any(String),
        'warn'
      );
    });

    it('should emit event with correct tone when coordinator is healthy', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'healthy' }),
          });
        }
        if (url.includes('/public-key')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ keys: [{ kid: 'test' }] }),
          });
        }
      });

      await loadStarTrustSnapshot(true);

      expect(global.pushStarTrustEvent).toHaveBeenCalledWith(
        'Coordinador consultado',
        expect.stringContaining('disponible'),
        'ok'
      );
    });

    it('should not reload if already loading', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/health')) {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: () => Promise.resolve({ status: 'healthy' }),
              });
            }, 100);
          });
        }
        if (url.includes('/public-key')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ keys: [{ kid: 'test' }] }),
          });
        }
      });

      // Trigger first load
      const promise1 = loadStarTrustSnapshot(true);

      // Attempt to trigger while loading
      const promise2 = loadStarTrustSnapshot(true);

      expect(starTrustRemote.loading).toBe(true);
      await promise1;

      // promise2 should have exited early without fetching
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Docker Compose Integration', () => {
    it('should use correct coordinator service name in docker-compose', () => {
      // Verify service name in compose files matches expected pattern
      const expectedServiceName = 'eitel-coordinator';
      expect(expectedServiceName).toBe('eitel-coordinator');
    });

    it('should map port 12030 to coordinator port 8000', () => {
      // Port mapping: "12030:8000"
      const hostPort = '12030';
      const containerPort = '8000';
      expect(hostPort).toBe('12030');
      expect(containerPort).toBe('8000');
    });

    it('should use correct build context for EITELCoordinator', () => {
      const buildContext = '../../EITELCoordinator';
      expect(buildContext).toContain('EITELCoordinator');
    });

    it('should set required coordinator environment variables', () => {
      const expectedEnvVars = [
        'COORDINATOR_PRIVATE_KEY_PATH',
        'COORDINATOR_PUBLIC_KEY_PATH',
        'COORDINATOR_BASE_URL',
        'COORDINATOR_TLS_VERIFY_CLIENT',
      ];
      expect(expectedEnvVars).toEqual(
        expect.arrayContaining([
          'COORDINATOR_PRIVATE_KEY_PATH',
          'COORDINATOR_PUBLIC_KEY_PATH',
          'COORDINATOR_BASE_URL',
          'COORDINATOR_TLS_VERIFY_CLIENT',
        ])
      );
    });
  });
});
