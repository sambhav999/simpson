import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import './App.css';

// Components
import ErrorBoundary from './components/ErrorBoundary';

// Lazy Components
const PortfolioView = lazy(() => import('./components/PortfolioView'));
const OracleView = lazy(() => import('./components/OracleView'));
const DailyChallengesView = lazy(() => import('./components/DailyChallengesView'));
const LeaderboardView = lazy(() => import('./components/LeaderboardView'));
const TradeModal = lazy(() => import('./components/TradeModal'));

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
  question?: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface AIPrediction {
  id: string;
  market: { id: string; question: string; closes_at: string; image?: string };
  prediction: 'YES' | 'NO';
  confidence: number;
  commentary: string;
  resolved: boolean;
  result: 'WIN' | 'LOSS' | 'PENDING';
  created_at: string;
}



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

  // Daily State
  const [dailyBattle, setDailyBattle] = useState<any>(null);
  const [dailyScoreboard, setDailyScoreboard] = useState<any>(null);
  const [dailyUserStats, setDailyUserStats] = useState<any>(null);
  const [dailyLeaderboard, setDailyLeaderboard] = useState<any[]>([]);
  const [userPredictions, setUserPredictions] = useState<Record<string, 'YES' | 'NO'>>({});
  const [submittingDaily, setSubmittingDaily] = useState(false);

  // AI Oracle State
  const [aiPredictions, setAIPredictions] = useState<AIPrediction[]>([]);
  const [aiLoading, setAILoading] = useState(false);

  // Wallet Adapters integration
  const { publicKey, select, disconnect, wallets } = useWallet();
  const { connection } = useConnection();

  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [showWalletSelector, setShowWalletSelector] = useState(false);

  const walletAddress = publicKey ? publicKey.toBase58() : null;
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Custom hook for polling
  function useInterval(callback: () => void, delay: number | null) {
    const savedCallback = useRef(callback);
    useEffect(() => { savedCallback.current = callback; }, [callback]);
    useEffect(() => {
      if (delay !== null) {
        const id = setInterval(() => savedCallback.current(), delay);
        return () => clearInterval(id);
      }
    }, [delay]);
  }

  // Poll for market updates every 30 seconds
  useInterval(() => {
    if (currentView === 'markets') fetchMarkets(pagination.page, search, category, source);
    if (currentView === 'daily') fetchDailyData();
    if (currentView === 'oracle') fetchAIPredictions();
  }, 30000);

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
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const fetches = [
        fetch(`${API}/api/daily`, { headers }),
        fetch(`${API}/api/daily/scoreboard`)
      ];

      if (token) {
        fetches.push(fetch(`${API}/api/daily/user/stats`, { headers }));
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
      setError(err instanceof Error ? err.message : 'Failed to fetch Daily data');
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  const fetchAIPredictions = useCallback(async () => {
    setAILoading(true);
    try {
      const resp = await fetch(`${API}/api/predictions/ai?limit=20`);
      if (resp.ok) {
        const data = await resp.json();
        setAIPredictions(data.predictions || []);
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

  const handleSearchChange = (val: string) => {
    setSearch(val);
    handleSearch(val);
  };

  const handleMarketClick = (market: Market) => {
    setSelectedMarket(market);
  };

  // Trade state & logic
  const [side, setSide] = useState<'YES' | 'NO'>('YES');
  const [amount, setAmount] = useState('10');
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [tradeSuccess, setTradeSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'qr'>('wallet');
  const [qrUri] = useState('');

  const getQuote = async () => {
    if (!selectedMarket || !amount || !walletAddress) {
      setQuoteError('Please connect your wallet first.');
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const res = await fetch(`${API}/trade/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: walletAddress,
          marketId: selectedMarket.id,
          side,
          amount: Number(amount)
        })
      });
      if (res.ok) {
        const data = await res.json();
        setQuote(data.data);
      } else {
        const err = await res.json();
        setQuoteError(err.message || 'Failed to get quote');
      }
    } catch (err) {
      setQuoteError('Network error');
    } finally {
      setQuoteLoading(false);
    }
  };

  const checkBalanceAndConfirm = async () => {
    if (!publicKey) return;
    setConfirming(true);
    try {
      // Basic simulation for now, actual implementation should call contract
      setTradeSuccess(true);
    } catch (err) {
      setQuoteError('Trade failed');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="app">
      <header className="navbar glass-effect">
        <div className="logo" onClick={() => setCurrentView('markets')}>
          <span className="logo-icon">📊</span>
          SimPredict
        </div>

        <nav className="nav-links">
          <button className={currentView === 'markets' ? 'active' : ''} onClick={() => setCurrentView('markets')}>Markets</button>
          <button className={currentView === 'portfolio' ? 'active' : ''} onClick={() => setCurrentView('portfolio')}>Portfolio</button>
          <button className={currentView === 'leaderboard' ? 'active' : ''} onClick={() => setCurrentView('leaderboard')}>Leaderboard</button>
          <button className={currentView === 'daily' ? 'active' : ''} onClick={() => setCurrentView('daily')}>Daily</button>
          <button className={currentView === 'oracle' ? 'active' : ''} onClick={() => setCurrentView('oracle')}>AI Oracle 🔮</button>
        </nav>

        <div className="nav-actions">
          <div className="market-count-badge">
            <span className="count">{pagination.total.toLocaleString()}</span>
            <span className="label">MARKETS</span>
          </div>
          {publicKey ? (
            <div className="wallet-info">
              <div className="balance-info">
                <span className="sol-icon">◎</span>
                <span className="amount">{walletBalance || '0.00 SOL'}</span>
              </div>
              <button className="user-profile-btn" onClick={() => setCurrentView('portfolio')}>
                <span className="avatar-icon">👤</span>
                {truncateAddress(publicKey.toBase58())}
              </button>
              <button className="disconnect-icon-btn" onClick={disconnectWallet} title="Disconnect">✕</button>
            </div>
          ) : (
            <button className="connect-btn" onClick={() => setShowWalletSelector(true)}>Connect Wallet</button>
          )}
        </div>
      </header>

      <Suspense fallback={<div className="state-container"><div className="spinner" /><h3>Loading View...</h3></div>}>
        <ErrorBoundary name={currentView}>
          {currentView === 'markets' && (
            <main className="main-content">
              <section className="hero">
                <h1>Predict the Future</h1>
                <p>Verify insights from the Homer Baba Oracle and trade global markets.</p>
              </section>

              {aiPredictions.length > 0 && (
                <section className="featured-section oracle-glow">
                  <div className="featured-header">
                    <h2>Homer's Top Picks 🔮</h2>
                    <button className="view-all-btn" onClick={() => setCurrentView('oracle')}>View All Insights →</button>
                  </div>
                  <div className="featured-grid">
                    {aiPredictions.slice(0, 3).map(p => (
                      <div key={p.id} className="featured-card glass-effect" onClick={() => handleMarketClick(p.market as any)}>
                        <div className="card-badge">HIGH CONFIDENCE {p.confidence}%</div>
                        <div className="featured-card-image" style={{ backgroundImage: `url(${p.market.image || 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80'})` }}></div>
                        <h3>{p.market.question}</h3>
                        <div className="card-prediction">Baba Suggests: <span className={p.prediction}>{p.prediction}</span></div>
                        <p className="card-commentary">"{p.commentary.slice(0, 80)}..."</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="filters-container glass-effect">
                <div className="search-bar">
                  <input type="text" placeholder="Search markets..." value={search} onChange={(e) => handleSearchChange(e.target.value)} />
                </div>
                <div className="filters-row">
                  <div className="category-scroll">
                    {CATEGORIES.map(cat => (
                      <button key={cat} className={`cat-btn ${category === cat ? 'active' : ''}`} onClick={() => setCategory(cat)}>{cat}</button>
                    ))}
                  </div>
                  <div className="source-selector">
                    {SOURCES.map(src => (
                      <button key={src.key} className={`src-btn ${source === src.key ? 'active' : ''}`} onClick={() => setSource(src.key)}>{src.icon} {src.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              {loading && markets.length === 0 ? (
                <div className="state-container">
                  <div className="spinner" />
                  <h3>Scanning the timeline...</h3>
                </div>
              ) : error ? (
                <div className="state-container">
                  <h3>Something went wrong</h3>
                  <p>{error}</p>
                  <button className="quote-btn" onClick={() => fetchMarkets(pagination.page, search, category, source)}>Try Again</button>
                </div>
              ) : markets.length === 0 ? (
                <div className="state-container">
                  <h3>No markets found</h3>
                  <p>Try adjusting your search or filters.</p>
                </div>
              ) : (
                <>
                  <div className="markets-grid">
                    {markets.map(m => (
                      <div key={m.id} className="market-card glass-effect" onClick={() => handleMarketClick(m)}>
                        <div className="market-image" style={{ backgroundImage: `url(${m.image || 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&auto=format&fit=crop&q=60'})` }}>
                          <div className="source-tag">{m.source}</div>
                        </div>
                        <div className="market-card-content">
                          <h3>{m.title || m.question}</h3>
                          <div className="market-card-footer">
                            <span className="category-tag">{m.category}</span>
                            <button className="trade-btn">Trade</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pagination">
                    <button disabled={pagination.page <= 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}>Previous</button>
                    <span>Page {pagination.page} of {pagination.totalPages}</span>
                    <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}>Next</button>
                  </div>
                </>
              )}
            </main>
          )}

          {currentView === 'portfolio' && (
            <PortfolioView walletAddress={walletAddress} onConnectWallet={() => setShowWalletSelector(true)} />
          )}

          {currentView === 'leaderboard' && (
            <LeaderboardView walletAddress={walletAddress} />
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

          {currentView === 'oracle' && (
            <OracleView
              predictions={aiPredictions}
              stats={dailyScoreboard}
              loading={aiLoading}
              onMarketClick={handleMarketClick}
            />
          )}
        </ErrorBoundary>
      </Suspense>

      {showWalletSelector && (
        <div className="modal-overlay" onClick={() => setShowWalletSelector(false)}>
          <div className="wallet-modal glass-effect" onClick={e => e.stopPropagation()}>
            <h3>Connect Wallet</h3>
            <div className="wallet-list">
              <button className="wallet-option" onClick={connectPhantom}>
                <img src="https://phantom.app/favicon.ico" alt="Phantom" />
                <span>Phantom</span>
              </button>
              <button className="wallet-option" onClick={connectMetaMask}>
                <img src="https://solflare.com/favicon.ico" alt="Solflare" />
                <span>Solflare / MetaMask</span>
              </button>
            </div>
            <p className="wallet-tip">New to Solana? Download <a href="https://phantom.app/" target="_blank" rel="noreferrer">Phantom</a></p>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        <TradeModal
          isOpen={!!selectedMarket}
          market={selectedMarket}
          onClose={() => setSelectedMarket(null)}
          side={side}
          setSide={setSide}
          amount={amount}
          setAmount={setAmount}
          getQuote={getQuote}
          quoteLoading={quoteLoading}
          quote={quote}
          setQuote={setQuote}
          quoteError={quoteError}
          confirming={confirming}
          checkBalanceAndConfirm={checkBalanceAndConfirm}
          tradeSuccess={tradeSuccess}
          setTradeSuccess={setTradeSuccess}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          qrUri={qrUri}
        />
      </Suspense>
    </div>
  );
}

export default App;
