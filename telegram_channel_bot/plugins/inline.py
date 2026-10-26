"""
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
            f"{badge} **{title}**{verified_mark}\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"🏷 **Category:** `{cat_name}` | 👥 **Subscribers:** `{subs_str}`\n\n"
            f"📝 {description}\n\n"
            f"🔑 **Tags:** `{keywords_str}`"
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
