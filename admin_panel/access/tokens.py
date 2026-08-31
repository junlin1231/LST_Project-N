import base64
import hashlib
import hmac
import json
import time

from django.conf import settings


def _base64url_encode(value):
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def create_access_token(user):
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "status": user.status,
        "exp": int(time.time()) + settings.ACCESS_COOKIE_MAX_AGE,
    }
    payload_text = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_part = _base64url_encode(payload_text)
    signature = hmac.new(settings.AUTH_SHARED_SECRET.encode("utf-8"), payload_part.encode("ascii"), hashlib.sha256).digest()
    return f"{payload_part}.{_base64url_encode(signature)}"
