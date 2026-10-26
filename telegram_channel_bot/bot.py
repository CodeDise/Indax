"""
Main entry point for Telegram Channel Auto-Filter & Search Bot.
Uses Pyrogram v2 with uvloop (when available) and Motor AsyncIO MongoDB.
"""

import asyncio
import logging
import signal
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
                f"🟢 **Channel Auto-Filter Bot Online**\n"
                f"• **Bot:** @{me.username}\n"
                f"• **Database:** `{Config.DATABASE_NAME}`",
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
