"""Passwords (Argon2) and login sessions (JWT in an httpOnly cookie)."""

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, Response
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from helpdesk.db import get_db
from helpdesk.models import User
from helpdesk.settings import get_settings

COOKIE = "helpdesk_session"
_hasher = PasswordHash.recommended()  # Argon2id
_DUMMY_HASH = _hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str | None) -> bool:
    # Always run a hash check, even for unknown emails, so timing doesn't reveal which emails exist.
    ok = _hasher.verify(password, hashed or _DUMMY_HASH)
    return ok and hashed is not None


def set_session(response: Response, user: User) -> None:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(days=s.session_days)
    token = jwt.encode({"sub": user.id, "exp": exp}, s.jwt_secret, algorithm="HS256")
    response.set_cookie(COOKIE, token, max_age=s.session_days * 86400, httponly=True,
                        secure=s.cookie_secure, samesite="lax", path="/")


def clear_session(response: Response) -> None:
    response.delete_cookie(COOKIE, path="/")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """FastAPI dependency: the logged-in user, or 401."""
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Please log in.")
    try:
        user_id = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])["sub"]
    except jwt.PyJWTError:
        raise HTTPException(401, "Your session has expired. Please log in again.")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(401, "Please log in.")
    return user
