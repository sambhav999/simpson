import { useEffect, useState, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { QRCodeSVG } from 'qrcode.react';
import './App.css';

const API = import.meta.env.VITE_BACKEND_URL;

declare global {
  interface Window {
    phantom?: any;
    solana?: any;
    ethereum?: any;
  }
}

interface Market {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  expiry: string | null;
  image?: string;
  source?: string;
  question?: string; // Added to handle both market formats
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface TradeQuote {
  marketId: string;
  marketTitle: string;
  side: string;
  tokenMint: string;
  amount: number;
  expectedPrice?: number;
  fee?: number;
  total?: number;
}

interface DailyMarket {
  id: string;
  position: number;
  market: {
    id: string;
    question: string;
    yes_price: number | null;
    no_price: number | null;
    source: string;
    image_url: string | null;
    closes_at: string | null;
  };
  homer_prediction: string;
  homer_confidence: number;
  homer_commentary: string;
  result: string | null;
  user_prediction: 'YES' | 'NO' | null;
}

interface DailyBattle {
  id: string;
  date: string;
  status: string;
  markets: DailyMarket[];
  user_stats: {
    participated: boolean;
    predictions_made: number;
  };
}

interface DailyScoreboard {
  all_time: {
    homer_baba: { wins: number; losses: number; accuracy: number; total_predictions: number };
    community: { wins: number; losses: number; accuracy: number; total_predictions: number };
    homer_advantage: number;
  };
}

interface DailyUserStats {
  wins: number;
  losses: number;
  accuracy: number;
  total_predictions: number;
  total_battles_participated: number;
}

interface DailyLeaderboardEntry {
  rank: number;
  user: {
    id: string;
    username: string | null;
    avatar_url: string | null;
    rank_badge: string;
  };
  total_correct: number;
  accuracy: number;
}

interface AIPrediction {
  id: string;
  market: { id: string; question: string; closes_at: string };
  prediction: 'YES' | 'NO';
  confidence: number;
  commentary: string;
  resolved: boolean;
  result: 'WIN' | 'LOSS' | 'PENDING';
  created_at: string;
}

type WalletType = 'phantom' | 'metamask' | null;

const CATEGORIES = ['All', 'Crypto', 'Sports', 'Politics', 'General'];
const SOURCES = [
  { key: 'all', label: 'All Sources', icon: '🌐' },
  { key: 'limitless', label: 'Limitless', icon: '♾️' },
  { key: 'polymarket', label: 'Polymarket', icon: '📈' },
  { key: 'myriad', label: 'Myriad', icon: '🔮' },
  { key: 'manifold', label: 'Manifold', icon: '🎯' },
];

function App() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [source, setSource] = useState('all');
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [currentView, setCurrentView] = useState<'markets' | 'portfolio' | 'leaderboard' | 'daily' | 'oracle'>('markets');

  // Daily 5 State
  const [dailyBattle, setDailyBattle] = useState<DailyBattle | null>(null);
  const [dailyScoreboard, setDailyScoreboard] = useState<DailyScoreboard | null>(null);
  const [dailyUserStats, setDailyUserStats] = useState<DailyUserStats | null>(null);
  const [dailyLeaderboard, setDailyLeaderboard] = useState<DailyLeaderboardEntry[]>([]);
  const [userPredictions, setUserPredictions] = useState<Record<string, 'YES' | 'NO'>>({});
  const [submittingDaily, setSubmittingDaily] = useState(false);

  // AI Oracle State
  const [aiPredictions, setAIPredictions] = useState<AIPrediction[]>([]);
  const [aiStats, setAIStats] = useState<any>(null);
  const [aiLoading, setAILoading] = useState(false);

  // Wallet Adapters integration
  const { publicKey, select, disconnect, wallet, wallets } = useWallet();
  const { connection } = useConnection();

  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [showWalletSelector, setShowWalletSelector] = useState(false);

  const walletAddress = publicKey ? publicKey.toBase58() : null;
  const walletType: WalletType = wallet?.adapter.name === 'Phantom' ? 'phantom'
    : (wallet?.adapter.name === 'Solflare' || wallet?.adapter.name === 'MetaMask') ? 'metamask'
      : null;

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (publicKey) {
      connection.getBalance(publicKey)
        .then(balance => setWalletBalance(`${(balance / 1e9).toFixed(3)} SOL`))
        .catch(() => { });
    } else {
      setWalletBalance(null);
    }
  }, [publicKey, connection]);

  const connectPhantom = () => {
    try {
      select('Phantom' as any);
      setShowWalletSelector(false);
    } catch (err) {
      console.error('[connectPhantom] Phantom select failed:', err);
    }
  };

  const connectMetaMask = async () => {
    try {
      const hasMetaMaskAdapter = wallets.find(w => w.adapter.name === 'MetaMask');
      if (hasMetaMaskAdapter) {
        select('MetaMask' as any);
      } else {
        select('Solflare' as any);
      }
      setShowWalletSelector(false);
    } catch (err) {
      console.error('[connectMetaMask] MetaMask/Solflare select failed:', err);
    }
  };

  const disconnectWallet = async () => {
    try {
      await disconnect();
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
  };

  const truncateAddress = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  const fetchMarkets = useCallback(async (page = 1, searchQuery = '', cat = 'All', src = 'all') => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20', status: 'active' });
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (cat !== 'All') params.set('category', cat);
      if (src !== 'all') params.set('source', src);

      const res = await fetch(`${API}/markets?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      setMarkets(json.data || []);
      setPagination(json.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch markets');
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDailyData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const fetches = [
        fetch(`${API}/api/daily`, { headers }),
        fetch(`${API}/api/daily/scoreboard`)
      ];

      if (walletAddress) {
        headers['Authorization'] = `Bearer ${walletAddress}`;
        fetches.push(fetch(`${API}/daily/user/stats`, { headers }));
      }

      const results = await Promise.all(fetches);
      const [battleRes, scoreboardRes, userStatsRes] = results;

      if (battleRes && battleRes.ok) setDailyBattle(await battleRes.json());
      if (scoreboardRes && scoreboardRes.ok) setDailyScoreboard(await scoreboardRes.json());
      if (userStatsRes && userStatsRes.ok) setDailyUserStats(await userStatsRes.json());

      const leaderRes = await fetch(`${API}/api/daily/leaderboard?limit=10`);
      if (leaderRes.ok) {
        const leaderData = await leaderRes.json();
        setDailyLeaderboard(leaderData.leaderboard || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch Daily 5 data');
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  const fetchAIPredictions = useCallback(async () => {
    setAILoading(true);
    try {
      const [predRes, statsRes] = await Promise.all([
        fetch(`${API}/api/predictions/ai?limit=20`),
        fetch(`${API}/api/daily/scoreboard`)
      ]);
      if (predRes.ok) {
        const data = await predRes.json();
        setAIPredictions(data.predictions || []);
      }
      if (statsRes.ok) {
        setAIStats(await statsRes.json());
      }
    } catch (err) {
      console.error("Failed to fetch AI predictions", err);
    } finally {
      setAILoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentView === 'markets') {
      fetchMarkets(1, search, category, source);
    }
    if (currentView === 'oracle' || currentView === 'markets') {
      fetchAIPredictions();
    }
    if (currentView === 'daily') {
      fetchDailyData();
    }
  }, [currentView, category, source, fetchMarkets, search, fetchDailyData, fetchAIPredictions]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchMarkets(1, value, category, source);
    }, 400);
  };

  const handlePageChange = (newPage: number) => {
    fetchMarkets(newPage, search, category, source);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getCategoryClass = (cat: string) => {
    switch (cat?.toLowerCase()) {
      case 'crypto': return 'crypto';
      case 'sports': return 'sports';
      case 'politics': return 'politics';
      default: return 'general';
    }
  };

  const formatExpiry = (expiry: string | null) => {
    if (!expiry) return 'No expiry';
    return new Date(expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getSourceIcon = (src?: string) => {
    switch (src) {
      case 'limitless': return '♾️';
      case 'polymarket': return '📈';
      case 'myriad': return '🔮';
      case 'manifold': return '🎯';
      default: return '🌐';
    }
  };

  return (
    <div className="app">
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="logo" onClick={() => setCurrentView('markets')} style={{ cursor: 'pointer' }}>
            <span className="logo-icon">📊</span>
            SimPredict
          </div>

          <div className="nav-links">
            <button
              className={`nav-link ${currentView === 'markets' ? 'active' : ''}`}
              onClick={() => setCurrentView('markets')}
            >Markets</button>
            <button
              className={`nav-link ${currentView === 'portfolio' ? 'active' : ''}`}
              onClick={() => setCurrentView('portfolio')}
            >Portfolio</button>
            <button
              className={`nav-link ${currentView === 'leaderboard' ? 'active' : ''}`}
              onClick={() => setCurrentView('leaderboard')}
            >Leaderboard</button>
            <button
              className={`nav-link ${currentView === 'daily' ? 'active' : ''}`}
              onClick={() => setCurrentView('daily')}
            >Daily 5</button>
            <button
              className={`nav-link ${currentView === 'oracle' ? 'active' : ''}`}
              onClick={() => setCurrentView('oracle')}
            >AI Oracle 🔮</button>
          </div>

          <div className="nav-right">
            <div className="nav-stats">
              <div className="nav-stat">
                <span className="nav-stat-value">{pagination.total.toLocaleString()}</span>
                <span className="nav-stat-label">Markets</span>
              </div>
            </div>
            {walletAddress ? (
              <div className="wallet-connected">
                {walletBalance && (
                  <span className="wallet-balance">{walletBalance}</span>
                )}
                <button className="wallet-address-btn" onClick={disconnectWallet} title="Click to disconnect">
                  <span className="wallet-dot" />
                  <span className="wallet-chain-icon">{walletType === 'phantom' ? '👻' : '🦊'}</span>
                  {truncateAddress(walletAddress)}
                </button>
              </div>
            ) : (
              <button className="connect-btn" onClick={() => setShowWalletSelector(true)}>
                🔗 Connect Wallet
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Wallet Selector Modal */}
      {showWalletSelector && (
        <div className="modal-overlay" onClick={() => setShowWalletSelector(false)}>
          <div className="wallet-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Connect Wallet</h2>
              <button className="modal-close" onClick={() => setShowWalletSelector(false)}>✕</button>
            </div>
            <div className="wallet-options">
              <button className="wallet-option" onClick={connectPhantom}>
                <span className="wallet-option-icon">👻</span>
                <div className="wallet-option-info">
                  <span className="wallet-option-name">Phantom</span>
                  <span className="wallet-option-chain">Solana</span>
                </div>
                <span className="wallet-option-arrow">→</span>
              </button>
              <button className="wallet-option" onClick={connectMetaMask}>
                <span className="wallet-option-icon">🦊</span>
                <div className="wallet-option-info">
                  <span className="wallet-option-name">MetaMask</span>
                  <span className="wallet-option-chain">Ethereum / EVM</span>
                </div>
                <span className="wallet-option-arrow">→</span>
              </button>
            </div>
            <p className="wallet-modal-hint">
              Choose your preferred wallet to connect
            </p>
          </div>
        </div>
      )}

      {/* Hero */}
      {currentView === 'markets' && (
        <section className="hero">
          <h1>Prediction Markets</h1>
          <p>Browse and trade on real-world event outcomes from Limitless, Polymarket, Manifold & more</p>
        </section>
      )}

      {currentView === 'markets' && aiPredictions.length > 0 && !search && category === 'All' && source === 'all' && (
        <section className="markets-section" style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🔮</span>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '800' }}>Homer's Top Picks</h2>
          </div>
          <div className="markets-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {aiPredictions.slice(0, 3).map((p: any) => (
              <div key={p.id} className="market-card oracle-border pulse-glow" onClick={() => setSelectedMarket(p.market)}>
                <div className="card-header">
                  <span className="prophet-badge">AI RECOMMENDED</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--accent-purple)' }}>{p.confidence}% CONFIDENCE</span>
                </div>
                <h3 className="card-title" style={{ marginTop: '0.5rem' }}>{p.market.question}</h3>
                <p className="card-desc" style={{ fontStyle: 'italic' }}>"{p.commentary}"</p>
                <div className="card-footer">
                  <span className={`side-badge ${p.prediction.toLowerCase()}`} style={{ fontSize: '0.8rem' }}>PICK: {p.prediction}</span>
                  <button className="trade-btn" onClick={(e) => { e.stopPropagation(); setSelectedMarket(p.market); }}>Trade</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Controls */}
      {currentView === 'markets' && (
        <div className="controls">
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search markets by title..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <div className="filters">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`filter-pill ${category === cat ? 'active' : ''}`}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="source-switcher">
            {SOURCES.map((s) => (
              <button
                key={s.key}
                className={`source-pill ${source === s.key ? 'active' : ''}`}
                onClick={() => setSource(s.key)}
              >
                <span className="source-icon">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {currentView === 'markets' && (
        <main className="main-content">
          {loading && (
            <div className="state-container">
              <div className="spinner" />
              <h3>Loading markets...</h3>
              <p>Fetching the latest prediction markets</p>
            </div>
          )}

          {error && (
            <div className="state-container error">
              <h3>⚠️ Error</h3>
              <p>{error}</p>
              <button className="page-btn" style={{ marginTop: '1rem' }} onClick={() => fetchMarkets(1, search, category)}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && markets.length === 0 && (
            <div className="state-container">
              <h3>No markets found</h3>
              <p>Try adjusting your search or filter criteria</p>
            </div>
          )}

          {!loading && !error && markets.length > 0 && (
            <>
              <div className="markets-grid">
                {markets.map((market) => (
                  <div key={market.id} className="market-card" onClick={() => setSelectedMarket(market)}>
                    {market.image ? (
                      <div className="market-image" style={{ backgroundImage: `url(${market.image})` }}>
                        <div className="card-header overlaid">
                          <span className={`category-tag ${getCategoryClass(market.category)}`}>
                            {market.category}
                          </span>
                          <span className={`status-badge ${market.status.toLowerCase()}`}>
                            {market.status}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="card-header">
                        <span className={`category-tag ${getCategoryClass(market.category)}`}>
                          {market.category}
                        </span>
                        <span className={`status-badge ${market.status.toLowerCase()}`}>
                          {market.status}
                        </span>
                      </div>
                    )}
                    <h3 className="card-title">{market.title}</h3>
                    <p className="card-desc">{market.description}</p>
                    <div className="card-footer">
                      <span className="expiry-text">📅 {formatExpiry(market.expiry)}</span>
                      <div className="card-footer-right">
                        {market.source && (
                          <span className={`source-badge ${market.source}`}>
                            {getSourceIcon(market.source)} {market.source}
                          </span>
                        )}
                        <button className="trade-btn" onClick={(e) => { e.stopPropagation(); setSelectedMarket(market); }}>
                          Trade
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pagination">
                <button className="page-btn" disabled={pagination.page <= 1} onClick={() => handlePageChange(pagination.page - 1)}>
                  ← Prev
                </button>
                <span className="page-info">
                  Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong>
                </span>
                <button className="page-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => handlePageChange(pagination.page + 1)}>
                  Next →
                </button>
              </div>
            </>
          )}
        </main>
      )}

      {currentView === 'portfolio' && (
        <PortfolioView
          walletAddress={walletAddress}
          onConnectWallet={() => setShowWalletSelector(true)}
        />
      )}

      {currentView === 'daily' && (
        <DailyChallengesView
          dailyBattle={dailyBattle}
          dailyScoreboard={dailyScoreboard}
          dailyUserStats={dailyUserStats}
          dailyLeaderboard={dailyLeaderboard}
          userPredictions={userPredictions}
          setUserPredictions={setUserPredictions}
          submittingDaily={submittingDaily}
          setSubmittingDaily={setSubmittingDaily}
          fetchDailyData={fetchDailyData}
          walletAddress={walletAddress}
          setShowWalletSelector={setShowWalletSelector}
        />
      )}

      {currentView === 'leaderboard' && (
        <LeaderboardView walletAddress={walletAddress} />
      )}

      {currentView === 'oracle' && (
        <OracleView
          predictions={aiPredictions}
          stats={aiStats}
          loading={aiLoading}
          onMarketClick={(m: any) => setSelectedMarket(m)}
        />
      )}

      {/* Trade Modal */}
      {selectedMarket && (
        <TradeModal
          market={selectedMarket}
          walletAddress={walletAddress}
          walletType={walletType}
          onClose={() => setSelectedMarket(null)}
          onConnectWallet={() => setShowWalletSelector(true)}
        />
      )}
    </div>
  );
}

/* ===== Trade Modal Component ===== */
function TradeModal({ market, walletAddress, walletType, onClose, onConnectWallet }: {
  market: Market;
  walletAddress: string | null;
  walletType: WalletType;
  onClose: () => void;
  onConnectWallet: () => void;
}) {
  const [side, setSide] = useState<'YES' | 'NO'>('YES');
  const [amount, setAmount] = useState('10');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'qr'>('wallet');

  // Single-use reference key for Solana Pay QR code tracking
  const [referenceKey, setReferenceKey] = useState<string>('');

  // Confirmation state
  const [confirming, setConfirming] = useState(false);
  const [tradeSuccess, setTradeSuccess] = useState(false);

  const getCategoryClass = (cat: string) => {
    switch (cat?.toLowerCase()) {
      case 'crypto': return 'crypto';
      case 'sports': return 'sports';
      case 'politics': return 'politics';
      default: return 'general';
    }
  };

  const formatExpiry = (expiry: string | null) => {
    if (!expiry) return 'No expiry';
    return new Date(expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getQuote = async () => {
    if (!walletAddress) {
      onConnectWallet();
      return;
    }
    setQuoteLoading(true);
    setQuote(null);
    setQuoteError(null);
    try {
      const res = await fetch(`${API}/trade/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: walletAddress,
          marketId: market.id,
          side,
          amount: Number(amount),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setQuoteError(json.error || json.message || 'Failed to get quote');
      } else {
        setQuote(json.data);
      }
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setQuoteLoading(false);
    }
  };

  const checkBalanceAndConfirm = async () => {
    if (!walletAddress || !quote || quote.total === undefined) return;
    setConfirming(true);
    setQuoteError(null);

    try {
      let currentBalance = 0;
      if (walletType === 'phantom') {
        const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [walletAddress] }),
        });
        const json = await res.json();
        currentBalance = (json.result?.value || 0) / 1e9;
      } else if (walletType === 'metamask') {
        currentBalance = 1; // Assume sufficient for simulation
      }

      if (currentBalance < 0.01) {
        throw new Error(`Insufficient funds. You need at least 0.01 SOL for gas.`);
      }

      // Simulate signing
      await new Promise(resolve => setTimeout(resolve, 1500));
      setTradeSuccess(true);
    } catch (err: any) {
      console.error('[ConfirmTrade] Error:', err);
      setQuoteError(err.message || 'Transaction failed');
    } finally {
      setConfirming(false);
    }
  };

  useEffect(() => {
    if (paymentMethod === 'qr' && !referenceKey) {
      import('@solana/web3.js').then(({ Keypair }) => {
        setReferenceKey(Keypair.generate().publicKey.toString());
      });
    }
  }, [paymentMethod, referenceKey]);

  useEffect(() => {
    if (paymentMethod !== 'qr' || !referenceKey || tradeSuccess) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/trade/verify?reference=${referenceKey}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'confirmed') {
            setTradeSuccess(true);
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [paymentMethod, referenceKey, tradeSuccess]);

  const qrUri = quote && quote.total && referenceKey ?
    `solana:${encodeURIComponent(`${API}/trade/pay?reference=${referenceKey}&marketId=${market.id}&side=${side}&amount=${quote.total}`)}`
    : '';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{market.title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-meta">
          <span className={`category-tag ${getCategoryClass(market.category || 'General')}`}>{market.category || 'General'}</span>
          <span className={`status-badge ${(market.status || 'Active').toLowerCase()}`}>{market.status || 'Active'}</span>
          <span className="expiry-text">📅 {formatExpiry(market.expiry)}</span>
        </div>

        <div className="modal-body">
          {market.description && !tradeSuccess && <p className="modal-desc">{market.description}</p>}

          <div className="trade-form">
            {!walletAddress && (
              <div className="wallet-prompt">
                <p>Connect your wallet to trade</p>
                <button className="connect-btn" onClick={onConnectWallet}>
                  🔗 Connect Wallet
                </button>
              </div>
            )}

            {tradeSuccess ? (
              <div className="trade-success-state">
                <div className="success-icon">🎉</div>
                <h3>Trade Successful!</h3>
                <p>You bought <strong>${Number(amount).toFixed(2)}</strong> of <strong>{side}</strong></p>
                <p className="success-market-title">{market.title}</p>
                <button className="quote-btn" onClick={onClose}>Done</button>
              </div>
            ) : quote ? (
              <div className="quote-confirmation">
                <button className="back-btn" onClick={() => setQuote(null)} disabled={confirming}>← Back</button>
                <div className="quote-result large">
                  <h4>Review Trade</h4>
                  <div className="quote-row"><span>Side</span><span className={`side-badge ${quote.side.toLowerCase()}`}>{quote.side}</span></div>
                  <div className="quote-row"><span>Amount</span><span>${Number(quote.amount).toFixed(2)}</span></div>
                  <div className="quote-row total"><span>Total Cost</span><span>${Number(quote.total).toFixed(4)}</span></div>
                </div>
                <div className="payment-method-selector">
                  <button className={`method-btn ${paymentMethod === 'wallet' ? 'active' : ''}`} onClick={() => setPaymentMethod('wallet')}>Wallet</button>
                  <button className={`method-btn ${paymentMethod === 'qr' ? 'active' : ''}`} onClick={() => setPaymentMethod('qr')}>QR Scan</button>
                </div>
                {quoteError && <div className="quote-error">⚠️ {quoteError}</div>}
                {paymentMethod === 'wallet' ? (
                  <button className={`confirm-btn ${confirming ? 'loading' : ''}`} onClick={checkBalanceAndConfirm} disabled={confirming}>
                    {confirming ? 'Wait...' : 'Confirm Trade'}
                  </button>
                ) : (
                  <div className="qr-container">
                    <div className="qr-code-wrapper"><QRCodeSVG value={qrUri} size={200} includeMargin={true} /></div>
                    <button className="dev-test-btn" onClick={() => setTradeSuccess(true)}>(Simulate Payment)</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="side-selector">
                  <button className={`side-btn yes ${side === 'YES' ? 'selected' : ''}`} onClick={() => setSide('YES')}>YES</button>
                  <button className={`side-btn no ${side === 'NO' ? 'selected' : ''}`} onClick={() => setSide('NO')}>NO</button>
                </div>
                <div className="form-group">
                  <label>Amount (USD)</label>
                  <input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                {quoteError && <div className="quote-error">⚠️ {quoteError}</div>}
                <button className="quote-btn" onClick={getQuote} disabled={quoteLoading || !amount}>
                  {quoteLoading ? 'Loading...' : 'Get Quote'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Portfolio View Component ===== */
function PortfolioView({ walletAddress, onConnectWallet }: { walletAddress: string | null; onConnectWallet: () => void }) {
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletAddress) return;
    const fetchPortfolio = async () => {
      setLoading(true);
      try {
        const [portRes, histRes] = await Promise.all([
          fetch(`${API}/portfolio/${walletAddress}`),
          fetch(`${API}/portfolio/${walletAddress}/history?limit=10`)
        ]);
        if (portRes.ok) setData((await portRes.json()).data);
        if (histRes.ok) setHistory((await histRes.json()).data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPortfolio();
  }, [walletAddress]);

  if (!walletAddress) {
    return (
      <main className="main-content">
        <div className="state-container">
          <h3>Portfolio</h3>
          <p>Connect wallet to see your positions.</p>
          <button className="connect-btn" onClick={onConnectWallet}>🔗 Connect Wallet</button>
        </div>
      </main>
    );
  }

  return (
    <main className="main-content">
      <section className="hero"><h1>Your Portfolio</h1><p>Active positions and history</p></section>
      {loading ? (
        <div className="state-container">
          <div className="spinner" />
          <h3>Loading portfolio...</h3>
        </div>
      ) : (
        <div className="portfolio-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="stats-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="stat-card"><div>Value</div><div>${(data?.totalValue || 0).toFixed(2)}</div></div>
            <div className="stat-card"><div>PnL</div><div style={{ color: (data?.realizedPnl || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>${(data?.realizedPnl || 0).toFixed(2)}</div></div>
            <div className="stat-card"><div>Volume</div><div>${(data?.totalVolume || 0).toFixed(2)}</div></div>
          </div>
          <div>
            <h3>Recent Activity</h3>
            {history.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {history.map((h, i) => (
                  <div key={i} className="stat-card" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Trade {h.signature?.substring(0, 8) || 'Unknown'}...</span>
                    <span style={{ fontWeight: 'bold' }}>${(h.amount || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : <p>No recent history found.</p>}
          </div>
        </div>
      )}
    </main>
  );
}

/* ===== AI Oracle View Component ===== */
function OracleView({ predictions, stats, loading, onMarketClick }: any) {
  const accuracy = stats?.all_time?.homer_baba?.accuracy ? (stats.all_time.homer_baba.accuracy * 100).toFixed(1) : '0.0';

  return (
    <main className="main-content">
      <section className="hero oracle-bg" style={{ padding: '3rem 1rem', marginBottom: '2rem', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', color: 'white' }}>
        <div className="baba-avatar">🔮</div>
        <h1 style={{ color: 'white' }}>Homer Baba Oracle</h1>
        <p>Verifiable AI predictions powered by historical market data</p>
      </section>

      <div className="stats-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        <div className="stat-card oracle-border"><div>Total Calls</div><div style={{ color: 'var(--accent-purple)' }}>{stats?.all_time?.homer_baba?.total_predictions || 0}</div></div>
        <div className="stat-card oracle-border pulse-glow"><div>Win Rate</div><div style={{ color: 'var(--accent-green)' }}>{accuracy}%</div></div>
        <div className="stat-card oracle-border"><div>Alpha Advantage</div><div style={{ color: 'var(--accent-blue)' }}>+{(stats?.all_time?.homer_advantage * 100 || 0).toFixed(1)}%</div></div>
      </div>

      <h2>Latest Oracle Insights</h2>
      {loading ? (
        <div className="state-container">
          <div className="spinner" />
          <h3>Consulting the Oracle...</h3>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {predictions.map((p: any) => (
            <div key={p.id} className="daily-card aura-border" style={{ padding: '1.5rem', cursor: 'pointer' }} onClick={() => onMarketClick(p.market)}>
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                <div style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${p.prediction === 'YES' ? 'var(--accent-green)' : 'var(--accent-red)'}`, textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: p.prediction === 'YES' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{p.prediction}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--accent-purple)', fontWeight: 'bold' }}>{p.confidence}% CONFIDENCE</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                  <h3 style={{ margin: '0.5rem 0' }}>{p.market.question}</h3>
                  <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>"{p.commentary}"</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

/* ===== Redesigned Daily Challenges Component ===== */
function DailyChallengesView({
  dailyBattle,
  dailyScoreboard,
  dailyUserStats,
  dailyLeaderboard,
  userPredictions,
  setUserPredictions,
  submittingDaily,
  setSubmittingDaily,
  fetchDailyData,
  walletAddress,
  setShowWalletSelector
}: any) {

  const handlePrediction = (marketId: string, prediction: 'YES' | 'NO') => {
    if (!walletAddress) {
      setShowWalletSelector(true);
      return;
    }
    setUserPredictions((prev: any) => ({ ...prev, [marketId]: prediction }));
  };

  const submitPredictions = async () => {
    if (!walletAddress) return;
    const predictionsArray = Object.entries(userPredictions).map(([marketId, prediction]) => ({
      daily_battle_market_id: marketId,
      prediction
    }));
    if (predictionsArray.length < 5) return;
    setSubmittingDaily(true);
    try {
      const res = await fetch(`${API}/api/daily/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${walletAddress}` },
        body: JSON.stringify({ predictions: predictionsArray })
      });
      if (res.ok) {
        alert("Predictions submitted!");
        fetchDailyData();
      } else {
        const err = await res.json();
        alert(err.message || "Failed to submit predictions");
      }
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setSubmittingDaily(false);
    }
  };

  const hasParticipated = dailyBattle?.user_stats?.participated;
  const numSelected = Object.keys(userPredictions).length;

  return (
    <main className="main-content">
      <div className="battle-arena">
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: '900' }}>THE DAILY 5</h1>
          <p>Man vs Machine. Beat Homer Baba to climb the ranks.</p>
        </div>

        {dailyScoreboard && (
          <div className="homer-vs-community">
            <div className="side"><div>🔮</div><h4>Homer</h4><div>{(dailyScoreboard.all_time.homer_baba.accuracy * 100).toFixed(1)}%</div></div>
            <div className="vs-badge">VS</div>
            <div className="side"><div>🧠</div><h4>Users</h4><div>{(dailyScoreboard.all_time.community.accuracy * 100).toFixed(1)}%</div></div>
          </div>
        )}

        {walletAddress && dailyUserStats && (
          <div className="oracle-border pulse-glow" style={{ padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ flex: 1 }}><h4>YOUR ARENA RECORD</h4><div>{dailyUserStats.wins} Wins | {(dailyUserStats.accuracy * 100).toFixed(1)}% Accuracy</div></div>
            <div className="prophet-badge rank-legendary">LEGENDARY PROPHET</div>
          </div>
        )}

        <div className="arena-markets">
          {dailyBattle?.markets.map((m: any, idx: number) => {
            const isLocked = hasParticipated;
            const myPick = isLocked ? m.user_prediction : userPredictions[m.id];
            return (
              <div key={m.id} className="daily-card" style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <h4>{idx + 1}. {m.market.question}</h4>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <div style={{ flex: 1, padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                      <div style={{ color: 'var(--accent-purple)', fontSize: '0.7rem' }}>HOMER'S PICK</div>
                      <div style={{ fontWeight: 'bold' }}>{m.homer_prediction} ({m.homer_confidence}%)</div>
                      <p style={{ fontStyle: 'italic', fontSize: '0.8rem' }}>"{m.homer_commentary}"</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <button className={`dm-btn yes-btn ${myPick === 'YES' ? 'selected' : ''}`} disabled={isLocked} onClick={() => handlePrediction(m.id, 'YES')}>YES</button>
                      <button className={`dm-btn no-btn ${myPick === 'NO' ? 'selected' : ''}`} disabled={isLocked} onClick={() => handlePrediction(m.id, 'NO')}>NO</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {dailyBattle && !hasParticipated && (
          <button className="trade-btn" disabled={numSelected < 5 || submittingDaily} onClick={submitPredictions} style={{ width: '100%', padding: '1.5rem', marginTop: '2rem' }}>
            {submittingDaily ? 'Submitting...' : numSelected < 5 ? `Select ${5 - numSelected} more` : 'Lock In All Picks (+10 XP)'}
          </button>
        )}

        {dailyLeaderboard?.length > 0 && (
          <div style={{ marginTop: '3rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Daily Arena Leaders</h3>
            <div className="leaderboard-table-wrapper" style={{ background: 'var(--bg-card)', borderRadius: '12px' }}>
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}><th style={{ padding: '0.75rem 1rem' }}>Prophet</th><th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Accuracy</th></tr></thead>
                <tbody>
                  {dailyLeaderboard.map((entry: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>{entry.user?.id?.substring(0, 8) || 'User'}...</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold' }}>{(entry.accuracy * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/* ===== Leaderboard View Component ===== */
function LeaderboardView({ walletAddress }: { walletAddress: string | null }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/leaderboard?limit=50`)
      .then(res => res.json())
      .then(json => {
        setData(json.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="main-content">
      <section className="hero"><h1>Top Traders</h1><p>Leaderboard by total volume</p></section>
      {loading ? (
        <div className="state-container">
          <div className="spinner" />
          <h3>Loading leaderboard...</h3>
        </div>
      ) : (
        <div className="leaderboard-table-wrapper" style={{ background: 'var(--bg-card)', borderRadius: '12px' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}><th style={{ padding: '1rem' }}>Rank</th><th style={{ padding: '1rem' }}>Trader</th><th style={{ padding: '1rem', textAlign: 'right' }}>Volume</th></tr></thead>
            <tbody>
              {data.map((user: any, index: number) => (
                <tr key={user.walletAddress} style={{ borderBottom: '1px solid var(--border)', background: walletAddress === user.walletAddress ? 'rgba(59, 130, 246, 0.1)' : 'transparent' }}>
                  <td style={{ padding: '1rem' }}>#{index + 1}</td>
                  <td style={{ padding: '1rem' }}>{user.walletAddress?.substring(0, 6)}...{user.walletAddress?.substring(user.walletAddress?.length - 4)}</td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${(user.totalVolume || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default App;
