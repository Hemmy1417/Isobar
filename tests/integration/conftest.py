"""Transport resilience for the hosted integration suite.

genlayer-py opens a fresh HTTPS connection per JSON-RPC call and does not
retry, so one dropped TLS handshake (seen in bursts against Studio Next:
SSLEOFError, "bad record mac") fails a whole test. Retry only what is safe:

- connection / TLS errors — the request never reached the server, so a
  write cannot be submitted twice;
- Studio Next's rate-limit refusal (HTTP 429, JSON-RPC -32029) — refused
  before execution; wait for the rolling minute.

Read timeouts are NOT retried: the request may have been accepted.
"""
import time

import pytest
import requests
from genlayer_py.exceptions import GenLayerError
from genlayer_py.provider import provider as _provider

_ATTEMPTS = 6


def _retrying(make_request):
    def wrapped(self, method, params):
        for attempt in range(_ATTEMPTS):
            try:
                return make_request(self, method, params)
            except GenLayerError as err:
                cause = err.__cause__
                pre_send = isinstance(cause, (requests.exceptions.SSLError,
                                              requests.exceptions.ConnectionError)) \
                    and not isinstance(cause, requests.exceptions.ReadTimeout)
                rate_limited = "-32029" in str(err) or "Rate limit exceeded" in str(err)
                if attempt == _ATTEMPTS - 1 or not (pre_send or rate_limited):
                    raise
                time.sleep(20 if rate_limited else 2 * (attempt + 1))
    return wrapped


@pytest.fixture(scope="session", autouse=True)
def resilient_transport():
    original = _provider.GenLayerProvider.make_request
    _provider.GenLayerProvider.make_request = _retrying(original)
    yield
    _provider.GenLayerProvider.make_request = original
