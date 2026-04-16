# Unit Tests

Tests for EITEL Node handshake service covering:
- Identity generation and DID derivation
- VC verification (JWS signature validation)
- Session token management (JWT creation/validation)
- Handshake endpoint integration

## Running Tests

### Install test dependencies

```bash
cd handshake
pip install -r requirements.txt
```

### Run all tests

```bash
pytest -v
```

### Run specific test file

```bash
pytest tests/test_identity.py -v
pytest tests/test_vc_verifier.py -v
pytest tests/test_session_tokens.py -v
pytest tests/test_handshake_endpoint.py -v
```

### Run specific test

```bash
pytest tests/test_identity.py::TestDidKeyDerivation::test_derive_did_key_format -v
```

### Run with coverage report

```bash
pip install pytest-cov
pytest --cov=core --cov=routers --cov-report=html
```

## Test Structure

- **test_identity.py** — Ed25519 keypair generation, multibase DID derivation, persistence
- **test_vc_verifier.py** — JWS signature validation, structural VC checks, DID binding
- **test_session_tokens.py** — JWT creation, expiration, validation, bearer token handling
- **test_handshake_endpoint.py** — Full handshake flow, error cases, token usage

## Notes

Tests use temporary directories and fixtures to avoid side effects. Coordinator keys are generated fresh for each test, ensuring isolation.

The test suite covers both happy paths and error cases:
- Valid credentials and signatures
- Invalid/expired credentials
- Missing required fields
- Type/format mismatches
- DID binding verification
