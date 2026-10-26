import React, { useState, useMemo } from 'react';
import {
  Terminal,
  Database,
  MessageSquare,
  Settings,
  Copy,
  Check,
  Download,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  Plus,
  Forward,
  ExternalLink,
  Code2,
  ChevronLeft,
  ChevronRight,
  Sliders,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { PYTHON_PROJECT_FILES, PythonFileEntry } from './data/pythonProjectFiles';
import {
  INITIAL_CHANNELS,
  INITIAL_USERS,
  INITIAL_GROUPS,
  SAMPLE_FORWARDABLE_POSTS,
  ChannelDocument,
  UserDocument,
  GroupDocument,
  tokenizeKeywordsJS,
  formatSubscribersJS,
} from './data/initialDatabase';

type ActiveSection = 'codebase' | 'simulator' | 'database' | 'envbuilder';
type SimulatorChatMode = 'pm' | 'group' | 'inline';
type SimulatedActor = 'admin' | 'user' | 'banned';

interface InlineButton {
  text: string;
  callbackData?: string;
  url?: string;
  switchInlineQuery?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  senderName: string;
  senderRole?: string;
  timestamp: string;
  text: string;
  isForwarded?: boolean;
  forwardedFromTitle?: string;
  inlineKeyboard?: InlineButton[][];
  mongoQueryLog?: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  movies: '🎬',
  tech: '💻',
  anime: '⛩️',
  crypto: '🪙',
  deals: '🏷️',
  education: '📚',
  gaming: '🎮',
  news: '📰',
  general: '📢',
};

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('codebase');

  // Codebase Explorer State
  const [selectedFilePath, setSelectedFilePath] = useState<string>('bot.py');
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [codeSearchQuery, setCodeSearchQuery] = useState<string>('');

  // Simulated MongoDB State
  const [channels, setChannels] = useState<ChannelDocument[]>(INITIAL_CHANNELS);
  const [users, setUsers] = useState<UserDocument[]>(INITIAL_USERS);
  const [groups] = useState<GroupDocument[]>(INITIAL_GROUPS);
  const [autoIndexForwarded, setAutoIndexForwarded] = useState<boolean>(true);
  const [resultsPerPage, setResultsPerPage] = useState<number>(4);

  // Simulator State
  const [chatMode, setChatMode] = useState<SimulatorChatMode>('pm');
  const [actor, setActor] = useState<SimulatedActor>('admin');
  const [inputMessage, setInputMessage] = useState<string>('');
  const [inlineSearchText, setInlineSearchText] = useState<string>('python');
  const [activeQueryLog, setActiveQueryLog] = useState<string>(
    `db.channels.find({\n  "$and": [\n    { "$or": [\n      { "title": { "$regex": "python", "$options": "i" } },\n      { "keywords": { "$regex": "python", "$options": "i" } },\n      { "description": { "$regex": "python", "$options": "i" } }\n    ]}\n  ]\n}).sort([("verified", -1), ("subscribers_count", -1)]).skip(0).limit(4)`
  );

  // Database Inspector State
  const [dbTab, setDbTab] = useState<'channels' | 'users' | 'groups' | 'indexes'>('channels');
  const [dbSearch, setDbSearch] = useState<string>('');
  const [dbCategoryFilter, setDbCategoryFilter] = useState<string>('All');
  const [newChannelTitle, setNewChannelTitle] = useState<string>('');
  const [newChannelLink, setNewChannelLink] = useState<string>('');
  const [newChannelCategory, setNewChannelCategory] = useState<string>('Tech');
  const [newChannelKeywords, setNewChannelKeywords] = useState<string>('');
  const [newChannelDesc, setNewChannelDesc] = useState<string>('');
  const [newChannelSubs, setNewChannelSubs] = useState<string>('45000');
  const [newChannelVerified, setNewChannelVerified] = useState<boolean>(true);

  // .env & Config Builder State
  const [envApiId, setEnvApiId] = useState<string>('28491024');
  const [envApiHash, setEnvApiHash] = useState<string>('9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c');
  const [envBotToken, setEnvBotToken] = useState<string>('7192837465:AAH_PyrogramV2ChannelSearchBotToken');
  const [envMongoUri, setEnvMongoUri] = useState<string>('mongodb+srv://botadmin:password@cluster0.mongodb.net/?retryWrites=true&w=majority');
  const [envDbName, setEnvDbName] = useState<string>('telegram_channel_autofilter');
  const [envAdmins, setEnvAdmins] = useState<string>('123456789 501928374');
  const [envLogChannel, setEnvLogChannel] = useState<string>('-1001928374650');
  const [copiedEnv, setCopiedEnv] = useState<boolean>(false);

  // Helper to run the exact Motor regex search logic in JS
  const runMongoRegexSearch = (
    query: string,
    category: string | null,
    page: number,
    perPage: number = resultsPerPage
  ) => {
    const cleanQuery = query.trim();
    const tokens = cleanQuery ? tokenizeKeywordsJS(cleanQuery) : [];
    const effectiveTokens = cleanQuery && tokens.length === 0 ? [cleanQuery.toLowerCase()] : tokens;

    const matched = channels
      .filter((ch) => {
        if (category && category.toLowerCase() !== 'all') {
          if (ch.category.toLowerCase() !== category.toLowerCase()) return false;
        }
        if (effectiveTokens.length === 0) return true;

        return effectiveTokens.every((tok) => {
          const haystacks = [
            ch.title.toLowerCase(),
            ch.description.toLowerCase(),
            ch.category.toLowerCase(),
            ch.username.toLowerCase(),
            ...ch.keywords.map((k) => k.toLowerCase()),
          ];
          return haystacks.some((h) => h.includes(tok));
        });
      })
      .sort((a, b) => {
        if (a.verified !== b.verified) return a.verified ? -1 : 1;
        return b.subscribers_count - a.subscribers_count;
      });

    const totalMatches = matched.length;
    const totalPages = Math.max(1, Math.ceil(totalMatches / perPage));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (safePage - 1) * perPage;
    const pageItems = matched.slice(startIdx, startIdx + perPage);

    const mongoQueryStr = JSON.stringify(
      {
        ...(category && category.toLowerCase() !== 'all'
          ? { category: { $regex: `^${category}$`, $options: 'i' } }
          : {}),
        ...(effectiveTokens.length > 0
          ? {
              $and: effectiveTokens.map((t) => ({
                $or: [
                  { title: { $regex: t, $options: 'i' } },
                  { keywords: { $regex: t, $options: 'i' } },
                  { description: { $regex: t, $options: 'i' } },
                  { category: { $regex: t, $options: 'i' } },
                ],
              })),
            }
          : {}),
      },
      null,
      2
    );

    const fullMotorCall = `await db.channels.find(${mongoQueryStr})\n  .sort([("verified", -1), ("subscribers_count", -1)])\n  .skip(${startIdx})\n  .limit(${perPage})`;

    return {
      pageItems,
      totalMatches,
      totalPages,
      safePage,
      fullMotorCall,
    };
  };

  // Build Pyrogram InlineKeyboardMarkup structure
  const buildSearchInlineKeyboard = (
    pageItems: ChannelDocument[],
    query: string,
    page: number,
    totalPages: number,
    category: string = 'all'
  ): InlineButton[][] => {
    const safeQuery = query.slice(0, 24).replace(/\|/g, ' ');
    const safeCat = (category || 'all').slice(0, 10).replace(/\|/g, '');
    const rows: InlineButton[][] = [];

    for (const ch of pageItems) {
      const badge = CATEGORY_ICONS[ch.category.toLowerCase()] || '📢';
      const verifiedMark = ch.verified ? ' ✔️' : '';
      const subsLabel = ch.subscribers_count > 0 ? ` • ${formatSubscribersJS(ch.subscribers_count)}` : '';
      rows.push([
        {
          text: `${badge} ${ch.title}${verifiedMark} [${ch.category}${subsLabel}]`,
          callbackData: `ch|${ch.channel_id}|${page}|${safeQuery}`,
        },
      ]);
    }

    const navRow: InlineButton[] = [];
    if (page > 1) {
      navRow.push({
        text: '⏮️ Previous',
        callbackData: `pg|${page - 1}|${safeCat}|${safeQuery}`,
      });
    } else {
      navRow.push({ text: '⏹️ First', callbackData: 'noop' });
    }

    navRow.push({
      text: `📄 Page ${page}/${totalPages}`,
      callbackData: 'noop',
    });

    if (page < totalPages) {
      navRow.push({
        text: 'Next ⏭️',
        callbackData: `pg|${page + 1}|${safeCat}|${safeQuery}`,
      });
    } else {
      navRow.push({ text: 'Last ⏹️', callbackData: 'noop' });
    }

    rows.push(navRow);
    rows.push([
      {
        text: '🔎 Switch to Real-Time Inline Mode',
        switchInlineQuery: query,
      },
    ]);

    return rows;
  };

  // Initial Chat History for the Telegram Bot Simulator
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initialSearch = runMongoRegexSearch('tech', null, 1, 4);
    return [
      {
        id: 'msg-welcome',
        sender: 'bot',
        senderName: 'ChannelAutoFilterBot',
        senderRole: 'Pyrogram v2 Bot',
        timestamp: '23:18',
        text:
          '📡 Telegram Channel Auto-Filter & Directory Bot\n\n' +
          'Type any keyword, topic, or channel name in this chat (or in connected groups) to search verified Telegram channels by title, category, or tags.\n\n' +
          'Popular Categories:\nMovies · Tech · Anime · Crypto · Deals · Education',
        inlineKeyboard: [
          [
            { text: '🎬 Movies', callbackData: 'pg|1|Movies|' },
            { text: '💻 Tech', callbackData: 'pg|1|Tech|' },
            { text: '⛩️ Anime', callbackData: 'pg|1|Anime|' },
          ],
          [
            { text: '🪙 Crypto', callbackData: 'pg|1|Crypto|' },
            { text: '🏷️ Deals', callbackData: 'pg|1|Deals|' },
            { text: '🔎 Inline Mode', switchInlineQuery: 'python' },
          ],
        ],
      },
      {
        id: 'msg-user-1',
        sender: 'user',
        senderName: 'Admin (123456789)',
        timestamp: '23:19',
        text: 'tech',
      },
      {
        id: 'msg-bot-1',
        sender: 'bot',
        senderName: 'ChannelAutoFilterBot',
        senderRole: 'Pyrogram v2 Bot',
        timestamp: '23:19',
        text:
          `🔎 Channel Search Results for: "tech"\n` +
          `📊 Found ${initialSearch.totalMatches} matching channel(s) • Showing page 1/${initialSearch.totalPages}\n` +
          `👇 Select a channel below to view details & join link:`,
        inlineKeyboard: buildSearchInlineKeyboard(
          initialSearch.pageItems,
          'tech',
          1,
          initialSearch.totalPages
        ),
        mongoQueryLog: initialSearch.fullMotorCall,
      },
    ];
  });

  const selectedFile: PythonFileEntry = useMemo(() => {
    return PYTHON_PROJECT_FILES.find((f) => f.path === selectedFilePath) || PYTHON_PROJECT_FILES[0];
  }, [selectedFilePath]);

  const filteredCodeFiles = useMemo(() => {
    if (!codeSearchQuery.trim()) return PYTHON_PROJECT_FILES;
    const q = codeSearchQuery.toLowerCase();
    return PYTHON_PROJECT_FILES.filter(
      (f) =>
        f.path.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.content.toLowerCase().includes(q)
    );
  }, [codeSearchQuery]);

  const handleCopyCode = (path: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedFile(path);
    setTimeout(() => setCopiedFile(null), 1800);
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export a single Python bootstrap script that creates all folders and files locally
  const handleExportFullBundle = () => {
    const filesPayload: Record<string, string> = {};
    for (const file of PYTHON_PROJECT_FILES) {
      filesPayload[file.path] = file.content;
    }
    const bootstrapScript = `#!/usr/bin/env python3
"""
Self-Extracting Project Generator for Telegram Channel Auto-Filter & Search Bot.
Run \`python3 setup_channel_autofilter_bot.py\` to unpack the entire modular codebase.
"""
import json
from pathlib import Path

FILES = ${JSON.stringify(filesPayload, null, 2)}

def unpack():
    base = Path("telegram_channel_bot")
    for rel_path, content in FILES.items():
        target = base / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        print(f"Created: {target}")
    print("\\n✅ Project unpacked in ./telegram_channel_bot")
    print("Next steps:\\n  cd telegram_channel_bot\\n  cp .env.example .env\\n  pip install -r requirements.txt\\n  python bot.py")

if __name__ == "__main__":
    unpack()
`;
    handleDownloadFile('setup_channel_autofilter_bot.py', bootstrapScript);
  };

  // Handle sending a message or command in the Telegram Simulator
  const handleSendSimulatedMessage = (overrideText?: string) => {
    const raw = (overrideText !== undefined ? overrideText : inputMessage).trim();
    if (!raw) return;
    if (overrideText === undefined) setInputMessage('');

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const actorLabel =
      actor === 'admin'
        ? 'Admin (123456789)'
        : actor === 'user'
        ? 'Alex (501928374)'
        : 'SpamBot99 (792837461)';
    const currentUserId = actor === 'admin' ? 123456789 : actor === 'user' ? 501928374 : 792837461;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      senderName: actorLabel,
      timestamp: nowTime,
      text: raw,
    };

    // Check if actor is banned in DB
    const userDoc = users.find((u) => u.user_id === currentUserId);
    if (userDoc?.is_banned) {
      const banReply: ChatMessage = {
        id: `bot-${Date.now() + 1}`,
        sender: 'bot',
        senderName: 'ChannelAutoFilterBot',
        timestamp: nowTime,
        text: `🚫 Access Restricted\nYou are banned from using this bot.\nReason: ${userDoc.ban_reason || 'Spam / Abuse'}`,
        mongoQueryLog: `await db.users.find_one({"user_id": ${currentUserId}}, {"is_banned": 1, "ban_reason": 1})`,
      };
      setMessages((prev) => [...prev, userMsg, banReply]);
      setActiveQueryLog(banReply.mongoQueryLog!);
      return;
    }

    // Handle Commands
    if (raw.startsWith('/')) {
      const [cmdToken, ...restTokens] = raw.split(/\s+/);
      const cmd = cmdToken.toLowerCase();
      const restText = raw.slice(cmdToken.length).trim();

      if (cmd === '/start' || cmd === '/help') {
        const reply: ChatMessage = {
          id: `bot-${Date.now() + 1}`,
          sender: 'bot',
          senderName: 'ChannelAutoFilterBot',
          timestamp: nowTime,
          text:
            '📡 Telegram Channel Auto-Filter & Directory Bot\n\n' +
            'Type any keyword, topic, or channel name in this chat (or in connected groups) to search verified Telegram channels by title, category, or tags.\n\n' +
            'Admin Commands:\n' +
            '/addchannel <title> | <link> | <category> | <keywords>\n' +
            '/delchannel <id_or_username>\n' +
            '/autoindex <on|off>\n' +
            '/stats · /broadcast · /ban · /unban',
          inlineKeyboard: [
            [
              { text: '🎬 Movies', callbackData: 'pg|1|Movies|' },
              { text: '💻 Tech', callbackData: 'pg|1|Tech|' },
              { text: '⛩️ Anime', callbackData: 'pg|1|Anime|' },
            ],
            [
              { text: '🪙 Crypto', callbackData: 'pg|1|Crypto|' },
              { text: '🏷️ Deals', callbackData: 'pg|1|Deals|' },
              { text: '🔎 Inline Mode', switchInlineQuery: 'crypto' },
            ],
          ],
        };
        setMessages((prev) => [...prev, userMsg, reply]);
        return;
      }

      // Admin-only command guard
      if (actor !== 'admin') {
        const deniedMsg: ChatMessage = {
          id: `bot-${Date.now() + 1}`,
          sender: 'bot',
          senderName: 'ChannelAutoFilterBot',
          timestamp: nowTime,
          text: '🔒 Admin Permission Required: This command is restricted to user IDs listed in Config.ADMINS.',
        };
        setMessages((prev) => [...prev, userMsg, deniedMsg]);
        return;
      }

      if (cmd === '/stats') {
        const verifiedCount = channels.filter((c) => c.verified).length;
        const bannedCount = users.filter((u) => u.is_banned).length;
        const statsQuery = `await asyncio.gather(\n  db.channels.count_documents({}),\n  db.channels.count_documents({"verified": True}),\n  db.users.count_documents({}),\n  db.groups.count_documents({"is_active": True})\n)`;
        const reply: ChatMessage = {
          id: `bot-${Date.now() + 1}`,
          sender: 'bot',
          senderName: 'ChannelAutoFilterBot',
          timestamp: nowTime,
          text:
            `📊 Telegram Channel Search Bot — Live Statistics\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📢 Total Indexed Channels: ${channels.length}\n` +
            `✅ Verified Channels: ${verifiedCount}\n` +
            `👤 Registered Users: ${users.length}\n` +
            `🚫 Banned Users: ${bannedCount}\n` +
            `👥 Connected Groups: ${groups.length}\n` +
            `⚡ Auto-Index Forwarded Posts: ${autoIndexForwarded ? 'ON' : 'OFF'}`,
          mongoQueryLog: statsQuery,
        };
        setActiveQueryLog(statsQuery);
        setMessages((prev) => [...prev, userMsg, reply]);
        return;
      }

      if (cmd === '/addchannel') {
        const parts = restText.split('|').map((p) => p.trim());
        if (parts.length < 4) {
          const usageMsg: ChatMessage = {
            id: `bot-${Date.now() + 1}`,
            sender: 'bot',
            senderName: 'ChannelAutoFilterBot',
            timestamp: nowTime,
            text:
              '⚠️ Invalid Format\n\nUsage:\n/addchannel <title> | <username/invite_link> | <category> | <keywords>\n\nExample:\n/addchannel AI Papers Daily | @AIPapersDaily | Tech | ai, llm, machinelearning, research',
          };
          setMessages((prev) => [...prev, userMsg, usageMsg]);
          return;
        }

        const [title, linkRaw, category, rawKeywords, optionalDesc] = parts;
        const cleanHandle = linkRaw.replace(/^@/, '').replace('https://t.me/', '').replace(/\//g, '');
        const inviteUrl = linkRaw.startsWith('http') ? linkRaw : `https://t.me/${cleanHandle}`;
        const keywords = tokenizeKeywordsJS(`${title} ${category} ${rawKeywords}`);
        const newDoc: ChannelDocument = {
          channel_id: `-100${Math.floor(1000000000 + Math.random() * 8999999999)}`,
          title,
          username: cleanHandle,
          invite_link: inviteUrl,
          category: category || 'General',
          keywords,
          description: optionalDesc || `Curated ${category} Telegram channel: ${title}.`,
          verified: true,
          subscribers_count: Math.floor(12000 + Math.random() * 95000),
          created_at: new Date().toISOString(),
        };

        setChannels((prev) => [newDoc, ...prev]);
        const upsertLog = `await db.channels.update_one(\n  {"channel_id": "${newDoc.channel_id}"},\n  {"$set": ${JSON.stringify(
          {
            title: newDoc.title,
            username: newDoc.username,
            invite_link: newDoc.invite_link,
            category: newDoc.category,
            keywords: newDoc.keywords,
          },
          null,
          2
        )}},\n  upsert=True\n)`;
        setActiveQueryLog(upsertLog);

        const reply: ChatMessage = {
          id: `bot-${Date.now() + 1}`,
          sender: 'bot',
          senderName: 'ChannelAutoFilterBot',
          timestamp: nowTime,
          text:
            `✅ Indexed New Channel\n\n` +
            `• ID: ${newDoc.channel_id}\n` +
            `• Title: ${newDoc.title}\n` +
            `• Category: ${newDoc.category}\n` +
            `• Link: ${newDoc.invite_link}\n` +
            `• Keywords: ${newDoc.keywords.join(', ')}`,
          mongoQueryLog: upsertLog,
        };
        setMessages((prev) => [...prev, userMsg, reply]);
        return;
      }

      if (cmd === '/delchannel') {
        const target = restTokens[0]?.trim();
        if (!target) {
          setMessages((prev) => [
            ...prev,
            userMsg,
            {
              id: `bot-${Date.now() + 1}`,
              sender: 'bot',
              senderName: 'ChannelAutoFilterBot',
              timestamp: nowTime,
              text: '⚠️ Usage: /delchannel <channel_id or @username>',
            },
          ]);
          return;
        }
        const cleanTarget = target.replace(/^@/, '').toLowerCase();
        const exists = channels.some(
          (c) => c.channel_id.toLowerCase() === cleanTarget || c.username.toLowerCase() === cleanTarget
        );
        if (exists) {
          setChannels((prev) =>
            prev.filter(
              (c) => c.channel_id.toLowerCase() !== cleanTarget && c.username.toLowerCase() !== cleanTarget
            )
          );
        }
        const delLog = `await db.channels.delete_one({"$or": [{"channel_id": "${cleanTarget}"}, {"username": {"$regex": "^${cleanTarget}$", "$options": "i"}}]})`;
        setActiveQueryLog(delLog);
        setMessages((prev) => [
          ...prev,
          userMsg,
          {
            id: `bot-${Date.now() + 1}`,
            sender: 'bot',
            senderName: 'ChannelAutoFilterBot',
            timestamp: nowTime,
            text: exists
              ? `🗑️ Channel "${target}" has been removed from MongoDB.`
              : `❌ No channel found matching "${target}".`,
            mongoQueryLog: delLog,
          },
        ]);
        return;
      }

      if (cmd === '/autoindex') {
        const arg = restTokens[0]?.toLowerCase();
        if (arg === 'on' || arg === 'off') {
          const nextState = arg === 'on';
          setAutoIndexForwarded(nextState);
          setMessages((prev) => [
            ...prev,
            userMsg,
            {
              id: `bot-${Date.now() + 1}`,
              sender: 'bot',
              senderName: 'ChannelAutoFilterBot',
              timestamp: nowTime,
              text: `⚙️ Forwarded channel auto-indexing is now ${nextState ? 'ENABLED ✅' : 'DISABLED ❌'}.`,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            userMsg,
            {
              id: `bot-${Date.now() + 1}`,
              sender: 'bot',
              senderName: 'ChannelAutoFilterBot',
              timestamp: nowTime,
              text: `⚙️ Auto-Indexing Forwarded Channel Posts: ${autoIndexForwarded ? 'ENABLED ✅' : 'DISABLED ❌'}\nTo change: /autoindex on or /autoindex off`,
            },
          ]);
        }
        return;
      }

      if (cmd === '/broadcast') {
        const textToBroadcast = restText || '🚀 New verified channels added to the directory! Search now.';
        const activeUserCount = users.filter((u) => !u.is_banned).length;
        const broadcastLog = `async for user in db.users.find({"is_banned": {"$ne": True}}):\n  await message.copy(chat_id=user["user_id"])\n  await asyncio.sleep(0.04)  # FloodWait protection`;
        setActiveQueryLog(broadcastLog);
        setMessages((prev) => [
          ...prev,
          userMsg,
          {
            id: `bot-${Date.now() + 1}`,
            sender: 'bot',
            senderName: 'ChannelAutoFilterBot',
            timestamp: nowTime,
            text:
              `✅ Broadcast Completed\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `📢 Message: "${textToBroadcast}"\n` +
              `👤 Users Reached: ${activeUserCount} (Failed/Blocked: 0)\n` +
              `👥 Groups Reached: ${groups.length} (Failed: 0)`,
            mongoQueryLog: broadcastLog,
          },
        ]);
        return;
      }

      if (cmd === '/ban' || cmd === '/unban') {
        const targetId = Number(restTokens[0]);
        const isBanning = cmd === '/ban';
        const reason = restTokens.slice(1).join(' ') || 'Spam / Abuse';
        if (!targetId) {
          setMessages((prev) => [
            ...prev,
            userMsg,
            {
              id: `bot-${Date.now() + 1}`,
              sender: 'bot',
              senderName: 'ChannelAutoFilterBot',
              timestamp: nowTime,
              text: `⚠️ Usage: ${cmd} <user_id>${isBanning ? ' [reason]' : ''}`,
            },
          ]);
          return;
        }
        setUsers((prev) => {
          const exists = prev.some((u) => u.user_id === targetId);
          if (exists) {
            return prev.map((u) =>
              u.user_id === targetId ? { ...u, is_banned: isBanning, ban_reason: isBanning ? reason : null } : u
            );
          }
          return [
            ...prev,
            {
              user_id: targetId,
              first_name: `User_${targetId}`,
              username: `user_${targetId}`,
              is_banned: isBanning,
              ban_reason: isBanning ? reason : null,
              joined_at: new Date().toISOString(),
            },
          ];
        });
        const banLog = `await db.users.update_one({"user_id": ${targetId}}, {"$set": {"is_banned": ${
          isBanning ? 'True' : 'False'
        }, "ban_reason": ${isBanning ? `"${reason}"` : 'None'}}}, upsert=True)`;
        setActiveQueryLog(banLog);
        setMessages((prev) => [
          ...prev,
          userMsg,
          {
            id: `bot-${Date.now() + 1}`,
            sender: 'bot',
            senderName: 'ChannelAutoFilterBot',
            timestamp: nowTime,
            text: isBanning
              ? `🚫 User ${targetId} has been banned.\nReason: ${reason}`
              : `✅ User ${targetId} has been unbanned.`,
            mongoQueryLog: banLog,
          },
        ]);
        return;
      }
    }

    // Standard Auto-Filter Text Query
    const searchRes = runMongoRegexSearch(raw, null, 1, resultsPerPage);
    setActiveQueryLog(searchRes.fullMotorCall);

    if (searchRes.totalMatches === 0) {
      const noMatchMsg: ChatMessage = {
        id: `bot-${Date.now() + 1}`,
        sender: 'bot',
        senderName: 'ChannelAutoFilterBot',
        timestamp: nowTime,
        text:
          chatMode === 'group'
            ? `(Group Auto-Filter Silent Mode: 0 channels matched "${raw}", so the bot stays quiet in group chats to prevent spam.)`
            : `🔍 No indexed channels found matching "${raw}".\nTry searching for: python, movies, crypto, anime, deals, linux, or systemdesign.`,
        mongoQueryLog: searchRes.fullMotorCall,
      };
      setMessages((prev) => [...prev, userMsg, noMatchMsg]);
      return;
    }

    const botReply: ChatMessage = {
      id: `bot-${Date.now() + 1}`,
      sender: 'bot',
      senderName: 'ChannelAutoFilterBot',
      timestamp: nowTime,
      text:
        `🔎 Channel Search Results for: "${raw}"\n` +
        `📊 Found ${searchRes.totalMatches} matching channel(s) • Showing page 1/${searchRes.totalPages}\n` +
        `👇 Select a channel below to view details & join link:`,
      inlineKeyboard: buildSearchInlineKeyboard(
        searchRes.pageItems,
        raw,
        1,
        searchRes.totalPages
      ),
      mongoQueryLog: searchRes.fullMotorCall,
    };

    setMessages((prev) => [...prev, userMsg, botReply]);
  };

  // Handle Inline Keyboard Callback Clicks (Pagination & Channel Detail Inspection)
  const handleInlineButtonClick = (messageId: string, button: InlineButton) => {
    if (button.switchInlineQuery !== undefined) {
      setChatMode('inline');
      setInlineSearchText(button.switchInlineQuery || 'python');
      return;
    }
    if (button.url) {
      return;
    }
    const data = button.callbackData || '';
    if (!data || data === 'noop') return;

    const parts = data.split('|');
    const action = parts[0];

    // Pagination Callback: pg|<page>|<category>|<query>
    if (action === 'pg' && parts.length >= 4) {
      const targetPage = parseInt(parts[1], 10) || 1;
      const category = parts[2] !== 'all' ? parts[2] : null;
      const query = parts[3] || '';

      const searchRes = runMongoRegexSearch(query, category, targetPage, resultsPerPage);
      setActiveQueryLog(searchRes.fullMotorCall);

      const filterLabel = query ? query : `Category: ${category}`;
      const updatedText =
        `🔎 Channel Search Results for: "${filterLabel}"\n` +
        `📊 Found ${searchRes.totalMatches} matching channel(s) • Showing page ${searchRes.safePage}/${searchRes.totalPages}\n` +
        `👇 Select a channel below to view details & join link:`;

      const updatedKeyboard = buildSearchInlineKeyboard(
        searchRes.pageItems,
        query,
        searchRes.safePage,
        searchRes.totalPages,
        category || 'all'
      );

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, text: updatedText, inlineKeyboard: updatedKeyboard, mongoQueryLog: searchRes.fullMotorCall }
            : m
        )
      );
      return;
    }

    // Channel Detail Callback: ch|<channel_id>|<page>|<query>
    if (action === 'ch' && parts.length >= 4) {
      const channelId = parts[1];
      const returnPage = parts[2];
      const returnQuery = parts[3];

      const ch = channels.find((c) => c.channel_id === channelId);
      if (!ch) return;

      const findOneQuery = `await db.channels.find_one({"channel_id": "${channelId}"})`;
      setActiveQueryLog(findOneQuery);

      const detailText =
        `📢 ${ch.title}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏷 Category: ${ch.category}\n` +
        `🛡 Status: ${ch.verified ? '✅ Verified Channel' : 'Standard Channel'}\n` +
        `👥 Subscribers: ${formatSubscribersJS(ch.subscribers_count)}\n` +
        `🔗 Link: ${ch.invite_link}\n\n` +
        `📝 About Channel:\n${ch.description}\n\n` +
        `🔑 Indexed Keywords: ${ch.keywords.join(', ')}`;

      const detailKeyboard: InlineButton[][] = [
        [{ text: `🚀 Join @${ch.username}`, url: ch.invite_link }],
        [
          {
            text: '🔙 Back to Search Results',
            callbackData: `pg|${returnPage}|all|${returnQuery}`,
          },
        ],
      ];

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, text: detailText, inlineKeyboard: detailKeyboard, mongoQueryLog: findOneQuery }
            : m
        )
      );
    }
  };

  // Simulate Forwarding a Channel Post to Auto-Index
  const handleSimulateForwardPost = (sampleIdx: number) => {
    const sample = SAMPLE_FORWARDABLE_POSTS[sampleIdx % SAMPLE_FORWARDABLE_POSTS.length];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const fwdMsg: ChatMessage = {
      id: `fwd-${Date.now()}`,
      sender: 'user',
      senderName: actor === 'admin' ? 'Admin (123456789)' : 'Alex (501928374)',
      timestamp: nowTime,
      isForwarded: true,
      forwardedFromTitle: `${sample.title} (@${sample.username})`,
      text: sample.sample_post_text,
    };

    if (actor !== 'admin') {
      setMessages((prev) => [
        ...prev,
        fwdMsg,
        {
          id: `bot-${Date.now() + 1}`,
          sender: 'bot',
          senderName: 'ChannelAutoFilterBot',
          timestamp: nowTime,
          text: 'ℹ️ Forwarded post ignored (only admins can auto-index channels by forwarding posts).',
        },
      ]);
      return;
    }

    if (!autoIndexForwarded) {
      setMessages((prev) => [
        ...prev,
        fwdMsg,
        {
          id: `bot-${Date.now() + 1}`,
          sender: 'bot',
          senderName: 'ChannelAutoFilterBot',
          timestamp: nowTime,
          text: '⚙️ Auto-indexing of forwarded channel posts is currently OFF. Run /autoindex on to enable.',
        },
      ]);
      return;
    }

    const extractedKeywords = tokenizeKeywordsJS(
      `${sample.title} ${sample.description} ${sample.sample_post_text}`
    );

    const newChannel: ChannelDocument = {
      channel_id: sample.origin_channel_id,
      title: sample.title,
      username: sample.username,
      invite_link: `https://t.me/${sample.username}`,
      category: sample.category,
      description: sample.description,
      keywords: extractedKeywords,
      verified: sample.verified,
      subscribers_count: sample.subscribers_count,
      created_at: new Date().toISOString(),
    };

    setChannels((prev) => {
      const exists = prev.some((c) => c.channel_id === newChannel.channel_id);
      if (exists) {
        return prev.map((c) => (c.channel_id === newChannel.channel_id ? newChannel : c));
      }
      return [newChannel, ...prev];
    });

    const autoIndexLog = `await db.upsert_channel(\n  channel_id="${newChannel.channel_id}",\n  title="${newChannel.title}",\n  username_or_link="${newChannel.invite_link}",\n  keywords=${JSON.stringify(extractedKeywords.slice(0, 8))}\n)`;
    setActiveQueryLog(autoIndexLog);

    const botConfirm: ChatMessage = {
      id: `bot-${Date.now() + 1}`,
      sender: 'bot',
      senderName: 'ChannelAutoFilterBot',
      timestamp: nowTime,
      text:
        `⚡ Auto-Indexed Channel via Forwarded Post\n\n` +
        `• Title: ${newChannel.title}\n` +
        `• Channel ID: ${newChannel.channel_id}\n` +
        `• Handle: @${newChannel.username}\n` +
        `• Subscribers: ${formatSubscribersJS(newChannel.subscribers_count)}\n` +
        `• Extracted Keywords: ${extractedKeywords.slice(0, 10).join(', ')}`,
      mongoQueryLog: autoIndexLog,
    };

    setMessages((prev) => [...prev, fwdMsg, botConfirm]);
  };

  // Real-time Inline Query Results (`@ChannelFilterBot <query>`)
  const inlineQueryResults = useMemo(() => {
    let category: string | null = null;
    let searchTerm = inlineSearchText.trim();
    if (searchTerm.includes(':')) {
      const [prefix, rest] = searchTerm.split(':', 2);
      category = prefix.trim();
      searchTerm = rest.trim();
    }
    return runMongoRegexSearch(searchTerm, category, 1, 10);
  }, [inlineSearchText, channels]);

  // Filtered Channels for MongoDB Inspector
  const filteredDbChannels = useMemo(() => {
    return channels.filter((ch) => {
      if (dbCategoryFilter !== 'All' && ch.category.toLowerCase() !== dbCategoryFilter.toLowerCase()) {
        return false;
      }
      if (!dbSearch.trim()) return true;
      const q = dbSearch.toLowerCase();
      return (
        ch.title.toLowerCase().includes(q) ||
        ch.username.toLowerCase().includes(q) ||
        ch.channel_id.toLowerCase().includes(q) ||
        ch.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [channels, dbCategoryFilter, dbSearch]);

  const handleAddChannelFromDbForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelTitle.trim() || !newChannelLink.trim()) return;
    const cleanHandle = newChannelLink.trim().replace(/^@/, '').replace('https://t.me/', '').replace(/\//g, '');
    const inviteUrl = newChannelLink.trim().startsWith('http')
      ? newChannelLink.trim()
      : `https://t.me/${cleanHandle}`;
    const keywords = tokenizeKeywordsJS(`${newChannelTitle} ${newChannelCategory} ${newChannelKeywords} ${newChannelDesc}`);

    const doc: ChannelDocument = {
      channel_id: `-100${Math.floor(1000000000 + Math.random() * 8999999999)}`,
      title: newChannelTitle.trim(),
      username: cleanHandle,
      invite_link: inviteUrl,
      category: newChannelCategory,
      keywords,
      description: newChannelDesc.trim() || `Curated ${newChannelCategory} channel on Telegram.`,
      verified: newChannelVerified,
      subscribers_count: parseInt(newChannelSubs, 10) || 0,
      created_at: new Date().toISOString(),
    };

    setChannels((prev) => [doc, ...prev]);
    setNewChannelTitle('');
    setNewChannelLink('');
    setNewChannelKeywords('');
    setNewChannelDesc('');
  };

  const generatedEnvContent = useMemo(() => {
    return `# Telegram MTProto API Credentials (from https://my.telegram.org)
API_ID=${envApiId}
API_HASH=${envApiHash}
BOT_TOKEN=${envBotToken}

# Async MongoDB (Motor) Configuration
MONGO_URI=${envMongoUri}
DATABASE_NAME=${envDbName}
MONGO_MAX_POOL_SIZE=50
MONGO_MIN_POOL_SIZE=5

# Bot Administrators & Logging
ADMINS=${envAdmins}
LOG_CHANNEL=${envLogChannel}

# Search & Pagination Tuning
RESULTS_PER_PAGE=${resultsPerPage}
MAX_INLINE_RESULTS=25
INLINE_CACHE_TIME=60
AUTO_INDEX_FORWARDED=${autoIndexForwarded ? 'true' : 'false'}
`;
  }, [
    envApiId,
    envApiHash,
    envBotToken,
    envMongoUri,
    envDbName,
    envAdmins,
    envLogChannel,
    resultsPerPage,
    autoIndexForwarded,
  ]);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      {/* Top Bar Contract: Zone 1 Brand | Zone 2 Nav Links | Zone 3 Primary Action */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800/80 bg-[#0B0F17]/95 sticky top-0 z-30 backdrop-blur-sm">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('codebase');
          }}
          className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap shrink-0"
        >
          TeleIndex Pyrogram v2
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            onClick={() => setActiveSection('codebase')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'codebase'
                ? 'text-white border-sky-500'
                : 'border-transparent'
            }`}
          >
            Python Codebase
          </button>
          <button
            onClick={() => setActiveSection('simulator')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'simulator'
                ? 'text-white border-sky-500'
                : 'border-transparent'
            }`}
          >
            Bot & Inline Simulator
          </button>
          <button
            onClick={() => setActiveSection('database')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'database'
                ? 'text-white border-sky-500'
                : 'border-transparent'
            }`}
          >
            MongoDB Collections
          </button>
          <button
            onClick={() => setActiveSection('envbuilder')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'envbuilder'
                ? 'text-white border-sky-500'
                : 'border-transparent'
            }`}
          >
            Environment Builder
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleExportFullBundle}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Python Project
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center gap-1 px-4 py-2 border-b border-slate-800 bg-slate-900/60 overflow-x-auto">
        <button
          onClick={() => setActiveSection('codebase')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeSection === 'codebase' ? 'bg-sky-500 text-slate-950 font-semibold' : 'text-slate-400'
          }`}
        >
          Python Codebase
        </button>
        <button
          onClick={() => setActiveSection('simulator')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeSection === 'simulator' ? 'bg-sky-500 text-slate-950 font-semibold' : 'text-slate-400'
          }`}
        >
          Bot Simulator
        </button>
        <button
          onClick={() => setActiveSection('database')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeSection === 'database' ? 'bg-sky-500 text-slate-950 font-semibold' : 'text-slate-400'
          }`}
        >
          MongoDB Schema
        </button>
        <button
          onClick={() => setActiveSection('envbuilder')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeSection === 'envbuilder' ? 'bg-sky-500 text-slate-950 font-semibold' : 'text-slate-400'
          }`}
        >
          .env Builder
        </button>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6 flex flex-col gap-6">
        {/* Top Architecture Summary Strip */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/90">
          <div className="flex flex-col justify-between">
            <span className="text-xs text-slate-400">Framework & Event Loop</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-base font-semibold text-white font-display">Pyrogram v2.0.106</span>
              <span className="text-xs font-mono text-sky-400 tabular-nums">uvloop + asyncio</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              16 worker coroutines · TgCrypto MTProto
            </p>
          </div>

          <div className="flex flex-col justify-between md:border-l md:border-slate-800 md:pl-4">
            <span className="text-xs text-slate-400">Async Database Driver</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-base font-semibold text-white font-display">Motor 3.6 (MongoDB)</span>
              <span className="text-xs font-mono text-emerald-400 tabular-nums">
                {channels.length} indexed
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Connection pool · Tokenized regex index
            </p>
          </div>

          <div className="flex flex-col justify-between md:border-l md:border-slate-800 md:pl-4">
            <span className="text-xs text-slate-400">Auto-Filter & Inline Engine</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-base font-semibold text-white font-display">PM · Group · Inline</span>
              <span className="text-xs font-mono text-slate-300 tabular-nums">
                {resultsPerPage} / page
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Dynamic callback pagination & deep-links
            </p>
          </div>

          <div className="flex flex-col justify-between md:border-l md:border-slate-800 md:pl-4">
            <span className="text-xs text-slate-400">Interactive Test Mode</span>
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={() => setActiveSection('simulator')}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open Live Simulator
              </button>
              <button
                onClick={() => setActiveSection('database')}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800/60 hover:bg-slate-800 text-slate-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Inspect DB ({channels.length})
              </button>
            </div>
          </div>
        </section>

        {/* ===================================================================
            SECTION 1: MODULAR PYTHON CODEBASE EXPLORER
           =================================================================== */}
        {activeSection === 'codebase' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left File Tree Sidebar */}
            <div className="lg:col-span-4 xl:col-span-3 bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white font-display">
                  Project Modules (telegram_channel_bot/)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Production-ready Python files with zero placeholders
                </p>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={codeSearchQuery}
                  onChange={(e) => setCodeSearchQuery(e.target.value)}
                  placeholder="Search files or functions..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                {filteredCodeFiles.map((file) => {
                  const isSelected = file.path === selectedFile.path;
                  return (
                    <button
                      key={file.path}
                      onClick={() => setSelectedFilePath(file.path)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex flex-col gap-1 cursor-pointer ${
                        isSelected
                          ? 'bg-sky-500/15 border border-sky-500/40 text-white'
                          : 'hover:bg-slate-800/60 border border-transparent text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-medium truncate">
                          {file.path}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                          {file.linesOfCode}L
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 line-clamp-1">
                        {file.moduleGroup} · {file.description}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Quick Run Instructions */}
              <div className="pt-3 border-t border-slate-800 flex flex-col gap-2">
                <span className="text-xs font-semibold text-slate-200">
                  Quick Deployment Commands
                </span>
                <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800/90 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
{`pip install -r requirements.txt
cp .env.example .env
# Edit .env with API_ID, BOT_TOKEN, MONGO_URI
python bot.py`}
                </pre>
              </div>
            </div>

            {/* Right Code Viewer */}
            <div className="lg:col-span-8 xl:col-span-9 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-900/90">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Code2 className="w-4 h-4 text-sky-400" />
                    <span className="font-mono text-sm font-semibold text-white">
                      telegram_channel_bot/{selectedFile.path}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{selectedFile.linesOfCode} lines</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedFile.moduleGroup}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{selectedFile.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopyCode(selectedFile.path, selectedFile.content)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedFile === selectedFile.path ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Code
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDownloadFile(selectedFile.filename, selectedFile.content)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download {selectedFile.filename}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[680px] overflow-y-auto bg-[#070A0F] p-5">
                <pre className="text-xs font-mono leading-relaxed text-slate-200 select-all">
                  {selectedFile.content.split('\n').map((line, idx) => (
                    <div key={idx} className="table-row hover:bg-slate-900/60">
                      <span className="table-cell pr-4 text-right text-slate-600 select-none tabular-nums w-10">
                        {idx + 1}
                      </span>
                      <span className="table-cell whitespace-pre">{line}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SECTION 2: LIVE TELEGRAM BOT & INLINE QUERY SIMULATOR
           =================================================================== */}
        {activeSection === 'simulator' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Interactive Telegram Client Simulator */}
            <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
              {/* Simulator Toolbar */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setChatMode('pm')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      chatMode === 'pm'
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Private Chat (PM)
                  </button>
                  <button
                    onClick={() => setChatMode('group')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      chatMode === 'group'
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Connected Group
                  </button>
                  <button
                    onClick={() => setChatMode('inline')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      chatMode === 'inline'
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Inline Query (@Bot)
                  </button>
                </div>

                {/* Actor Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Sender:</span>
                  <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setActor('admin')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        actor === 'admin'
                          ? 'bg-slate-800 text-sky-400'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Admin
                    </button>
                    <button
                      onClick={() => setActor('user')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        actor === 'user'
                          ? 'bg-slate-800 text-emerald-400'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Regular User
                    </button>
                    <button
                      onClick={() => setActor('banned')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        actor === 'banned'
                          ? 'bg-slate-800 text-rose-400'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Banned User
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Sample Trigger Bar */}
              <div className="px-4 py-2.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                  Try Query / Command:
                </span>
                {['python', 'movies', 'crypto', 'anime', 'deals', '/stats', '/broadcast Weekly digest live!'].map(
                  (sample) => (
                    <button
                      key={sample}
                      onClick={() => {
                        if (chatMode === 'inline' && !sample.startsWith('/')) {
                          setInlineSearchText(sample);
                        } else {
                          setChatMode('pm');
                          handleSendSimulatedMessage(sample);
                        }
                      }}
                      className="px-2.5 py-1 text-xs font-mono bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    >
                      {sample}
                    </button>
                  )
                )}
              </div>

              {/* Chat Viewport or Inline Query Drawer */}
              {chatMode === 'inline' ? (
                <div className="p-5 flex flex-col gap-4 min-h-[500px] bg-[#080C14]">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      Telegram Native Inline Query Bar (plugins/inline.py)
                    </label>
                    <div className="flex items-center bg-slate-900 border border-sky-500/50 rounded-lg px-3 py-2 gap-2">
                      <span className="font-mono text-xs text-sky-400 shrink-0">
                        @ChannelAutoFilterBot
                      </span>
                      <input
                        type="text"
                        value={inlineSearchText}
                        onChange={(e) => setInlineSearchText(e.target.value)}
                        placeholder="Type keyword or category:keyword (e.g. tech: python)..."
                        className="w-full bg-transparent text-sm text-white focus:outline-none font-mono"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                      <span>
                        Found {inlineQueryResults.totalMatches} channel(s) — Tap any result to post card to chat
                      </span>
                      <span className="font-mono tabular-nums">
                        cache_time={60}s · is_personal=True
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-slate-900/50 overflow-hidden">
                    {inlineQueryResults.pageItems.length === 0 ? (
                      <div className="p-8 text-center text-sm text-slate-400">
                        No channels matched "{inlineSearchText}". Try "python", "movies", "crypto", or "deals".
                      </div>
                    ) : (
                      inlineQueryResults.pageItems.map((ch) => {
                        const badge = CATEGORY_ICONS[ch.category.toLowerCase()] || '📢';
                        return (
                          <div
                            key={ch.channel_id}
                            className="p-3.5 hover:bg-slate-800/60 transition-colors flex items-start justify-between gap-4"
                          >
                            <div className="flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                <span>{badge}</span>
                                <span className="truncate">{ch.title}</span>
                                {ch.verified && (
                                  <span className="text-xs text-sky-400 font-normal">· Verified</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-300 line-clamp-1">
                                [{ch.category} · {formatSubscribersJS(ch.subscribers_count)} subs] {ch.description}
                              </p>
                              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                                <span>@{ch.username}</span>
                                <span aria-hidden="true">·</span>
                                <span>{ch.keywords.slice(0, 5).join(', ')}</span>
                              </div>
                            </div>

                            <a
                              href={ch.invite_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 text-xs font-medium bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-lg whitespace-nowrap shrink-0 flex items-center gap-1"
                            >
                              Join
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-5 flex flex-col gap-4 max-h-[520px] min-h-[460px] overflow-y-auto bg-[#080C14]">
                    {messages.map((msg) => {
                      const isBot = msg.sender === 'bot';
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col max-w-[88%] ${
                            isBot ? 'self-start' : 'self-end items-end'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1 px-1">
                            <span className="font-medium text-slate-300">{msg.senderName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{msg.timestamp}</span>
                          </div>

                          <div
                            className={`rounded-xl p-3.5 text-xs leading-relaxed whitespace-pre-wrap border ${
                              isBot
                                ? 'bg-slate-900/95 border-slate-800 text-slate-100'
                                : 'bg-sky-600/20 border-sky-500/30 text-slate-100'
                            }`}
                          >
                            {msg.isForwarded && (
                              <div className="mb-2 pb-1.5 border-b border-sky-500/20 text-[11px] text-sky-300 flex items-center gap-1.5">
                                <Forward className="w-3.5 h-3.5" />
                                <span>Forwarded from {msg.forwardedFromTitle}</span>
                              </div>
                            )}
                            {msg.text}

                            {/* Pyrogram InlineKeyboardMarkup Buttons */}
                            {msg.inlineKeyboard && msg.inlineKeyboard.length > 0 && (
                              <div className="mt-3 pt-2.5 border-t border-slate-800 flex flex-col gap-1.5">
                                {msg.inlineKeyboard.map((row, rIdx) => (
                                  <div
                                    key={rIdx}
                                    className="grid gap-1.5"
                                    style={{
                                      gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
                                    }}
                                  >
                                    {row.map((btn, bIdx) =>
                                      btn.url ? (
                                        <a
                                          key={bIdx}
                                          href={btn.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="px-2.5 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-medium text-xs text-center truncate flex items-center justify-center gap-1.5 transition-colors"
                                        >
                                          <span className="truncate">{btn.text}</span>
                                          <ExternalLink className="w-3 h-3 shrink-0" />
                                        </a>
                                      ) : (
                                        <button
                                          key={bIdx}
                                          onClick={() => handleInlineButtonClick(msg.id, btn)}
                                          className="px-2.5 py-2 rounded-lg bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/70 text-slate-100 font-medium text-xs text-center truncate transition-colors cursor-pointer"
                                        >
                                          {btn.text}
                                        </button>
                                      )
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Message Input Bar */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendSimulatedMessage();
                    }}
                    className="p-3.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder={
                        chatMode === 'group'
                          ? 'Type a search query in Connected Group (e.g., anime, crypto, deals)...'
                          : 'Type a search keyword or command (/addchannel, /stats, /ban)...'
                      }
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Send
                    </button>
                  </form>
                </>
              )}
            </div>

            {/* Right Column: Admin Command Launcher & Live Motor MongoDB Query Log */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              {/* Forwarded Post Auto-Indexing Tester */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white font-display">
                      Forwarded Post Auto-Indexer (plugins/admin.py)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Simulate forwarding a channel post to the bot in PM
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoIndexForwarded((v) => !v)}
                    className={`px-3 py-1 text-xs font-mono rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      autoIndexForwarded
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    AUTO_INDEX: {autoIndexForwarded ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {SAMPLE_FORWARDABLE_POSTS.map((post, idx) => (
                    <div
                      key={post.origin_channel_id}
                      className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/90 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {post.title} · @{post.username}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {post.sample_post_text}
                        </p>
                      </div>
                      <button
                        onClick={() => handleSimulateForwardPost(idx)}
                        className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Forward className="w-3.5 h-3.5" />
                        Forward Post
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Admin Command Presets */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-white font-display">
                  One-Click Admin Command Triggers
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      handleSendSimulatedMessage(
                        '/addchannel AI Research Hub | @AIResearchHub | Tech | ai, llm, pytorch, papers'
                      )
                    }
                    className="p-2.5 text-left rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
                  >
                    <div className="font-mono text-xs text-sky-400 font-medium">/addchannel</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      Index @AIResearchHub with tags
                    </div>
                  </button>

                  <button
                    onClick={() => handleSendSimulatedMessage('/stats')}
                    className="p-2.5 text-left rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
                  >
                    <div className="font-mono text-xs text-emerald-400 font-medium">/stats</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      Query live MongoDB counts
                    </div>
                  </button>

                  <button
                    onClick={() =>
                      handleSendSimulatedMessage('/ban 792837461 Automated flood queries')
                    }
                    className="p-2.5 text-left rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
                  >
                    <div className="font-mono text-xs text-amber-400 font-medium">/ban 792837461</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      Restrict spam user account
                    </div>
                  </button>

                  <button
                    onClick={() => handleSendSimulatedMessage('/unban 792837461')}
                    className="p-2.5 text-left rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
                  >
                    <div className="font-mono text-xs text-slate-200 font-medium">/unban 792837461</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      Restore user search access
                    </div>
                  </button>
                </div>
              </div>

              {/* Motor AsyncIO Query Inspector */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white font-display">
                    Executed Motor (Async MongoDB) Operation
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">database/mongo.py</span>
                </div>
                <pre className="p-3.5 rounded-lg bg-[#070A0F] border border-slate-800/90 text-xs font-mono text-sky-300 overflow-x-auto leading-relaxed">
                  {activeQueryLog}
                </pre>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SECTION 3: MONGODB COLLECTIONS & SCHEMA INSPECTOR
           =================================================================== */}
        {activeSection === 'database' && (
          <section className="flex flex-col gap-6">
            {/* Collection Selector & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
                <button
                  onClick={() => setDbTab('channels')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    dbTab === 'channels'
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  channels ({channels.length})
                </button>
                <button
                  onClick={() => setDbTab('users')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    dbTab === 'users'
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  users ({users.length})
                </button>
                <button
                  onClick={() => setDbTab('groups')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    dbTab === 'groups'
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  groups ({groups.length})
                </button>
                <button
                  onClick={() => setDbTab('indexes')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    dbTab === 'indexes'
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  MongoDB Indexes (6)
                </button>
              </div>

              {dbTab === 'channels' && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
                    {['All', 'Tech', 'Movies', 'Crypto', 'Anime', 'Deals', 'Education'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setDbCategoryFilter(cat)}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          dbCategoryFilter === cat
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={dbSearch}
                      onChange={(e) => setDbSearch(e.target.value)}
                      placeholder="Regex filter channels..."
                      className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {dbTab === 'channels' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Channels Table */}
                <div className="lg:col-span-8 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] font-medium text-slate-400 bg-slate-900/90">
                          <th className="py-3 px-4">Channel Title & Handle</th>
                          <th className="py-3 px-3">Category</th>
                          <th className="py-3 px-3">Tokenized Keywords</th>
                          <th className="py-3 px-3 text-right">Subscribers</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 text-xs">
                        {filteredDbChannels.map((ch) => (
                          <tr key={ch.channel_id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white flex items-center gap-1.5">
                                <span>{ch.title}</span>
                                {ch.verified && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                {ch.channel_id} · @{ch.username}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                              {ch.category}
                            </td>
                            <td className="py-3 px-3 text-slate-400 font-mono text-[11px] max-w-[260px] truncate">
                              {ch.keywords.join(' · ')}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200">
                              {ch.subscribers_count.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <button
                                onClick={() =>
                                  setChannels((prev) =>
                                    prev.filter((item) => item.channel_id !== ch.channel_id)
                                  )
                                }
                                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Delete channel from MongoDB"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Direct Upsert Channel Form */}
                <form
                  onSubmit={handleAddChannelFromDbForm}
                  className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-3.5"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-white font-display">
                      Index Channel into MongoDB
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Calls <code className="text-sky-400">db.upsert_channel()</code> and tokenizes keywords
                    </p>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-300">Channel Title</label>
                    <input
                      type="text"
                      required
                      value={newChannelTitle}
                      onChange={(e) => setNewChannelTitle(e.target.value)}
                      placeholder="e.g., PyTorch & Deep Learning Daily"
                      className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-300">@Username or Link</label>
                      <input
                        type="text"
                        required
                        value={newChannelLink}
                        onChange={(e) => setNewChannelLink(e.target.value)}
                        placeholder="@PyTorchDaily"
                        className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-300">Category</label>
                      <select
                        value={newChannelCategory}
                        onChange={(e) => setNewChannelCategory(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                      >
                        {['Tech', 'Movies', 'Crypto', 'Anime', 'Deals', 'Education', 'Gaming', 'News'].map(
                          (c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-300">Keywords (comma-separated)</label>
                    <input
                      type="text"
                      value={newChannelKeywords}
                      onChange={(e) => setNewChannelKeywords(e.target.value)}
                      placeholder="ai, pytorch, llm, neuralnets, gpu"
                      className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-300">Description</label>
                    <textarea
                      rows={2}
                      value={newChannelDesc}
                      onChange={(e) => setNewChannelDesc(e.target.value)}
                      placeholder="Channel summary indexed for regex search..."
                      className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-300">Subscribers</label>
                      <input
                        type="number"
                        value={newChannelSubs}
                        onChange={(e) => setNewChannelSubs(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono tabular-nums focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-300 mt-4 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newChannelVerified}
                        onChange={(e) => setNewChannelVerified(e.target.checked)}
                        className="rounded border-slate-700"
                      />
                      Verified Channel
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="mt-1 w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Upsert Channel Document
                  </button>
                </form>
              </div>
            )}

            {dbTab === 'users' && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-medium text-slate-400 bg-slate-900/90">
                      <th className="py-3 px-4">User ID</th>
                      <th className="py-3 px-4">Name & Username</th>
                      <th className="py-3 px-4">Access Status</th>
                      <th className="py-3 px-4">Ban Reason</th>
                      <th className="py-3 px-4 text-right">Moderation Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {users.map((u) => (
                      <tr key={u.user_id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-200">
                          {u.user_id}
                        </td>
                        <td className="py-3 px-4 text-white">
                          {u.first_name} · <span className="font-mono text-slate-400">@{u.username}</span>
                        </td>
                        <td className="py-3 px-4">
                          {u.is_banned ? (
                            <span className="text-rose-400 flex items-center gap-1.5">
                              <XCircle className="w-3.5 h-3.5" />
                              Banned
                            </span>
                          ) : (
                            <span className="text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400">{u.ban_reason || '—'}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() =>
                              setUsers((prev) =>
                                prev.map((item) =>
                                  item.user_id === u.user_id
                                    ? {
                                        ...item,
                                        is_banned: !item.is_banned,
                                        ban_reason: !item.is_banned ? 'Restricted via Admin Console' : null,
                                      }
                                    : item
                                )
                              )
                            }
                            className="px-3 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            {u.is_banned ? 'Unban User' : 'Ban User'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {dbTab === 'groups' && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-medium text-slate-400 bg-slate-900/90">
                      <th className="py-3 px-4">Chat ID</th>
                      <th className="py-3 px-4">Group Title</th>
                      <th className="py-3 px-4">Handle</th>
                      <th className="py-3 px-4 text-right">Members</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {groups.map((g) => (
                      <tr key={g.chat_id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-200">
                          {g.chat_id}
                        </td>
                        <td className="py-3 px-4 font-semibold text-white">{g.title}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">@{g.username}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                          {g.members_count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {dbTab === 'indexes' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    name: 'idx_channel_id_unique',
                    collection: 'channels',
                    keys: '[("channel_id", ASCENDING)] · unique=True',
                    purpose: 'Guarantees idempotent upserts on channel_id and O(1) lookup on callback queries.',
                  },
                  {
                    name: 'idx_keywords',
                    collection: 'channels',
                    keys: '[("keywords", ASCENDING)] (Multikey Index)',
                    purpose: 'Accelerates tokenized array matching across channel tags and title tokens.',
                  },
                  {
                    name: 'idx_category',
                    collection: 'channels',
                    keys: '[("category", ASCENDING)]',
                    purpose: 'Supports instant category filtering in inline queries and callback buttons.',
                  },
                  {
                    name: 'idx_ranking_sort',
                    collection: 'channels',
                    keys: '[("verified", DESCENDING), ("subscribers_count", DESCENDING), ("created_at", DESCENDING)]',
                    purpose: 'Compound sort index ensuring verified and high-subscriber channels rank first without in-memory sort overhead.',
                  },
                ].map((idx) => (
                  <div
                    key={idx.name}
                    className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-sky-400">{idx.name}</span>
                      <span className="font-mono text-slate-400">db.{idx.collection}</span>
                    </div>
                    <div className="font-mono text-xs text-slate-200">{idx.keys}</div>
                    <p className="text-xs text-slate-400 mt-1">{idx.purpose}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ===================================================================
            SECTION 4: ENVIRONMENT (.ENV) & CONFIG BUILDER
           =================================================================== */}
        {activeSection === 'envbuilder' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white font-display">
                  Bot Environment Configuration (.env)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure your credentials for <code className="text-sky-400">config.py</code> and download your ready-to-use <code className="text-sky-400">.env</code> file
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-300">API_ID (my.telegram.org)</label>
                  <input
                    type="text"
                    value={envApiId}
                    onChange={(e) => setEnvApiId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-300">API_HASH</label>
                  <input
                    type="text"
                    value={envApiHash}
                    onChange={(e) => setEnvApiHash(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300">BOT_TOKEN (@BotFather)</label>
                <input
                  type="text"
                  value={envBotToken}
                  onChange={(e) => setEnvBotToken(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300">MONGO_URI (Motor AsyncIO Connection String)</label>
                <input
                  type="text"
                  value={envMongoUri}
                  onChange={(e) => setEnvMongoUri(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-300">DATABASE_NAME</label>
                  <input
                    type="text"
                    value={envDbName}
                    onChange={(e) => setEnvDbName(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-300">ADMINS (Space-separated User IDs)</label>
                  <input
                    type="text"
                    value={envAdmins}
                    onChange={(e) => setEnvAdmins(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-300">RESULTS_PER_PAGE</label>
                  <input
                    type="number"
                    min={2}
                    max={15}
                    value={resultsPerPage}
                    onChange={(e) => setResultsPerPage(Math.max(2, Math.min(15, Number(e.target.value) || 8)))}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono tabular-nums focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-300">LOG_CHANNEL</label>
                  <input
                    type="text"
                    value={envLogChannel}
                    onChange={(e) => setEnvLogChannel(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white font-display">
                    Generated .env File
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Save as <code className="text-sky-400">.env</code> in the root of <code className="text-sky-400">telegram_channel_bot/</code>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedEnvContent);
                      setCopiedEnv(true);
                      setTimeout(() => setCopiedEnv(false), 1800);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedEnv ? 'Copied' : 'Copy .env'}
                  </button>
                  <button
                    onClick={() => handleDownloadFile('.env', generatedEnvContent)}
                    className="px-3 py-1.5 text-xs font-medium bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download .env
                  </button>
                </div>
              </div>

              <pre className="p-4 rounded-lg bg-[#070A0F] border border-slate-800 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                {generatedEnvContent}
              </pre>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
