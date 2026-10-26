export interface PythonFileEntry {
  path: string;
  filename: string;
  moduleGroup: 'Core' | 'Database' | 'Plugins' | 'Deployment';
  description: string;
  linesOfCode: number;
  language: 'python' | 'ini' | 'dockerfile';
  content: string;
}

export const PYTHON_PROJECT_FILES: PythonFileEntry[] = [
  {
    path: 'bot.py',
    filename: 'bot.py',
    moduleGroup: 'Core',
    description: 'Main entry point initializing uvloop, Motor MongoDB connection pool, indexes, and Pyrogram v2 Client.',
    linesOfCode: 76,
    language: 'python',
    content: `"""
Main entry point for Telegram Channel Auto-Filter & Search Bot.
Uses Pyrogram v2 with uvloop (when available) and Motor AsyncIO MongoDB.
"""

import asyncio
import logging
import sys

from pyrogram import Client, idle

from config import Config
from database.mongo import db

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logging.getLogger("pyrogram").setLevel(logging.WARNING)
logger = logging.getLogger("ChannelFilterBot")


def install_uvloop() -> None:
    """Install uvloop event loop policy on POSIX systems for high-throughput async I/O."""
    if sys.platform != "win32":
        try:
            import uvloop

            uvloop.install()
            logger.info("uvloop event loop policy activated.")
        except ImportError:
            logger.info("uvloop not installed; falling back to standard asyncio loop.")


async def main() -> None:
    """Initialize configuration, MongoDB indexes, and Pyrogram Bot Client."""
    Config.validate()

    # Initialize MongoDB connection pool and create indexes
    await db.initialize()

    app = Client(
        name="channel_autofilter_bot",
        api_id=Config.API_ID,
        api_hash=Config.API_HASH,
        bot_token=Config.BOT_TOKEN,
        plugins=dict(root="plugins"),
        workers=16,
        max_concurrent_transmissions=8,
    )

    await app.start()
    me = await app.get_me()
    logger.info(
        "Bot started successfully as @%s (ID: %s) — Auto-Filter & Inline Search ready.",
        me.username,
        me.id,
    )

    if Config.LOG_CHANNEL:
        try:
            await app.send_message(
                Config.LOG_CHANNEL,
                f"🟢 **Channel Auto-Filter Bot Online**\\n"
                f"• **Bot:** @{me.username}\\n"
                f"• **Database:** \`{Config.DATABASE_NAME}\`",
            )
        except Exception as exc:
            logger.warning("Could not send startup log to LOG_CHANNEL: %s", exc)

    # Keep the bot running until SIGINT / SIGTERM
    await idle()

    logger.info("Shutting down bot and closing MongoDB connection pool...")
    await app.stop()
    await db.close()


if __name__ == "__main__":
    install_uvloop()
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Bot stopped by user.")
`
  },
  {
    path: 'config.py',
    filename: 'config.py',
    moduleGroup: 'Core',
    description: 'Environment variable loader and validator for API_ID, API_HASH, BOT_TOKEN, MONGO_URI, ADMINS, and pagination.',
    linesOfCode: 84,
    language: 'python',
    content: `"""
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
`
  },
  {
    path: 'database/mongo.py',
    filename: 'mongo.py',
    moduleGroup: 'Database',
    description: 'Async Motor MongoDB CRUD, keyword tokenizer, multi-token case-insensitive regex search, and connection pooling.',
    linesOfCode: 312,
    language: 'python',
    content: `"""
Async MongoDB (Motor) database layer for Telegram Channel Auto-Filter Bot.
Manages connection pooling, schema indexes, channel CRUD, regex search,
pagination queries, user tracking, group tracking, and ban enforcement.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple, Union

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING, IndexModel
from pymongo.errors import PyMongoError

from config import Config

logger = logging.getLogger(__name__)


def tokenize_keywords(raw_text: str) -> List[str]:
    """
    Tokenize a comma/space-separated string or sentence into normalized lowercase keywords.
    Removes special characters and duplicates while preserving order.
    """
    if not raw_text:
        return []
    tokens = re.split(r"[,|\\s]+", raw_text.lower())
    seen = set()
    cleaned_tokens: List[str] = []
    for token in tokens:
        cleaned = re.sub(r"[^\\w+#.-]", "", token).strip()
        if cleaned and len(cleaned) >= 2 and cleaned not in seen:
            seen.add(cleaned)
            cleaned_tokens.append(cleaned)
    return cleaned_tokens


class Database:
    """Async MongoDB manager using Motor with connection pooling and indexed regex search."""

    def __init__(self, uri: str, db_name: str) -> None:
        self._client: AsyncIOMotorClient = AsyncIOMotorClient(
            uri,
            maxPoolSize=Config.MONGO_MAX_POOL_SIZE,
            minPoolSize=Config.MONGO_MIN_POOL_SIZE,
            serverSelectionTimeoutMS=10000,
            retryWrites=True,
        )
        self.db: AsyncIOMotorDatabase = self._client[db_name]
        self.channels: AsyncIOMotorCollection = self.db["channels"]
        self.users: AsyncIOMotorCollection = self.db["users"]
        self.groups: AsyncIOMotorCollection = self.db["groups"]
        self.settings: AsyncIOMotorCollection = self.db["settings"]

    async def initialize(self) -> None:
        """Verify database connectivity and create required indexes."""
        await self._client.admin.command("ping")
        logger.info("Connected to MongoDB database: %s", self.db.name)

        # Channel collection indexes
        channel_indexes = [
            IndexModel([("channel_id", ASCENDING)], unique=True, name="idx_channel_id_unique"),
            IndexModel([("username", ASCENDING)], name="idx_username"),
            IndexModel([("title", ASCENDING)], name="idx_title"),
            IndexModel([("category", ASCENDING)], name="idx_category"),
            IndexModel([("keywords", ASCENDING)], name="idx_keywords"),
            IndexModel(
                [("verified", DESCENDING), ("subscribers_count", DESCENDING), ("created_at", DESCENDING)],
                name="idx_ranking_sort",
            ),
        ]
        await self.channels.create_indexes(channel_indexes)

        # Users & Groups indexes
        await self.users.create_indexes([
            IndexModel([("user_id", ASCENDING)], unique=True, name="idx_user_id_unique"),
            IndexModel([("is_banned", ASCENDING)], name="idx_user_banned"),
        ])
        await self.groups.create_indexes([
            IndexModel([("chat_id", ASCENDING)], unique=True, name="idx_chat_id_unique"),
            IndexModel([("is_active", ASCENDING)], name="idx_group_active"),
        ])
        logger.info("MongoDB indexes verified successfully.")

    async def close(self) -> None:
        """Close the underlying Motor client pool gracefully."""
        self._client.close()
        logger.info("MongoDB connection pool closed.")

    # =========================================================================
    # Channel Indexing & CRUD Operations
    # =========================================================================

    async def upsert_channel(
        self,
        channel_id: Union[int, str],
        title: str,
        username_or_link: str,
        category: str = "General",
        keywords: Optional[List[str]] = None,
        description: str = "",
        verified: bool = False,
        subscribers_count: int = 0,
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Insert a new channel or update an existing one by channel_id.
        Returns (is_created, channel_document).
        """
        normalized_id = str(channel_id).strip().lower()
        title_tokens = tokenize_keywords(title)
        desc_tokens = tokenize_keywords(description)
        cat_tokens = tokenize_keywords(category)
        explicit_keywords = keywords or []

        # Combine all searchable tokens into deduplicated list
        combined_keywords = list(
            dict.fromkeys(explicit_keywords + title_tokens + desc_tokens + cat_tokens)
        )

        # Normalize username or invite link into a valid URL and handle
        clean_link = username_or_link.strip()
        if clean_link.startswith("@"):
            clean_username = clean_link[1:]
            invite_url = f"https://t.me/{clean_username}"
        elif clean_link.startswith("https://t.me/") or clean_link.startswith("http://t.me/"):
            invite_url = clean_link.replace("http://", "https://")
            clean_username = clean_link.rstrip("/").split("/")[-1]
        else:
            clean_username = clean_link
            invite_url = f"https://t.me/{clean_link}"

        now = datetime.now(timezone.utc)
        update_fields: Dict[str, Any] = {
            "title": title.strip(),
            "username": clean_username,
            "invite_link": invite_url,
            "category": category.strip() or "General",
            "description": description.strip(),
            "keywords": combined_keywords,
            "verified": bool(verified),
            "subscribers_count": int(subscribers_count or 0),
            "updated_at": now,
        }

        result = await self.channels.update_one(
            {"channel_id": normalized_id},
            {
                "$set": update_fields,
                "$setOnInsert": {
                    "channel_id": normalized_id,
                    "created_at": now,
                },
            },
            upsert=True,
        )
        is_created = result.upserted_id is not None
        doc = await self.channels.find_one({"channel_id": normalized_id})
        return is_created, doc or update_fields

    async def get_channel(self, identifier: Union[int, str]) -> Optional[Dict[str, Any]]:
        """Fetch a single channel by its channel_id or username."""
        raw = str(identifier).strip()
        normalized_id = raw.lower()
        clean_username = raw.lstrip("@").replace("https://t.me/", "").strip("/")

        return await self.channels.find_one(
            {
                "$or": [
                    {"channel_id": normalized_id},
                    {"username": {"$regex": f"^{re.escape(clean_username)}$", "$options": "i"}},
                ]
            }
        )

    async def delete_channel(self, identifier: Union[int, str]) -> bool:
        """Delete a channel by channel_id or username. Returns True if a document was deleted."""
        raw = str(identifier).strip()
        normalized_id = raw.lower()
        clean_username = raw.lstrip("@").replace("https://t.me/", "").strip("/")

        result = await self.channels.delete_one(
            {
                "$or": [
                    {"channel_id": normalized_id},
                    {"username": {"$regex": f"^{re.escape(clean_username)}$", "$options": "i"}},
                ]
            }
        )
        return result.deleted_count > 0

    # =========================================================================
    # Auto-Filter & Regex Search Engine
    # =========================================================================

    async def search_channels(
        self,
        query: str,
        category: Optional[str] = None,
        page: int = 1,
        per_page: int = Config.RESULTS_PER_PAGE,
    ) -> Tuple[List[Dict[str, Any]], int, int]:
        """
        Perform a case-insensitive multi-token regex search across title,
        keywords, description, username, and category.
        Returns (results_list, total_matches, total_pages).
        """
        clean_query = query.strip()
        mongo_filter: Dict[str, Any] = {}

        if category and category.lower() != "all":
            mongo_filter["category"] = {"$regex": f"^{re.escape(category.strip())}$", "$options": "i"}

        if clean_query:
            tokens = tokenize_keywords(clean_query)
            if not tokens:
                tokens = [clean_query]

            # Build $and of $or conditions so multi-word queries match across fields
            and_conditions = []
            for token in tokens:
                escaped = re.escape(token)
                pattern = {"$regex": escaped, "$options": "i"}
                and_conditions.append(
                    {
                        "$or": [
                            {"title": pattern},
                            {"keywords": pattern},
                            {"description": pattern},
                            {"category": pattern},
                            {"username": pattern},
                        ]
                    }
                )
            mongo_filter["$and"] = and_conditions

        total_matches = await self.channels.count_documents(mongo_filter)
        total_pages = max(1, (total_matches + per_page - 1) // per_page)
        safe_page = max(1, min(page, total_pages))
        skip_count = (safe_page - 1) * per_page

        cursor = (
            self.channels.find(mongo_filter)
            .sort(
                [
                    ("verified", DESCENDING),
                    ("subscribers_count", DESCENDING),
                    ("created_at", DESCENDING),
                ]
            )
            .skip(skip_count)
            .limit(per_page)
        )
        results = await cursor.to_list(length=per_page)
        return results, total_matches, total_pages

    # =========================================================================
    # User & Group Management + Ban Enforcement
    # =========================================================================

    async def register_user(self, user_id: int, first_name: str = "", username: str = "") -> None:
        """Add or update a user in the database."""
        now = datetime.now(timezone.utc)
        try:
            await self.users.update_one(
                {"user_id": user_id},
                {
                    "$set": {
                        "first_name": first_name,
                        "username": username,
                        "last_active": now,
                    },
                    "$setOnInsert": {
                        "user_id": user_id,
                        "is_banned": False,
                        "ban_reason": None,
                        "joined_at": now,
                    },
                },
                upsert=True,
            )
        except PyMongoError as exc:
            logger.warning("Failed to register user %s: %s", user_id, exc)

    async def register_group(self, chat_id: int, title: str = "", username: str = "") -> None:
        """Add or update a connected group chat in the database."""
        now = datetime.now(timezone.utc)
        try:
            await self.groups.update_one(
                {"chat_id": chat_id},
                {
                    "$set": {
                        "title": title,
                        "username": username,
                        "is_active": True,
                        "updated_at": now,
                    },
                    "$setOnInsert": {
                        "chat_id": chat_id,
                        "added_at": now,
                    },
                },
                upsert=True,
            )
        except PyMongoError as exc:
            logger.warning("Failed to register group %s: %s", chat_id, exc)

    async def set_user_ban(self, user_id: int, is_banned: bool, reason: str = "Violation of bot rules") -> bool:
        """Ban or unban a user by user_id."""
        now = datetime.now(timezone.utc)
        result = await self.users.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "is_banned": is_banned,
                    "ban_reason": reason if is_banned else None,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "user_id": user_id,
                    "joined_at": now,
                },
            },
            upsert=True,
        )
        return result.modified_count > 0 or result.upserted_id is not None

    async def is_user_banned(self, user_id: int) -> Tuple[bool, Optional[str]]:
        """Check whether a user is currently banned."""
        doc = await self.users.find_one({"user_id": user_id}, {"is_banned": 1, "ban_reason": 1})
        if doc and doc.get("is_banned"):
            return True, doc.get("ban_reason") or "Restricted by administrator."
        return False, None

    # =========================================================================
    # Runtime Settings & Broadcast Streams
    # =========================================================================

    async def get_auto_index_enabled(self) -> bool:
        """Check if admin forwarded-post auto-indexing is currently enabled."""
        doc = await self.settings.find_one({"_id": "bot_config"})
        if doc and "auto_index_forwarded" in doc:
            return bool(doc["auto_index_forwarded"])
        return Config.AUTO_INDEX_FORWARDED

    async def set_auto_index_enabled(self, enabled: bool) -> bool:
        """Toggle admin forwarded-post auto-indexing in MongoDB."""
        await self.settings.update_one(
            {"_id": "bot_config"},
            {"$set": {"auto_index_forwarded": bool(enabled)}},
            upsert=True,
        )
        return enabled

    async def get_stats(self) -> Dict[str, int]:
        """Return aggregate statistics for channels, users, banned users, and active groups."""
        total_channels = await self.channels.count_documents({})
        verified_channels = await self.channels.count_documents({"verified": True})
        total_users = await self.users.count_documents({})
        banned_users = await self.users.count_documents({"is_banned": True})
        active_groups = await self.groups.count_documents({"is_active": True})
        return {
            "total_channels": total_channels,
            "verified_channels": verified_channels,
            "total_users": total_users,
            "banned_users": banned_users,
            "active_groups": active_groups,
        }

    async def iter_all_users(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream all non-banned users for broadcast operations."""
        cursor = self.users.find({"is_banned": {"$ne": True}}, {"user_id": 1})
        async for user in cursor:
            yield user

    async def iter_all_groups(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream all active groups for broadcast operations."""
        cursor = self.groups.find({"is_active": True}, {"chat_id": 1})
        async for group in cursor:
            yield group


# Global singleton Database instance imported across plugins
db = Database(Config.MONGO_URI, Config.DATABASE_NAME)
`
  },
  {
    path: 'plugins/channel_filter.py',
    filename: 'channel_filter.py',
    moduleGroup: 'Plugins',
    description: 'Message handler for PM & Group Auto-Filter search, dynamic InlineKeyboard pagination, and channel info view.',
    linesOfCode: 288,
    language: 'python',
    content: `"""
Auto-Filter & Channel Search Engine Plugin for Pyrogram v2.
Handles:
- /start and /help onboarding commands
- Automatic text filtering in Private Messages & Connected Groups
- Interactive Inline Keyboard Pagination ([⏮️ Previous] [Page 1/X] [Next ⏭️])
- Category filter buttons
- Detailed Channel Info View / Callback Popup with direct Invite Link
"""

import logging
from typing import Any, Dict, List

from pyrogram import Client, enums, filters
from pyrogram.errors import FloodWait, MessageNotModified
from pyrogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from config import Config
from database.mongo import db

logger = logging.getLogger(__name__)

# Category badge icons for clean visual distinction in Telegram inline buttons
CATEGORY_BADGES: Dict[str, str] = {
    "movies": "🎬",
    "tech": "💻",
    "anime": "⛩️",
    "crypto": "🪙",
    "deals": "🏷️",
    "education": "📚",
    "gaming": "🎮",
    "news": "📰",
    "general": "📢",
}


def format_subscribers(count: int) -> str:
    """Format subscriber count into compact human-readable form (e.g., 142.5K)."""
    if not count or count <= 0:
        return "N/A"
    if count >= 1_000_000:
        return f"{count / 1_000_000:.1f}M"
    if count >= 1_000:
        return f"{count / 1_000:.1f}K"
    return str(count)


def build_search_keyboard(
    channels: List[Dict[str, Any]],
    query: str,
    page: int,
    total_pages: int,
    category: str = "all",
) -> InlineKeyboardMarkup:
    """
    Build the paginated InlineKeyboardMarkup for channel search results.
    Callback data format is kept compact (<64 bytes limit in Telegram Bot API):
      - Channel details:  ch|<channel_id>|<page>|<query_short>
      - Page navigation:  pg|<page>|<category>|<query_short>
    """
    safe_query = query[:24].replace("|", " ")
    safe_cat = (category or "all")[:10].replace("|", "")
    buttons: List[List[InlineKeyboardButton]] = []

    for ch in channels:
        cat_name = ch.get("category", "General")
        badge = CATEGORY_BADGES.get(cat_name.lower(), "📢")
        verified_mark = " ✔️" if ch.get("verified") else ""
        subs = ch.get("subscribers_count", 0)
        subs_label = f" • {format_subscribers(subs)}" if subs > 0 else ""

        button_label = f"{badge} {ch.get('title', 'Channel')}{verified_mark} [{cat_name}{subs_label}]"
        channel_id = str(ch.get("channel_id"))

        buttons.append(
            [
                InlineKeyboardButton(
                    text=button_label[:60],
                    callback_data=f"ch|{channel_id[:24]}|{page}|{safe_query}",
                )
            ]
        )

    # Pagination Controls Row: [⏮️ Previous] [Page 1/X] [Next ⏭️]
    nav_row: List[InlineKeyboardButton] = []
    if page > 1:
        nav_row.append(
            InlineKeyboardButton(
                text="⏮️ Previous",
                callback_data=f"pg|{page - 1}|{safe_cat}|{safe_query}",
            )
        )
    else:
        nav_row.append(InlineKeyboardButton(text="⏹️ First", callback_data="noop"))

    nav_row.append(
        InlineKeyboardButton(
            text=f"📄 Page {page}/{total_pages}",
            callback_data="noop",
        )
    )

    if page < total_pages:
        nav_row.append(
            InlineKeyboardButton(
                text="Next ⏭️",
                callback_data=f"pg|{page + 1}|{safe_cat}|{safe_query}",
            )
        )
    else:
        nav_row.append(InlineKeyboardButton(text="Last ⏹️", callback_data="noop"))

    buttons.append(nav_row)

    # Quick Inline Search Switch Row
    buttons.append(
        [
            InlineKeyboardButton(
                text="🔎 Switch to Real-Time Inline Mode",
                switch_inline_query_current_chat=query[:32],
            )
        ]
    )

    return InlineKeyboardMarkup(buttons)


@Client.on_message(filters.command(["start", "help"]) & (filters.private | filters.group))
async def start_or_help_handler(client: Client, message: Message) -> None:
    """Handle /start and /help commands, including deep-linked channel previews."""
    if message.from_user:
        is_banned, reason = await db.is_user_banned(message.from_user.id)
        if is_banned:
            await message.reply_text(f"🚫 **Access Restricted**\\nReason: \`{reason}\`")
            return
        await db.register_user(
            user_id=message.from_user.id,
            first_name=message.from_user.first_name or "",
            username=message.from_user.username or "",
        )

    if message.chat.type in (enums.ChatType.GROUP, enums.ChatType.SUPERGROUP):
        await db.register_group(
            chat_id=message.chat.id,
            title=message.chat.title or "",
            username=message.chat.username or "",
        )

    # Check if /start has a deep-link payload: /start ch_<channel_id>
    if len(message.command) > 1 and message.command[1].startswith("ch_"):
        target_id = message.command[1][3:]
        channel = await db.get_channel(target_id)
        if channel:
            await send_channel_detail_card(message, channel)
            return

    welcome_text = (
        "📡 **Telegram Channel Auto-Filter & Directory Bot**\\n\\n"
        "Type **any keyword, topic, or channel name** in this chat (or in connected groups) "
        "to search verified Telegram channels by title, category, or tags.\\n\\n"
        "**Popular Categories:**\\n"
        "\`Movies\` • \`Tech\` • \`Anime\` • \`Crypto\` • \`Deals\` • \`Education\`\\n\\n"
        "💡 *Tip: You can also search from any chat using inline mode by typing* "
        f"\`@{client.me.username} <keyword>\`"
    )
    keyboard = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("🎬 Movies", callback_data="pg|1|Movies|"),
                InlineKeyboardButton("💻 Tech", callback_data="pg|1|Tech|"),
                InlineKeyboardButton("⛩️ Anime", callback_data="pg|1|Anime|"),
            ],
            [
                InlineKeyboardButton("🪙 Crypto", callback_data="pg|1|Crypto|"),
                InlineKeyboardButton("🏷️ Deals", callback_data="pg|1|Deals|"),
                InlineKeyboardButton("🔎 Inline Search", switch_inline_query_current_chat=""),
            ],
        ]
    )
    await message.reply_text(welcome_text, reply_markup=keyboard, disable_web_page_preview=True)


async def send_channel_detail_card(message: Message, channel: Dict[str, Any]) -> None:
    """Send a rich card with full channel details and a direct Join link."""
    verified_badge = "✅ Verified" if channel.get("verified") else "Standard Listing"
    subs_text = format_subscribers(channel.get("subscribers_count", 0))
    keywords_str = ", ".join(channel.get("keywords", [])[:12]) or "None"
    description = channel.get("description") or "No description provided."
    invite_link = channel.get("invite_link") or f"https://t.me/{channel.get('username', '')}"

    text = (
        f"📢 **{channel.get('title')}**\\n"
        f"━━━━━━━━━━━━━━━━━━━━\\n"
        f"🏷 **Category:** \`{channel.get('category', 'General')}\`\\n"
        f"🛡 **Status:** {verified_badge}\\n"
        f"👥 **Subscribers:** \`{subs_text}\`\\n"
        f"🔗 **Handle:** \`@{channel.get('username', 'private')}\`\\n\\n"
        f"📝 **Description:**\\n{description}\\n\\n"
        f"🔑 **Tags:** \`{keywords_str}\`"
    )
    markup = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("🚀 Join / Open Channel", url=invite_link)],
        ]
    )
    await message.reply_text(text, reply_markup=markup, disable_web_page_preview=True)


@Client.on_message(
    filters.text
    & (filters.private | filters.group)
    & ~filters.via_bot
    & ~filters.Regex(r"^/")
)
async def auto_filter_search_handler(client: Client, message: Message) -> None:
    """
    Main Auto-Filter search handler for PMs and Connected Groups.
    Performs case-insensitive regex matching across indexed channels.
    """
    if not message.text or not message.from_user:
        return

    # Ignore very short 1-character noise in group chats
    query = message.text.strip()
    if len(query) < 2 or len(query) > 100:
        return

    # Enforce user ban status
    is_banned, reason = await db.is_user_banned(message.from_user.id)
    if is_banned:
        if message.chat.type == enums.ChatType.PRIVATE:
            await message.reply_text(f"🚫 **You are banned from using this bot.**\\nReason: \`{reason}\`")
        return

    # Track user & group activity asynchronously
    await db.register_user(
        user_id=message.from_user.id,
        first_name=message.from_user.first_name or "",
        username=message.from_user.username or "",
    )
    if message.chat.type in (enums.ChatType.GROUP, enums.ChatType.SUPERGROUP):
        await db.register_group(
            chat_id=message.chat.id,
            title=message.chat.title or "",
            username=message.chat.username or "",
        )

    results, total_matches, total_pages = await db.search_channels(
        query=query,
        page=1,
        per_page=Config.RESULTS_PER_PAGE,
    )

    if not results:
        if message.chat.type == enums.ChatType.PRIVATE:
            await message.reply_text(
                f"🔍 No indexed channels found matching **\`{query}\`**."
            )
        return

    header_text = (
        f"🔎 **Channel Search Results for:** \`{query}\`\\n"
        f"📊 Found **{total_matches}** matching channel(s) • Showing page **1/{total_pages}**\\n"
        f"👇 *Select a channel below to view details & join link:*"
    )
    keyboard = build_search_keyboard(
        channels=results,
        query=query,
        page=1,
        total_pages=total_pages,
    )

    try:
        await message.reply_text(
            header_text,
            reply_markup=keyboard,
            disable_web_page_preview=True,
        )
    except FloodWait as fw:
        logger.warning("FloodWait of %s seconds encountered", fw.value)


@Client.on_callback_query(filters.regex(r"^(pg|ch|noop)"))
async def search_callback_handler(client: Client, callback_query: CallbackQuery) -> None:
    """Handle pagination button clicks and channel inspection callbacks."""
    data = callback_query.data or ""

    if data == "noop":
        await callback_query.answer()
        return

    if callback_query.from_user:
        is_banned, reason = await db.is_user_banned(callback_query.from_user.id)
        if is_banned:
            await callback_query.answer(f"Banned: {reason}", show_alert=True)
            return

    parts = data.split("|")
    action = parts[0]

    # 1. Pagination Callback: pg|<page>|<category>|<query>
    if action == "pg" and len(parts) >= 4:
        try:
            target_page = int(parts[1])
        except ValueError:
            target_page = 1
        category = parts[2] if parts[2] != "all" else None
        query = parts[3]

        results, total_matches, total_pages = await db.search_channels(
            query=query,
            category=category,
            page=target_page,
            per_page=Config.RESULTS_PER_PAGE,
        )

        if not results:
            await callback_query.answer("No channels found for this filter.", show_alert=True)
            return

        filter_label = query if query else f"Category: {category}"
        header_text = (
            f"🔎 **Channel Search Results for:** \`{filter_label}\`\\n"
            f"📊 Found **{total_matches}** matching channel(s) • Showing page **{target_page}/{total_pages}**\\n"
            f"👇 *Select a channel below to view details & join link:*"
        )
        keyboard = build_search_keyboard(
            channels=results,
            query=query,
            page=target_page,
            total_pages=total_pages,
            category=category or "all",
        )

        try:
            await callback_query.edit_message_text(
                header_text,
                reply_markup=keyboard,
                disable_web_page_preview=True,
            )
        except MessageNotModified:
            pass
        await callback_query.answer()
        return

    # 2. Channel Detail Callback: ch|<channel_id>|<page>|<query>
    if action == "ch" and len(parts) >= 4:
        channel_id = parts[1]
        return_page = parts[2]
        return_query = parts[3]

        channel = await db.get_channel(channel_id)
        if not channel:
            await callback_query.answer("⚠️ This channel was removed from the index.", show_alert=True)
            return

        verified_badge = "✅ Verified Channel" if channel.get("verified") else "Standard Channel"
        subs_text = format_subscribers(channel.get("subscribers_count", 0))
        invite_link = channel.get("invite_link") or f"https://t.me/{channel.get('username', '')}"
        description = channel.get("description") or "Curated Telegram channel."
        keywords_str = ", ".join(channel.get("keywords", [])[:10]) or "general"

        detail_text = (
            f"📢 **{channel.get('title')}**\\n"
            f"━━━━━━━━━━━━━━━━━━━━\\n"
            f"🏷 **Category:** \`{channel.get('category', 'General')}\`\\n"
            f"🛡 **Status:** {verified_badge}\\n"
            f"👥 **Subscribers:** \`{subs_text}\`\\n"
            f"🔗 **Link:** {invite_link}\\n\\n"
            f"📝 **About Channel:**\\n{description}\\n\\n"
            f"🔑 **Indexed Keywords:** \`{keywords_str}\`"
        )

        detail_keyboard = InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("🚀 Join Channel Now", url=invite_link)],
                [
                    InlineKeyboardButton(
                        "🔙 Back to Search Results",
                        callback_data=f"pg|{return_page}|all|{return_query}",
                    )
                ],
            ]
        )

        try:
            await callback_query.edit_message_text(
                detail_text,
                reply_markup=detail_keyboard,
                disable_web_page_preview=True,
            )
        except MessageNotModified:
            pass
        await callback_query.answer(f"Loaded {channel.get('title')}")
`
  },
  {
    path: 'plugins/admin.py',
    filename: 'admin.py',
    moduleGroup: 'Plugins',
    description: 'Admin commands (/addchannel, /delchannel, /autoindex, forwarded post indexer, /stats, /broadcast, /ban, /unban).',
    linesOfCode: 274,
    language: 'python',
    content: `"""
Admin Management Plugin for Telegram Channel Auto-Filter Bot.
Implements:
- /addchannel <title> | <username/invite_link> | <category> | <keywords>
- /delchannel <channel_id_or_username>
- /autoindex <on|off> (Toggle auto-indexing of forwarded channel posts)
- Forwarded channel message auto-indexer (extracts ID, title, username, subscribers)
- /stats (Total indexed channels, verified channels, total users, banned users, active groups)
- /broadcast (Reply to any message to broadcast to all users & groups with FloodWait handling)
- /ban <user_id> [reason] and /unban <user_id>
"""

import asyncio
import logging
from typing import Tuple

from pyrogram import Client, enums, filters
from pyrogram.errors import (
    ChatAdminRequired,
    FloodWait,
    InputUserDeactivated,
    PeerIdInvalid,
    UserIsBlocked,
)
from pyrogram.types import Message

from config import Config
from database.mongo import db, tokenize_keywords

logger = logging.getLogger(__name__)

# Custom Pyrogram filter restricting commands to configured ADMINS
admin_filter = filters.user(Config.ADMINS)


@Client.on_message(filters.command("addchannel") & admin_filter)
async def add_channel_command(client: Client, message: Message) -> None:
    """
    Syntax:
    /addchannel <title> | <username/invite_link> | <category> | <keywords> [| <description>]
    """
    raw_args = message.text.split(maxsplit=1)
    if len(raw_args) < 2 or "|" not in raw_args[1]:
        usage = (
            "⚠️ **Invalid Format**\\n\\n"
            "**Usage:**\\n"
            "\`/addchannel <title> | <username/invite_link> | <category> | <keywords>\`\\n\\n"
            "**Example:**\\n"
            "\`/addchannel Python Developers Hub | @PythonDevsHub | Tech | python, asyncio, pyrogram, backend\`"
        )
        await message.reply_text(usage)
        return

    parts = [p.strip() for p in raw_args[1].split("|")]
    if len(parts) < 4:
        await message.reply_text(
            "⚠️ Please provide at least 4 pipe-separated fields:\\n"
            "\`<title> | <username/invite_link> | <category> | <keywords>\`"
        )
        return

    title, username_or_link, category, raw_keywords = parts[0], parts[1], parts[2], parts[3]
    description = parts[4] if len(parts) >= 5 else f"Curated {category} channel: {title}"
    keywords = tokenize_keywords(raw_keywords)

    # Attempt to resolve live channel metadata via Telegram API if public username or ID is given
    channel_id = username_or_link.lstrip("@").replace("https://t.me/", "").strip("/")
    subscribers_count = 0
    verified = False

    try:
        if not ("+" in channel_id or "joinchat" in channel_id):
            chat = await client.get_chat(username_or_link if username_or_link.startswith("@") else f"@{channel_id}")
            channel_id = str(chat.id)
            subscribers_count = getattr(chat, "members_count", 0) or 0
            verified = bool(getattr(chat, "is_verified", False))
            if getattr(chat, "description", None) and len(parts) < 5:
                description = chat.description
    except Exception as exc:
        logger.debug("Using fallback identifier for %s (%s)", username_or_link, exc)

    is_created, doc = await db.upsert_channel(
        channel_id=channel_id,
        title=title,
        username_or_link=username_or_link,
        category=category,
        keywords=keywords,
        description=description,
        verified=verified,
        subscribers_count=subscribers_count,
    )

    status_verb = "Indexed New Channel" if is_created else "Updated Existing Channel"
    await message.reply_text(
        f"✅ **{status_verb}**\\n\\n"
        f"• **ID:** \`{doc.get('channel_id')}\`\\n"
        f"• **Title:** {doc.get('title')}\\n"
        f"• **Category:** \`{doc.get('category')}\`\\n"
        f"• **Link:** {doc.get('invite_link')}\\n"
        f"• **Subscribers:** \`{doc.get('subscribers_count', 0)}\`\\n"
        f"• **Keywords:** \`{', '.join(doc.get('keywords', [])[:12])}\`",
        disable_web_page_preview=True,
    )


@Client.on_message(filters.command("delchannel") & admin_filter)
async def delete_channel_command(client: Client, message: Message) -> None:
    """Delete an indexed channel by its channel_id or @username."""
    if len(message.command) < 2:
        await message.reply_text("⚠️ **Usage:** \`/delchannel <channel_id or @username>\`")
        return

    identifier = message.command[1].strip()
    deleted = await db.delete_channel(identifier)
    if deleted:
        await message.reply_text(f"🗑️ Channel \`{identifier}\` has been removed from MongoDB.")
    else:
        await message.reply_text(f"❌ No channel found matching \`{identifier}\`.")


@Client.on_message(filters.command("autoindex") & admin_filter)
async def toggle_autoindex_command(client: Client, message: Message) -> None:
    """Toggle automatic indexing when an admin forwards a post from a channel."""
    if len(message.command) < 2 or message.command[1].lower() not in ("on", "off", "enable", "disable"):
        current = await db.get_auto_index_enabled()
        state_str = "ENABLED ✅" if current else "DISABLED ❌"
        await message.reply_text(
            f"⚙️ **Auto-Indexing Forwarded Channel Posts:** \`{state_str}\`\\n\\n"
            "To change: \`/autoindex on\` or \`/autoindex off\`"
        )
        return

    desired = message.command[1].lower() in ("on", "enable")
    await db.set_auto_index_enabled(desired)
    state_str = "ENABLED ✅" if desired else "DISABLED ❌"
    await message.reply_text(f"⚙️ Forwarded channel auto-indexing is now **{state_str}**.")


@Client.on_message(filters.private & filters.forwarded & admin_filter)
async def auto_index_forwarded_channel_post(client: Client, message: Message) -> None:
    """
    Auto-indexing handler: When an admin forwards a post from any public/private channel
    to the bot in PM, extract the origin channel's metadata and index it into MongoDB.
    """
    if not await db.get_auto_index_enabled():
        return

    origin_chat = message.forward_from_chat
    if not origin_chat or origin_chat.type != enums.ChatType.CHANNEL:
        return

    channel_id = str(origin_chat.id)
    title = origin_chat.title or "Untitled Channel"
    username = origin_chat.username or ""
    verified = bool(getattr(origin_chat, "is_verified", False))
    description = ""
    subscribers_count = 0
    invite_link = f"https://t.me/{username}" if username else ""

    try:
        full_chat = await client.get_chat(origin_chat.id)
        description = getattr(full_chat, "description", "") or ""
        subscribers_count = getattr(full_chat, "members_count", 0) or 0
        if not invite_link and getattr(full_chat, "invite_link", None):
            invite_link = full_chat.invite_link
    except Exception as exc:
        logger.debug("Could not fetch extended chat details for %s: %s", channel_id, exc)

    if not invite_link:
        await message.reply_text(
            f"⚠️ Cannot auto-index **{title}** (\`{channel_id}\`) because it is private and "
            "the bot does not have access to an invite link.\\n"
            "Use \`/addchannel\` with an explicit invite link instead."
        )
        return

    post_sample = (message.text or message.caption or "")[:200]
    keywords = tokenize_keywords(f"{title} {description} {post_sample}")

    is_created, doc = await db.upsert_channel(
        channel_id=channel_id,
        title=title,
        username_or_link=invite_link,
        category="General",
        keywords=keywords,
        description=description or post_sample,
        verified=verified,
        subscribers_count=subscribers_count,
    )

    action_label = "Auto-Indexed New Channel" if is_created else "Refreshed Channel Metadata"
    await message.reply_text(
        f"⚡ **{action_label} via Forwarded Post**\\n\\n"
        f"• **Title:** {doc.get('title')}\\n"
        f"• **Channel ID:** \`{doc.get('channel_id')}\`\\n"
        f"• **Handle / Link:** {doc.get('invite_link')}\\n"
        f"• **Subscribers:** \`{doc.get('subscribers_count', 0)}\`\\n"
        f"• **Extracted Keywords:** \`{', '.join(doc.get('keywords', [])[:10])}\`",
        disable_web_page_preview=True,
    )


@Client.on_message(filters.command("stats") & admin_filter)
async def stats_command(client: Client, message: Message) -> None:
    """Display live MongoDB collection counts and bot status."""
    stats = await db.get_stats()
    auto_idx = await db.get_auto_index_enabled()

    text = (
        "📊 **Telegram Channel Search Bot — Live Statistics**\\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━\\n"
        f"📢 **Total Indexed Channels:** \`{stats['total_channels']}\`\\n"
        f"✅ **Verified Channels:** \`{stats['verified_channels']}\`\\n"
        f"👤 **Registered Users:** \`{stats['total_users']}\`\\n"
        f"🚫 **Banned Users:** \`{stats['banned_users']}\`\\n"
        f"👥 **Connected Groups:** \`{stats['active_groups']}\`\\n"
        f"⚡ **Auto-Index Forwarded Posts:** \`{'ON' if auto_idx else 'OFF'}\`"
    )
    await message.reply_text(text)


@Client.on_message(filters.command("ban") & admin_filter)
async def ban_user_command(client: Client, message: Message) -> None:
    """Ban a user by user_id from searching or interacting with the bot."""
    if len(message.command) < 2:
        await message.reply_text("⚠️ **Usage:** \`/ban <user_id> [reason]\`")
        return

    try:
        target_user_id = int(message.command[1])
    except ValueError:
        await message.reply_text("❌ \`user_id\` must be a valid integer.")
        return

    if target_user_id in Config.ADMINS:
        await message.reply_text("❌ Cannot ban an administrator.")
        return

    reason = " ".join(message.command[2:]) if len(message.command) > 2 else "Spam / Abuse"
    await db.set_user_ban(target_user_id, is_banned=True, reason=reason)
    await message.reply_text(f"🚫 User \`{target_user_id}\` has been **banned**.\\nReason: \`{reason}\`")


@Client.on_message(filters.command("unban") & admin_filter)
async def unban_user_command(client: Client, message: Message) -> None:
    """Remove ban restriction for a user_id."""
    if len(message.command) < 2:
        await message.reply_text("⚠️ **Usage:** \`/unban <user_id>\`")
        return

    try:
        target_user_id = int(message.command[1])
    except ValueError:
        await message.reply_text("❌ \`user_id\` must be a valid integer.")
        return

    await db.set_user_ban(target_user_id, is_banned=False)
    await message.reply_text(f"✅ User \`{target_user_id}\` has been **unbanned**.")


async def _safe_copy_message(message: Message, chat_id: int) -> Tuple[bool, str]:
    """Copy a broadcast message to a target chat with automatic FloodWait handling."""
    try:
        await message.copy(chat_id=chat_id)
        return True, "ok"
    except FloodWait as fw:
        logger.warning("Broadcast FloodWait: sleeping for %s seconds", fw.value)
        await asyncio.sleep(fw.value + 1)
        try:
            await message.copy(chat_id=chat_id)
            return True, "ok"
        except Exception as retry_exc:
            return False, str(retry_exc)
    except (UserIsBlocked, InputUserDeactivated, PeerIdInvalid, ChatAdminRequired):
        return False, "unreachable"
    except Exception as exc:
        logger.error("Unexpected error broadcasting to %s: %s", chat_id, exc)
        return False, "error"


@Client.on_message(filters.command("broadcast") & admin_filter)
async def broadcast_command(client: Client, message: Message) -> None:
    """
    Broadcast a message to all registered users and active groups.
    Can be used by replying \`/broadcast\` to any message or via \`/broadcast <text>\`.
    """
    target_msg = message.reply_to_message
    direct_text = message.text.split(maxsplit=1)[1] if len(message.text.split(maxsplit=1)) > 1 else None

    if not target_msg and not direct_text:
        await message.reply_text(
            "⚠️ **Usage:** Reply \`/broadcast\` to any message you want to send, "
            "or run \`/broadcast <announcement text>\`."
        )
        return

    status_msg = await message.reply_text("📡 **Starting broadcast to users and connected groups...**")
    users_sent, users_failed = 0, 0
    groups_sent, groups_failed = 0, 0

    async for user_doc in db.iter_all_users():
        uid = user_doc["user_id"]
        if target_msg:
            ok, _ = await _safe_copy_message(target_msg, uid)
        else:
            try:
                await client.send_message(uid, direct_text)
                ok = True
            except FloodWait as fw:
                await asyncio.sleep(fw.value + 1)
                ok = False
            except Exception:
                ok = False

        if ok:
            users_sent += 1
        else:
            users_failed += 1
        await asyncio.sleep(0.04)

    async for group_doc in db.iter_all_groups():
        gid = group_doc["chat_id"]
        if target_msg:
            ok, _ = await _safe_copy_message(target_msg, gid)
        else:
            try:
                await client.send_message(gid, direct_text)
                ok = True
            except Exception:
                ok = False

        if ok:
            groups_sent += 1
        else:
            groups_failed += 1
        await asyncio.sleep(0.05)

    summary = (
        "✅ **Broadcast Completed**\\n"
        "━━━━━━━━━━━━━━━━━━━━\\n"
        f"👤 **Users Reached:** \`{users_sent}\` (Failed/Blocked: \`{users_failed}\`)\\n"
        f"👥 **Groups Reached:** \`{groups_sent}\` (Failed: \`{groups_failed}\`)"
    )
    await status_msg.edit_text(summary)
`
  },
  {
    path: 'plugins/inline.py',
    filename: 'inline.py',
    moduleGroup: 'Plugins',
    description: 'Telegram native inline query handler (@BotUsername <query>) returning real-time channel cards with join buttons.',
    linesOfCode: 112,
    language: 'python',
    content: `"""
Native Telegram Inline Search Handler (@BotUsername <query>).
Allows users in any chat to search indexed Telegram channels in real time
and share rich channel cards with direct Join buttons.
"""

import logging
from typing import List

from pyrogram import Client
from pyrogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQuery,
    InlineQueryResultArticle,
    InputTextMessageContent,
)

from config import Config
from database.mongo import db
from plugins.channel_filter import CATEGORY_BADGES, format_subscribers

logger = logging.getLogger(__name__)


@Client.on_inline_query()
async def inline_channel_search_handler(client: Client, inline_query: InlineQuery) -> None:
    """Handle @BotFather native inline queries with pagination via offset."""
    if inline_query.from_user:
        is_banned, reason = await db.is_user_banned(inline_query.from_user.id)
        if is_banned:
            await inline_query.answer(
                results=[],
                switch_pm_text=f"🚫 Access Restricted: {reason[:30]}",
                switch_pm_parameter="banned",
                cache_time=5,
            )
            return

    raw_query = inline_query.query.strip()
    try:
        page = int(inline_query.offset) if inline_query.offset else 1
    except ValueError:
        page = 1

    # Support optional category prefix in inline mode, e.g. "tech: python"
    category = None
    search_term = raw_query
    if ":" in raw_query:
        prefix, rest = raw_query.split(":", 1)
        if prefix.strip().capitalize() in Config.DEFAULT_CATEGORIES:
            category = prefix.strip()
            search_term = rest.strip()

    channels, total_matches, total_pages = await db.search_channels(
        query=search_term,
        category=category,
        page=page,
        per_page=Config.MAX_INLINE_RESULTS,
    )

    articles: List[InlineQueryResultArticle] = []
    for ch in channels:
        channel_id = str(ch.get("channel_id"))
        title = ch.get("title", "Untitled Channel")
        cat_name = ch.get("category", "General")
        badge = CATEGORY_BADGES.get(cat_name.lower(), "📢")
        verified = ch.get("verified", False)
        verified_mark = " ✔️" if verified else ""
        subs_str = format_subscribers(ch.get("subscribers_count", 0))
        invite_link = ch.get("invite_link") or f"https://t.me/{ch.get('username', '')}"
        description = ch.get("description") or f"Verified {cat_name} Telegram channel."
        keywords_str = ", ".join(ch.get("keywords", [])[:8]) or "general"

        message_text = (
            f"{badge} **{title}**{verified_mark}\\n"
            f"━━━━━━━━━━━━━━━━━━━━\\n"
            f"🏷 **Category:** \`{cat_name}\` | 👥 **Subscribers:** \`{subs_str}\`\\n\\n"
            f"📝 {description}\\n\\n"
            f"🔑 **Tags:** \`{keywords_str}\`"
        )

        articles.append(
            InlineQueryResultArticle(
                id=channel_id[:64],
                title=f"{badge} {title}{verified_mark}",
                description=f"[{cat_name} • {subs_str} subs] {description[:90]}",
                input_message_content=InputTextMessageContent(
                    message_text=message_text,
                    disable_web_page_preview=True,
                ),
                reply_markup=InlineKeyboardMarkup(
                    [
                        [InlineKeyboardButton("🚀 Join Channel", url=invite_link)],
                        [
                            InlineKeyboardButton(
                                "🔎 Search More Channels",
                                switch_inline_query_current_chat=search_term,
                            )
                        ],
                    ]
                ),
            )
        )

    next_offset = str(page + 1) if page < total_pages else ""
    pm_label = (
        f"Found {total_matches} channel(s) — Tap to open bot"
        if total_matches > 0
        else "No channels matched — Tap to browse categories"
    )

    await inline_query.answer(
        results=articles,
        cache_time=Config.INLINE_CACHE_TIME,
        is_personal=True,
        next_offset=next_offset,
        switch_pm_text=pm_label[:60],
        switch_pm_parameter="inline",
    )
`
  },
  {
    path: 'requirements.txt',
    filename: 'requirements.txt',
    moduleGroup: 'Deployment',
    description: 'Pinned production dependencies: Pyrogram v2, TgCrypto, uvloop, Motor (AsyncIO MongoDB), and python-dotenv.',
    linesOfCode: 14,
    language: 'ini',
    content: `# Pyrogram v2 & Crypto Speedups
pyrogram==2.0.106
tgcrypto==1.2.5

# High-Performance Event Loop (Linux/macOS)
uvloop==0.21.0; sys_platform != "win32"

# Async MongoDB Driver
motor==3.6.0
pymongo==4.9.2
dnspython==2.7.0

# Environment Management
python-dotenv==1.0.1
`
  },
  {
    path: '.env.example',
    filename: '.env.example',
    moduleGroup: 'Deployment',
    description: 'Template environment configuration for API_ID, API_HASH, BOT_TOKEN, MONGO_URI, ADMINS, and pagination.',
    linesOfCode: 19,
    language: 'ini',
    content: `# Telegram API Credentials (Get from https://my.telegram.org)
API_ID=12345678
API_HASH=your_api_hash_here
BOT_TOKEN=1234567890:AAH_your_botfather_token_here

# Async MongoDB Connection URI
MONGO_URI=mongodb+srv://username:password@cluster0.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=telegram_channel_autofilter
MONGO_MAX_POOL_SIZE=50
MONGO_MIN_POOL_SIZE=5

# Space or comma-separated Telegram User IDs of Bot Admins
ADMINS=123456789 987654321
LOG_CHANNEL=-1001234567890

# Pagination & Search Settings
RESULTS_PER_PAGE=8
MAX_INLINE_RESULTS=25
INLINE_CACHE_TIME=60
AUTO_INDEX_FORWARDED=true
`
  },
  {
    path: 'Dockerfile',
    filename: 'Dockerfile',
    moduleGroup: 'Deployment',
    description: 'Production container build compiling tgcrypto & uvloop on Python 3.11-slim.',
    linesOfCode: 15,
    language: 'dockerfile',
    content: `FROM python:3.11-slim

WORKDIR /app

# Install build essentials for tgcrypto & uvloop
RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc \\
    python3-dev \\
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "bot.py"]
`
  }
];
