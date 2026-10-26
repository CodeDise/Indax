"""
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
from pymongo.errors import DuplicateKeyError, PyMongoError

from config import Config

logger = logging.getLogger(__name__)


def tokenize_keywords(raw_text: str) -> List[str]:
    """
    Tokenize a comma/space-separated string or sentence into normalized lowercase keywords.
    Removes special characters and duplicates while preserving order.
    """
    if not raw_text:
        return []
    tokens = re.split(r"[,|\s]+", raw_text.lower())
    seen = set()
    cleaned_tokens: List[str] = []
    for token in tokens:
        cleaned = re.sub(r"[^\w+#.-]", "", token).strip()
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
