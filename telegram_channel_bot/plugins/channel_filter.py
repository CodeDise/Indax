"""
Auto-Filter & Channel Search Engine Plugin for Pyrogram v2.
Handles:
- /start and /help onboarding commands
- Automatic text filtering in Private Messages & Connected Groups
- Interactive Inline Keyboard Pagination ([⏮️ Previous] [Page 1/X] [Next ⏭️])
- Category filter buttons
- Detailed Channel Info View / Callback Popup with direct Invite Link
"""

import logging
from typing import Any, Dict, List, Optional

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
            await message.reply_text(f"🚫 **Access Restricted**\nReason: `{reason}`")
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
        "📡 **Telegram Channel Auto-Filter & Directory Bot**\n\n"
        "Type **any keyword, topic, or channel name** in this chat (or in connected groups) "
        "to search verified Telegram channels by title, category, or tags.\n\n"
        "**Popular Categories:**\n"
        "`Movies` • `Tech` • `Anime` • `Crypto` • `Deals` • `Education`\n\n"
        "💡 *Tip: You can also search from any chat using inline mode by typing* "
        f"`@{client.me.username} <keyword>`"
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
        f"📢 **{channel.get('title')}**\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"🏷 **Category:** `{channel.get('category', 'General')}`\n"
        f"🛡 **Status:** {verified_badge}\n"
        f"👥 **Subscribers:** `{subs_text}`\n"
        f"🔗 **Handle:** `@{channel.get('username', 'private')}`\n\n"
        f"📝 **Description:**\n{description}\n\n"
        f"🔑 **Tags:** `{keywords_str}`"
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
            await message.reply_text(f"🚫 **You are banned from using this bot.**\nReason: `{reason}`")
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
        # In private chat, notify user when no channels match; in groups stay quiet to avoid spam
        if message.chat.type == enums.ChatType.PRIVATE:
            await message.reply_text(
                f"🔍 No indexed channels found matching **`{query}`**.\n"
                "Try searching with broader keywords or browse by category using /start."
            )
        return

    header_text = (
        f"🔎 **Channel Search Results for:** `{query}`\n"
        f"📊 Found **{total_matches}** matching channel(s) • Showing page **1/{total_pages}**\n"
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
        logger.warning("FloodWait of %s seconds encountered in auto_filter_search_handler", fw.value)


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
            f"🔎 **Channel Search Results for:** `{filter_label}`\n"
            f"📊 Found **{total_matches}** matching channel(s) • Showing page **{target_page}/{total_pages}**\n"
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
            f"📢 **{channel.get('title')}**\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"🏷 **Category:** `{channel.get('category', 'General')}`\n"
            f"🛡 **Status:** {verified_badge}\n"
            f"👥 **Subscribers:** `{subs_text}`\n"
            f"🔗 **Link:** {invite_link}\n\n"
            f"📝 **About Channel:**\n{description}\n\n"
            f"🔑 **Indexed Keywords:** `{keywords_str}`"
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
