"""Cloudflare Access JWT verification.

When CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are set, the backend validates
the CF-Access-JWT-Assertion header (or CF_Authorization cookie) on every
/api/chat request using Cloudflare's published JWKS.

If either env var is unset, auth is disabled -- appropriate for local dev
only. Production deployments MUST set both.

Reference: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import Header, HTTPException, Request
from jose import jwt
from jose.exceptions import JWTError

log = logging.getLogger(__name__)

JWKS_TTL_SECONDS = 3600


@dataclass
class AccessConfig:
    team_domain: str    # e.g. "acme" -> https://acme.cloudflareaccess.com
    aud: str            # Application AUD tag from the Access dashboard

    @property
    def certs_url(self) -> str:
        return f"https://{self.team_domain}.cloudflareaccess.com/cdn-cgi/access/certs"

    @property
    def issuer(self) -> str:
        return f"https://{self.team_domain}.cloudflareaccess.com"


def load_config() -> AccessConfig | None:
    team = os.environ.get("CF_ACCESS_TEAM_DOMAIN", "").strip()
    aud = os.environ.get("CF_ACCESS_AUD", "").strip()
    if not team or not aud:
        return None
    return AccessConfig(team_domain=team, aud=aud)


class _JWKSCache:
    def __init__(self) -> None:
        self._keys: dict[str, Any] | None = None
        self._expires: float = 0
        self._lock = asyncio.Lock()

    async def get(self, config: AccessConfig) -> dict[str, Any]:
        now = time.time()
        if self._keys and now < self._expires:
            return self._keys
        async with self._lock:
            # Re-check under lock in case another coroutine refreshed while we waited.
            now = time.time()
            if self._keys and now < self._expires:
                return self._keys
            async with httpx.AsyncClient() as client:
                resp = await client.get(config.certs_url, timeout=5.0)
            resp.raise_for_status()
            self._keys = resp.json()
            self._expires = now + JWKS_TTL_SECONDS
            return self._keys


_cache = _JWKSCache()


def _extract_token(request: Request, explicit: str | None) -> str | None:
    if explicit:
        return explicit
    # Cloudflare also sets a cookie on browser requests.
    return request.cookies.get("CF_Authorization")


async def require_access(
    request: Request,
    cf_access_jwt_assertion: str | None = Header(default=None, alias="CF-Access-JWT-Assertion"),
) -> dict[str, Any]:
    """FastAPI dependency that returns the decoded Access claims.

    If Access is not configured (dev / test), returns an empty dict so routes
    still work -- production deployments must set CF_ACCESS_* env vars.
    """
    config = load_config()
    if config is None:
        return {}

    token = _extract_token(request, cf_access_jwt_assertion)
    if not token:
        raise HTTPException(401, "missing Cloudflare Access JWT")

    try:
        jwks = await _cache.get(config)
    except httpx.HTTPError as e:  # pragma: no cover -- network
        log.error("could not fetch Access JWKS: %s", e)
        raise HTTPException(503, "auth service unavailable") from e

    try:
        claims = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            audience=config.aud,
            issuer=config.issuer,
        )
    except JWTError as e:
        raise HTTPException(401, f"invalid Access JWT: {e}") from e

    return claims
