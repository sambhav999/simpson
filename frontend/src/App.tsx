import { useEffect, useState, useCallback, useRef } from 'react';
import './App.css';

const API = import.meta.env.VITE_BACKEND_URL;

/* ===== Phantom Types ===== */
interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: { toString: () => string; toBase58: () => string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>;
  disconnect: () => Promise<void>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
}

interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
    ethereum?: EthereumProvider;
  }
}

const getPhantom = (): PhantomProvider | null => {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solana?.isPhantom) return window.solana;
  return null;
};

const getMetaMask = (): EthereumProvider | null => {
  if (window.ethereum?.isMetaMask) return window.ethereum;
  return null;
};

interface Market {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  expiry: string | null;
  divergenceScore?: number;
  oraclePrice?: number | null;
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

type WalletType = 'phantom' | 'metamask' | null;

const CATEGORIES = ['All', 'Crypto', 'Sports', 'Politics', 'General'];

function App() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);

  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType>(null);
  const [showWalletSelector, setShowWalletSelector] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-connect Phantom if previously connected
  useEffect(() => {
    const phantom = getPhantom();
    if (phantom) {
      phantom.connect({ onlyIfTrusted: true })
        .then((resp) => {
          const addr = resp.publicKey.toString();
          setWalletAddress(addr);
          setWalletType('phantom');
          fetchSolBalance(addr);
        })
        .catch(() => {/* not previously connected */ });
    }
  }, []);

  const connectPhantom = async () => {
    const phantom = getPhantom();
    if (!phantom) {
      window.open('https://phantom.app/', '_blank');
      return;
    }
    try {
      const resp = await phantom.connect();
      const addr = resp.publicKey.toString();
      setWalletAddress(addr);
      setWalletType('phantom');
      setShowWalletSelector(false);
      fetchSolBalance(addr);
    } catch (err) {
      console.error('Phantom connection failed:', err);
    }
  };

  const connectMetaMask = async () => {
    const mm = getMetaMask();
    if (!mm) {
      window.open('https://metamask.io/', '_blank');
      return;
    }
    try {
      const accounts = await mm.request({ method: 'eth_requestAccounts' }) as string[];
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
        setWalletType('metamask');
        setShowWalletSelector(false);
        fetchEthBalance(accounts[0]);
      }
    } catch (err) {
      console.error('MetaMask connection failed:', err);
    }
  };

  const disconnectWallet = async () => {
    if (walletType === 'phantom') {
      const phantom = getPhantom();
      if (phantom) await phantom.disconnect();
    }
    setWalletAddress(null);
    setWalletBalance(null);
    setWalletType(null);
  };

  const fetchSolBalance = async (address: string) => {
    const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address],
        }),
      });
      const json = await res.json();
      if (json.result?.value !== undefined) {
        setWalletBalance(`${(json.result.value / 1e9).toFixed(3)} SOL`);
      }
    } catch { /* non-critical */ }
  };

  const fetchEthBalance = async (address: string) => {
    const mm = getMetaMask();
    if (!mm) return;
    try {
      const balanceHex = await mm.request({ method: 'eth_getBalance', params: [address, 'latest'] }) as string;
      const balanceWei = parseInt(balanceHex, 16);
      const balanceEth = balanceWei / 1e18;
      setWalletBalance(`${balanceEth.toFixed(4)} ETH`);
    } catch { /* non-critical */ }
  };

  const truncateAddress = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  const fetchMarkets = useCallback(async (page = 1, searchQuery = '', cat = 'All') => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20', status: 'active' });
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (cat !== 'All') params.set('category', cat);

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

  useEffect(() => {
    fetchMarkets(1, search, category);
  }, [category, fetchMarkets]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchMarkets(1, value, category);
    }, 400);
  };

  const handlePageChange = (newPage: number) => {
    fetchMarkets(newPage, search, category);
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

  return (
    <div className="app">
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="logo">
            <span className="logo-icon">📊</span>
            SimPredict
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
      <section className="hero">
        <h1>Prediction Markets</h1>
        <p>Browse and trade on real-world event outcomes from Polymarket</p>
      </section>

      {/* Controls */}
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
      </div>

      {/* Markets Grid */}
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
                  <div className="card-header">
                    <span className={`category-tag ${getCategoryClass(market.category)}`}>
                      {market.category}
                    </span>
                    <span className={`status-badge ${market.status.toLowerCase()}`}>
                      {market.status}
                    </span>
                  </div>
                  <h3 className="card-title">{market.title}</h3>
                  <p className="card-desc">{market.description}</p>
                  <div className="card-footer">
                    <span className="expiry-text">📅 {formatExpiry(market.expiry)}</span>
                    <button className="trade-btn" onClick={(e) => { e.stopPropagation(); setSelectedMarket(market); }}>
                      Trade
                    </button>
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{market.title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-meta">
          <span className={`category-tag ${getCategoryClass(market.category)}`}>{market.category}</span>
          <span className={`status-badge ${market.status.toLowerCase()}`}>{market.status}</span>
          <span className="expiry-text">📅 {formatExpiry(market.expiry)}</span>
        </div>

        <div className="modal-body">
          {market.description && <p className="modal-desc">{market.description}</p>}

          <div className="trade-form">
            {!walletAddress && (
              <div className="wallet-prompt">
                <p>Connect your wallet to trade</p>
                <button className="connect-btn" onClick={onConnectWallet}>
                  🔗 Connect Wallet
                </button>
              </div>
            )}

            {walletAddress && walletType === 'metamask' && (
              <div className="wallet-notice">
                ⚠️ Connected via MetaMask (EVM). Trade quotes use Solana — for full on-chain execution, connect Phantom.
              </div>
            )}

            <div className="side-selector">
              <button className={`side-btn yes ${side === 'YES' ? 'selected' : ''}`} onClick={() => setSide('YES')}>
                ✅ YES
              </button>
              <button className={`side-btn no ${side === 'NO' ? 'selected' : ''}`} onClick={() => setSide('NO')}>
                ❌ NO
              </button>
            </div>

            <div className="form-group">
              <label>Amount (USD)</label>
              <input type="number" min="1" step="1" placeholder="Enter amount..." value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>

            <button className="quote-btn" onClick={getQuote} disabled={quoteLoading || !amount || Number(amount) <= 0}>
              {quoteLoading ? 'Getting Quote...' : walletAddress ? 'Get Trade Quote' : 'Connect Wallet to Trade'}
            </button>

            {quoteError && <div className="quote-error">⚠️ {quoteError}</div>}

            {quote && (
              <div className="quote-result">
                <h4>📈 Trade Quote</h4>
                <div className="quote-row">
                  <span>Side</span>
                  <span>{quote.side}</span>
                </div>
                <div className="quote-row">
                  <span>Amount</span>
                  <span>${Number(quote.amount).toFixed(2)}</span>
                </div>
                {quote.expectedPrice !== undefined && (
                  <div className="quote-row">
                    <span>Expected Price</span>
                    <span>${Number(quote.expectedPrice).toFixed(4)}</span>
                  </div>
                )}
                {quote.fee !== undefined && (
                  <div className="quote-row">
                    <span>Fee</span>
                    <span>${Number(quote.fee).toFixed(4)}</span>
                  </div>
                )}
                {quote.total !== undefined && (
                  <div className="quote-row">
                    <span>Total</span>
                    <span style={{ color: 'var(--accent-green)' }}>${Number(quote.total).toFixed(4)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
