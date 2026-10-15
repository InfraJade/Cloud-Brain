from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared limiter instance — imported by main.py (middleware) and individual routes (decorators).
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])
