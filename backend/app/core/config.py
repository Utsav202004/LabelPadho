"""
Configuration module for LabelPadho backend.

NEW CONCEPT: pydantic-settings
================================
You already know Pydantic for data validation in your Portfolio Optimizer.
`pydantic-settings` is a small extension that loads values from ENVIRONMENT
VARIABLES automatically.

How it works:
1. You define a Settings class with typed fields (like a Pydantic model)
2. It automatically reads matching environment variables
3. With `env_file = ".env"`, it also reads from a .env file on disk
4. If a required field is missing → clear error at startup (fail fast)

Why this pattern?
- Secrets (API keys) should NEVER be hardcoded in source code
- Different environments (dev/prod) use different values
- .env file is in .gitignore → secrets never get committed to Git
- This is industry standard — every production app does this

Interview note: If asked "how do you manage secrets?", say:
"Environment variables loaded via pydantic-settings, with .env for local dev
and platform-injected env vars in production. Never hardcoded, never committed."
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    App configuration loaded from environment variables.

    pydantic-settings will look for environment variables matching each
    field name (case-insensitive). For example, the field `gemini_api_key`
    is loaded from the env var GEMINI_API_KEY.
    """

    # Required — app won't start without this
    gemini_api_key: str

    # Optional with defaults
    gemini_model: str = "gemini-3.8-flash"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    model_config = {
        # Tell pydantic-settings to read from .env file in the project root
        "env_file": ".env",
        # If .env doesn't exist, don't crash (env vars might be set another way)
        "env_file_encoding": "utf-8",
    }


# Create a single instance — import this wherever you need config
# This runs validation immediately: if GEMINI_API_KEY is missing, the app
# crashes at import time with a clear error, not at some random point later.
settings = Settings()
