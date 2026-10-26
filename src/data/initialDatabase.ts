export interface ChannelDocument {
  channel_id: string;
  title: string;
  username: string;
  invite_link: string;
  description: string;
  keywords: string[];
  category: 'Movies' | 'Tech' | 'Anime' | 'Crypto' | 'Deals' | 'Education' | 'Gaming' | 'News' | 'General' | string;
  verified: boolean;
  subscribers_count: number;
  created_at: string;
}

export interface UserDocument {
  user_id: number;
  first_name: string;
  username: string;
  is_banned: boolean;
  ban_reason: string | null;
  joined_at: string;
}

export interface GroupDocument {
  chat_id: number;
  title: string;
  username: string;
  is_active: boolean;
  members_count: number;
  added_at: string;
}

export const INITIAL_CHANNELS: ChannelDocument[] = [
  {
    channel_id: '-1001849201101',
    title: 'Python & AsyncIO Architecture',
    username: 'PythonAsyncHub',
    invite_link: 'https://t.me/PythonAsyncHub',
    description: 'Deep dives into Python 3.12+, Pyrogram v2 bots, Motor AsyncIO MongoDB, FastAPI microservices, and uvloop optimization.',
    keywords: ['python', 'asyncio', 'pyrogram', 'motor', 'mongodb', 'backend', 'uvloop', 'fastapi', 'tech'],
    category: 'Tech',
    verified: true,
    subscribers_count: 148200,
    created_at: '2026-02-14T10:30:00Z',
  },
  {
    channel_id: '-1001849201102',
    title: '4K Cinema & IMAX Releases Vault',
    username: 'CinemaVault4K',
    invite_link: 'https://t.me/CinemaVault4K',
    description: 'Curated film discussions, theatrical release schedules, IMAX remasters, sci-fi classics, and indie film premieres.',
    keywords: ['movies', 'cinema', 'imax', '4k', 'scifi', 'hollywood', 'trailers', 'reviews', 'films'],
    category: 'Movies',
    verified: true,
    subscribers_count: 392500,
    created_at: '2026-01-20T18:15:00Z',
  },
  {
    channel_id: '-1001849201103',
    title: 'On-Chain Alpha & DeFi Research',
    username: 'OnChainAlphaResearch',
    invite_link: 'https://t.me/OnChainAlphaResearch',
    description: 'Institutional-grade Ethereum, Solana, L2 rollup analytics, smart contract audits, and liquidity flow tracking.',
    keywords: ['crypto', 'defi', 'bitcoin', 'ethereum', 'solana', 'web3', 'onchain', 'trading', 'alpha'],
    category: 'Crypto',
    verified: true,
    subscribers_count: 215800,
    created_at: '2026-03-04T09:00:00Z',
  },
  {
    channel_id: '-1001849201104',
    title: 'Shonen & Seinen Anime Seasonal Hub',
    username: 'AnimeSeasonalHub',
    invite_link: 'https://t.me/AnimeSeasonalHub',
    description: 'Simulcast episode trackers, manga adaptation announcements, studio MAPPA & Ufotable production breakdowns.',
    keywords: ['anime', 'manga', 'shonen', 'seinen', 'otaku', 'japan', 'simulcast', 'ufotable', 'mappa'],
    category: 'Anime',
    verified: true,
    subscribers_count: 284000,
    created_at: '2026-02-01T14:20:00Z',
  },
  {
    channel_id: '-1001849201105',
    title: 'Global Hardware & SaaS Flash Deals',
    username: 'HardwareSaaSDeals',
    invite_link: 'https://t.me/HardwareSaaSDeals',
    description: 'Instant price drops on NVMe SSDs, mechanical keyboards, MacBooks, cloud credits, and developer tool discounts.',
    keywords: ['deals', 'discounts', 'hardware', 'tech', 'coupons', 'laptops', 'ssd', 'sale', 'offers'],
    category: 'Deals',
    verified: true,
    subscribers_count: 176400,
    created_at: '2026-04-11T11:45:00Z',
  },
  {
    channel_id: '-1001849201106',
    title: 'Linux Kernel & Self-Hosted Homelab',
    username: 'SelfHostedHomelab',
    invite_link: 'https://t.me/SelfHostedHomelab',
    description: 'Docker Compose stacks, Kubernetes cluster automation, Proxmox virtualization, WireGuard, and Linux system engineering.',
    keywords: ['linux', 'docker', 'kubernetes', 'homelab', 'devops', 'selfhosted', 'tech', 'proxmox', 'server'],
    category: 'Tech',
    verified: false,
    subscribers_count: 94300,
    created_at: '2026-05-19T16:10:00Z',
  },
  {
    channel_id: '-1001849201107',
    title: 'World Cinema & Criterion Arthouse',
    username: 'CriterionArthouse',
    invite_link: 'https://t.me/CriterionArthouse',
    description: 'European, Korean, and Japanese auteur cinema, festival winners, cinematography analysis, and director retrospectives.',
    keywords: ['movies', 'criterion', 'arthouse', 'cinema', 'korean', 'directors', 'film', 'festival'],
    category: 'Movies',
    verified: false,
    subscribers_count: 68900,
    created_at: '2026-06-02T20:00:00Z',
  },
  {
    channel_id: '-1001849201108',
    title: 'Zero-Knowledge & Rust Cryptography',
    username: 'ZKRustCrypto',
    invite_link: 'https://t.me/ZKRustCrypto',
    description: 'ZK-SNARKs, STARKs, Rust systems programming, MEV infrastructure, and verifiable computation research papers.',
    keywords: ['crypto', 'rust', 'zk', 'cryptography', 'blockchain', 'tech', 'security', 'mev'],
    category: 'Crypto',
    verified: false,
    subscribers_count: 53100,
    created_at: '2026-06-18T08:30:00Z',
  },
  {
    channel_id: '-1001849201109',
    title: 'Mecha & Cyberpunk Anime Archives',
    username: 'CyberpunkAnimeArchive',
    invite_link: 'https://t.me/CyberpunkAnimeArchive',
    description: '90s cel-animated classics, Ghost in the Shell, Akira, Gundam timelines, and original soundtrack vinyl releases.',
    keywords: ['anime', 'cyberpunk', 'mecha', 'gundam', 'retro', 'ost', 'akira', 'scifi'],
    category: 'Anime',
    verified: false,
    subscribers_count: 81200,
    created_at: '2026-07-09T12:00:00Z',
  },
  {
    channel_id: '-1001849201110',
    title: 'CS Algorithms & System Design Prep',
    username: 'SystemDesignPrep',
    invite_link: 'https://t.me/SystemDesignPrep',
    description: 'Distributed databases, consistent hashing, sharding, CAP theorem case studies, and staff-level engineering interviews.',
    keywords: ['education', 'tech', 'systemdesign', 'algorithms', 'database', 'mongodb', 'interviews', 'python'],
    category: 'Education',
    verified: true,
    subscribers_count: 164000,
    created_at: '2026-08-01T15:40:00Z',
  },
  {
    channel_id: '-1001849201111',
    title: 'Steam Deck & Indie Gaming Deals',
    username: 'SteamDeckDeals',
    invite_link: 'https://t.me/SteamDeckDeals',
    description: 'Verified Steam Deck proton configurations, historical low game bundles, and indie RPG launch alerts.',
    keywords: ['deals', 'gaming', 'steam', 'steamdeck', 'indie', 'rpg', 'pcgaming', 'discounts'],
    category: 'Deals',
    verified: false,
    subscribers_count: 112700,
    created_at: '2026-08-22T19:25:00Z',
  },
];

