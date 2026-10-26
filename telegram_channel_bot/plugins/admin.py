"""
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
            "⚠️ **Invalid Format**\n\n"
            "**Usage:**\n"
            "`/addchannel <title> | <username/invite_link> | <category> | <keywords>`\n\n"
            "**Example:**\n"
            "`/addchannel Python Developers Hub | @PythonDevsHub | Tech | python, asyncio, pyrogram, backend`"
        )
        await message.reply_text(usage)
        return

    parts = [p.strip() for p in raw_args[1].split("|")]
    if len(parts) < 4:
        await message.reply_text(
            "⚠️ Please provide at least 4 pipe-separated fields:\n"
            "`<title> | <username/invite_link> | <category> | <keywords>`"
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
        f"✅ **{status_verb}**\n\n"
        f"• **ID:** `{doc.get('channel_id')}`\n"
        f"• **Title:** {doc.get('title')}\n"
        f"• **Category:** `{doc.get('category')}`\n"
        f"• **Link:** {doc.get('invite_link')}\n"
        f"• **Subscribers:** `{doc.get('subscribers_count', 0)}`\n"
        f"• **Keywords:** `{', '.join(doc.get('keywords', [])[:12])}`",
        disable_web_page_preview=True,
    )


@Client.on_message(filters.command("delchannel") & admin_filter)
async def delete_channel_command(client: Client, message: Message) -> None:
    """Delete an indexed channel by its channel_id or @username."""
    if len(message.command) < 2:
        await message.reply_text("⚠️ **Usage:** `/delchannel <channel_id or @username>`")
        return

    identifier = message.command[1].strip()
    deleted = await db.delete_channel(identifier)
    if deleted:
        await message.reply_text(f"🗑️ Channel `{identifier}` has been removed from MongoDB.")
    else:
        await message.reply_text(f"❌ No channel found matching `{identifier}`.")


@Client.on_message(filters.command("autoindex") & admin_filter)
async def toggle_autoindex_command(client: Client, message: Message) -> None:
    """Toggle automatic indexing when an admin forwards a post from a channel."""
    if len(message.command) < 2 or message.command[1].lower() not in ("on", "off", "enable", "disable"):
        current = await db.get_auto_index_enabled()
        state_str = "ENABLED ✅" if current else "DISABLED ❌"
        await message.reply_text(
            f"⚙️ **Auto-Indexing Forwarded Channel Posts:** `{state_str}`\n\n"
            "To change: `/autoindex on` or `/autoindex off`"
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

    # Fetch rich channel info (description, member count, invite link if bot is admin)
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
            f"⚠️ Cannot auto-index **{title}** (`{channel_id}`) because it is private and "
            "the bot does not have access to an invite link.\n"
            "Use `/addchannel` with an explicit invite link instead."
        )
        return

    # Extract extra keywords from the forwarded post caption/text
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
        f"⚡ **{action_label} via Forwarded Post**\n\n"
        f"• **Title:** {doc.get('title')}\n"
        f"• **Channel ID:** `{doc.get('channel_id')}`\n"
        f"• **Handle / Link:** {doc.get('invite_link')}\n"
        f"• **Subscribers:** `{doc.get('subscribers_count', 0)}`\n"
        f"• **Extracted Keywords:** `{', '.join(doc.get('keywords', [])[:10])}`",
        disable_web_page_preview=True,
    )


@Client.on_message(filters.command("stats") & admin_filter)
async def stats_command(client: Client, message: Message) -> None:
    """Display live MongoDB collection counts and bot status."""
    stats = await db.get_stats()
    auto_idx = await db.get_auto_index_enabled()

    text = (
        "📊 **Telegram Channel Search Bot — Live Statistics**\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📢 **Total Indexed Channels:** `{stats['total_channels']}`\n"
        f"✅ **Verified Channels:** `{stats['verified_channels']}`\n"
        f"👤 **Registered Users:** `{stats['total_users']}`\n"
        f"🚫 **Banned Users:** `{stats['banned_users']}`\n"
        f"👥 **Connected Groups:** `{stats['active_groups']}`\n"
        f"⚡ **Auto-Index Forwarded Posts:** `{'ON' if auto_idx else 'OFF'}`"
    )
    await message.reply_text(text)


@Client.on_message(filters.command("ban") & admin_filter)
async def ban_user_command(client: Client, message: Message) -> None:
    """Ban a user by user_id from searching or interacting with the bot."""
    if len(message.command) < 2:
        await message.reply_text("⚠️ **Usage:** `/ban <user_id> [reason]`")
        return

    try:
        target_user_id = int(message.command[1])
    except ValueError:
        await message.reply_text("❌ `user_id` must be a valid integer.")
        return

    if target_user_id in Config.ADMINS:
        await message.reply_text("❌ Cannot ban an administrator.")
        return

    reason = " ".join(message.command[2:]) if len(message.command) > 2 else "Spam / Abuse"
    await db.set_user_ban(target_user_id, is_banned=True, reason=reason)
    await message.reply_text(f"🚫 User `{target_user_id}` has been **banned**.\nReason: `{reason}`")


@Client.on_message(filters.command("unban") & admin_filter)
async def unban_user_command(client: Client, message: Message) -> None:
    """Remove ban restriction for a user_id."""
    if len(message.command) < 2:
        await message.reply_text("⚠️ **Usage:** `/unban <user_id>`")
        return

    try:
        target_user_id = int(message.command[1])
    except ValueError:
        await message.reply_text("❌ `user_id` must be a valid integer.")
        return

    await db.set_user_ban(target_user_id, is_banned=False)
    await message.reply_text(f"✅ User `{target_user_id}` has been **unbanned**.")


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
    Can be used by replying `/broadcast` to any message (text, photo, button post)
    or via `/broadcast <announcement text>`.
    """
    target_msg = message.reply_to_message
    direct_text = message.text.split(maxsplit=1)[1] if len(message.text.split(maxsplit=1)) > 1 else None

    if not target_msg and not direct_text:
        await message.reply_text(
            "⚠️ **Usage:** Reply `/broadcast` to any message you want to send, "
            "or run `/broadcast <announcement text>`."
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
        await asyncio.sleep(0.04)  # Respect Telegram 25 msgs/sec broadcast ceiling

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
        "✅ **Broadcast Completed**\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 **Users Reached:** `{users_sent}` (Failed/Blocked: `{users_failed}`)\n"
        f"👥 **Groups Reached:** `{groups_sent}` (Failed: `{groups_failed}`)"
    )
    await status_msg.edit_text(summary)
