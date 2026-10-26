"""
Configuration module for Telegram Channel Auto-Filter & Search Bot.
Loads and validates environment variables from .env file.
"""

import os
from typing import List
from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()


def _parse_int_list(value: str) -> List[int]:
    """Parse a space or comma-separated list of integer Telegram IDs."""
    if not value:
        return []
    cleaned = value.replace(",", " ").split()
    result: List[int] = []
    for item in cleaned:
        try:
            result.append(int(item.strip()))
        except ValueError as exc:
            raise ValueError(f"Invalid integer ID in environment variable: {item!r}") from exc
    return result


class Config:
    """Centralized configuration settings loaded from environment variables."""

    # Telegram MTProto API Credentials (from https://my.telegram.org)
    API_ID: int = int(os.getenv("API_ID", "0"))
    API_HASH: str = os.getenv("API_HASH", "")
    BOT_TOKEN: str = os.getenv("BOT_TOKEN", "")

    # MongoDB Connection Settings
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "telegram_channel_autofilter")
    MONGO_MAX_POOL_SIZE: int = int(os.getenv("MONGO_MAX_POOL_SIZE", "50"))
    MONGO_MIN_POOL_SIZE: int = int(os.getenv("MONGO_MIN_POOL_SIZE", "5"))

    # Bot Access & Admin Settings
    ADMINS: List[int] = _parse_int_list(os.getenv("ADMINS", ""))
    LOG_CHANNEL: int = int(os.getenv("LOG_CHANNEL", "0"))

    # Search & Pagination Settings
    RESULTS_PER_PAGE: int = int(os.getenv("RESULTS_PER_PAGE", "8"))
    MAX_INLINE_RESULTS: int = int(os.getenv("MAX_INLINE_RESULTS", "25"))
    INLINE_CACHE_TIME: int = int(os.getenv("INLINE_CACHE_TIME", "60"))

    # Optional Auto-Indexing of Forwarded Channel Posts by Admins
    AUTO_INDEX_FORWARDED: bool = os.getenv("AUTO_INDEX_FORWARDED", "true").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )

    # Default Categories for Channel Tagging
    DEFAULT_CATEGORIES: List[str] = [
        "Movies",
        "Tech",
        "Anime",
        "Crypto",
        "Deals",
        "Education",
        "Gaming",
        "News",
        "General",
    ]

    @classmethod
    def validate(cls) -> None:
        """Validate critical environment variables before starting the client."""
        missing = []
        if not cls.API_ID:
            missing.append("API_ID")
        if not cls.API_HASH:
            missing.append("API_HASH")
        if not cls.BOT_TOKEN:
            missing.append("BOT_TOKEN")
        if not cls.MONGO_URI:
            missing.append("MONGO_URI")
        if not cls.ADMINS:
            missing.append("ADMINS")

        if missing:
            raise RuntimeError(
                f"Missing required environment variables: {', '.join(missing)}. "
                "Please configure your .env file before starting the bot."
            )