export const INITIAL_USERS: UserDocument[] = [
  {
    user_id: 501928374,
    first_name: 'Alex',
    username: 'alex_dev',
    is_banned: false,
    ban_reason: null,
    joined_at: '2026-09-01T10:12:00Z',
  },
  {
    user_id: 618273645,
    first_name: 'Elena',
    username: 'elena_quant',
    is_banned: false,
    ban_reason: null,
    joined_at: '2026-09-14T16:40:00Z',
  },
  {
    user_id: 792837461,
    first_name: 'SpamBot99',
    username: 'flood_account_99',
    is_banned: true,
    ban_reason: 'Automated flood queries in group',
    joined_at: '2026-10-02T04:19:00Z',
  },
  {
    user_id: 847362519,
    first_name: 'Kenji',
    username: 'kenji_cinema',
    is_banned: false,
    ban_reason: null,
    joined_at: '2026-10-11T21:05:00Z',
  },
];

export const INITIAL_GROUPS: GroupDocument[] = [
  {
    chat_id: -1009911223344,
    title: 'Backend Engineers & Open Source Lounge',
    username: 'BackendEngineersChat',
    is_active: true,
    members_count: 14820,
    added_at: '2026-09-05T12:00:00Z',
  },
  {
    chat_id: -1008822334455,
    title: 'Global Film & Anime Discovery Group',
    username: 'FilmAnimeDiscovery',
    is_active: true,
    members_count: 28450,
    added_at: '2026-09-18T18:30:00Z',
  },
];

export const SAMPLE_FORWARDABLE_POSTS = [
  {
    origin_channel_id: '-1001999888771',
    title: 'Rust & WebAssembly Systems Weekly',
    username: 'RustWasmWeekly',
    category: 'Tech',
    verified: true,
    subscribers_count: 67400,
    description: 'High-performance Rust crates, WASI 0.2 tutorials, embedded systems, and zero-copy networking.',
    sample_post_text: '🦀 Rust 1.84 async traits benchmark + zero-allocation Tokio runtime tuning guide is now live!',
  },
  {
    origin_channel_id: '-1001999888772',
    title: 'Sci-Fi & Noir Film Restoration Society',
    username: 'NoirSciFiRestored',
    category: 'Movies',
    verified: true,
    subscribers_count: 129300,
    description: '35mm and 70mm film scans, Blade Runner archival cuts, classic film noir commentaries, and soundtrack lossless masters.',
    sample_post_text: '🎞️ Newly restored 4K 35mm scan of 1982 neo-noir sci-fi theatrical cut with original Dolby stereo track.',
  },
  {
    origin_channel_id: '-1001999888773',
    title: 'Cloud & GPU Server Deals Alert',
    username: 'CloudGPUDeals',
    category: 'Deals',
    verified: false,
    subscribers_count: 48900,
    description: 'Dedicated Ryzen 9 bare-metal discounts, H100/A100 spot instance price tracker, and VPS promo codes.',
    sample_post_text: '🔥 Flash Deal: 64GB DDR5 NVMe Dedicated Server at 45% off recurring + $200 cloud GPU credits.',
  },
];

export function tokenizeKeywordsJS(rawText: string): string[] {
  if (!rawText) return [];
  const parts = rawText.toLowerCase().split(/[,|\s]+/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const cleaned = part.replace(/[^\w+#.-]/g, '').trim();
    if (cleaned.length >= 2 && !seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
  }
  return result;
}

export function formatSubscribersJS(count: number): string {
  if (!count || count <= 0) return 'N/A';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}
