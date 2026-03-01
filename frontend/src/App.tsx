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
  image?: string; // Added as per instruction
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
  const [currentView, setCurrentView] = useState<'markets' | 'portfolio' | 'leaderboard'>('markets');

  // Wallet Adapters integration
  const { publicKey, select, disconnect, wallet, wallets } = useWallet();
  const { connection } = useConnection();

  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [showWalletSelector, setShowWalletSelector] = useState(false);

  const walletAddress = publicKey ? publicKey.toBase58() : null;
  // Map Solflare (which supports MetaMask Snaps) to the 'metamask' UI option for user clarity
  const walletType: WalletType = wallet?.adapter.name === 'Phantom' ? 'phantom' : wallet?.adapter.name === 'Solflare' ? 'metamask' : null;

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
    console.log('[connectPhantom] Button clicked!');
    console.log('[connectPhantom] Available wallets:', wallets.map(w => w.adapter.name));

    try {
      const hasPhantom = wallets.find(w => w.adapter.name === 'Phantom');
      console.log('[connectPhantom] Found Phantom adapter:', !!hasPhantom);

      select('Phantom' as any);
      setShowWalletSelector(false);
    } catch (err) {
      console.error('[connectPhantom] Phantom select failed:', err);
    }
  };

  const connectMetaMask = async () => {
    console.log('[connectMetaMask] Button clicked!');
    console.log('[connectMetaMask] Available wallets:', wallets.map(w => w.adapter.name));

    try {
      // The registerWalletStandard() from main.tsx injects 'MetaMask' as a recognized Standard Wallet
      // into the wallet-adapter array if the user has the MetaMask extension installed.
      const hasMetaMaskAdapter = wallets.find(w => w.adapter.name === 'MetaMask');
      console.log('[connectMetaMask] Found MetaMask adapter:', !!hasMetaMaskAdapter);

      if (hasMetaMaskAdapter) {
        console.log('[connectMetaMask] Selecting MetaMask...');
        select('MetaMask' as any);
      } else {
        // Fallback to Solflare's web adapter which can also trigger snap in some contexts
        console.log('[connectMetaMask] MetaMask adapter not found, falling back to Solflare...');
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
          <p>Browse and trade on real-world event outcomes from Polymarket</p>
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
      )}

      {currentView === 'portfolio' && (
        <PortfolioView
          walletAddress={walletAddress}
          onConnectWallet={() => setShowWalletSelector(true)}
        />
      )}

      {currentView === 'leaderboard' && (
        <LeaderboardView walletAddress={walletAddress} />
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
    console.log('[ConfirmTrade] Start. Wallet:', walletAddress, 'Quote:', quote);
    if (!walletAddress || !quote || quote.total === undefined) {
      console.warn('[ConfirmTrade] Missing required data to confirm.');
      return;
    }
    setConfirming(true);
    setQuoteError(null);

    try {
      // 1. Fetch real-time balance
      let currentBalance = 0;
      console.log(`[ConfirmTrade] Fetching balance for ${walletType}...`);

      if (walletType === 'phantom') {
        const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [walletAddress] }),
        });
        const json = await res.json();
        currentBalance = (json.result?.value || 0) / 1e9;
      } else if (walletType === 'metamask') {
        const mm = window.ethereum;
        if (mm) {
          const balanceHex = await mm.request({ method: 'eth_getBalance', params: [walletAddress, 'latest'] }) as string;
          currentBalance = parseInt(balanceHex, 16) / 1e18;
        }
      }

      console.log(`[ConfirmTrade] Current balance: ${currentBalance}`);

      // 2. Check if sufficient
      const requiredAmount = quote.total;
      const roughUsdBalance = walletType === 'phantom' ? currentBalance * 150 : currentBalance * 3000;

      console.log(`[ConfirmTrade] Checking funds: Need $${requiredAmount}, Have ~$${roughUsdBalance} (${walletType})`);

      if (roughUsdBalance < requiredAmount) {
        throw new Error(`Insufficient funds. Need $${requiredAmount.toFixed(2)} USD equivalent.`);
      }

      console.log('[ConfirmTrade] Balance sufficient. Simulating wallet signing...');

      // 3. Trigger wallet signing
      if (walletType === 'phantom') {
        const phantom = window.phantom?.solana || window.solana;
        if (!phantom) throw new Error("Phantom provider not found");
        // In a real app: await phantom.signAndSendTransaction(tx)
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        const mm = window.ethereum;
        if (!mm) throw new Error("MetaMask provider not found");
        // In a real app: await mm.request({ method: 'eth_sendTransaction', ... })
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      console.log('[ConfirmTrade] Success!');
      // Success!
      setTradeSuccess(true);
    } catch (err: any) {
      console.error('[ConfirmTrade] Catch Block Error:', err);
      // Specifically catch Phantom/MetaMask user rejections
      if (err.code === 4001 || err.message?.includes('User rejected')) {
        setQuoteError('Transaction cancelled by user.');
      } else {
        setQuoteError(err.message || 'Transaction failed');
      }
    } finally {
      setConfirming(false);
    }
  };

  // 1. Generate a new reference key whenever the payment method switches to QR, 
  // or when the modal first opens, so we can track the specific transaction.
  useEffect(() => {
    if (paymentMethod === 'qr' && !referenceKey) {
      import('@solana/web3.js').then(({ Keypair }) => {
        setReferenceKey(Keypair.generate().publicKey.toString());
      });
    }
  }, [paymentMethod, referenceKey]);

  // 2. Poll the backend every 3 seconds to check if the reference key has been seen on-chain
  useEffect(() => {
    if (paymentMethod !== 'qr' || !referenceKey || tradeSuccess) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/trade/verify?reference=${referenceKey}`); // Matches the route we added in backend
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'confirmed') {
            console.log('Payment confirmed via QR scan:', data.signature);
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

  // 3. Generate a Solana Pay Transaction Request URI
  // The scanner will send a POST request with their public key to this exact URL.
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
          <span className={`category-tag ${getCategoryClass(market.category)}`}>{market.category}</span>
          <span className={`status-badge ${market.status.toLowerCase()}`}>{market.status}</span>
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
              /* CONFIRMATION STATE */
              <div className="quote-confirmation">
                <button className="back-btn" onClick={() => setQuote(null)} disabled={confirming}>← Back to edit</button>

                <div className="quote-result large">
                  <h4>Review Trade</h4>
                  <div className="quote-row">
                    <span>Outcome</span>
                    <span className={`side-badge ${quote.side.toLowerCase()}`}>{quote.side}</span>
                  </div>
                  <div className="quote-row">
                    <span>Amount</span>
                    <span>${Number(quote.amount).toFixed(2)}</span>
                  </div>
                  {quote.expectedPrice !== undefined && (
                    <div className="quote-row">
                      <span>Price per share</span>
                      <span>${Number(quote.expectedPrice).toFixed(4)}</span>
                    </div>
                  )}
                  {quote.fee !== undefined && (
                    <div className="quote-row">
                      <span>Platform Fee</span>
                      <span>${Number(quote.fee).toFixed(4)}</span>
                    </div>
                  )}
                  <div className="quote-row total">
                    <span>Total Cost</span>
                    <span>${Number(quote.total).toFixed(4)}</span>
                  </div>
                </div>

                <div className="payment-method-selector">
                  <button
                    className={`method-btn ${paymentMethod === 'wallet' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('wallet')}
                  > Browser Extension</button>
                  <button
                    className={`method-btn ${paymentMethod === 'qr' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('qr')}
                  > Solana Pay QR</button>
                </div>

                {quoteError && <div className="quote-error">⚠️ {quoteError}</div>}

                {paymentMethod === 'wallet' ? (
                  <button
                    className={`confirm-btn ${confirming ? 'loading' : ''}`}
                    onClick={checkBalanceAndConfirm}
                    disabled={confirming}
                  >
                    {confirming ? 'Check Wallet to Approve...' : 'Confirm Trade'}
                  </button>
                ) : (
                  <div className="qr-container">
                    <p className="qr-instructions">Scan this code with Phantom or Solflare mobile app</p>
                    <div className="qr-code-wrapper">
                      <QRCodeSVG value={qrUri} size={200} includeMargin={true} />
                    </div>
                    {/* For visual testing locally without a phone */}
                    <button className="dev-test-btn" onClick={() => setTradeSuccess(true)}>
                      (Dev) Simulate QR Payment
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* INPUT STATE */
              <>
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

                {quoteError && <div className="quote-error">⚠️ {quoteError}</div>}

                <button className="quote-btn" onClick={getQuote} disabled={quoteLoading || !amount || Number(amount) <= 0}>
                  {quoteLoading ? 'Getting Quote...' : walletAddress ? 'Get Trade Quote' : 'Connect Wallet to Trade'}
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

    let isMounted = true;
    const fetchPortfolio = async () => {
      setLoading(true);
      try {
        const [portRes, histRes] = await Promise.all([
          fetch(`${API}/portfolio/${walletAddress}`),
          fetch(`${API}/portfolio/${walletAddress}/history?limit=10`)
        ]);

        if (isMounted) {
          if (portRes.ok) {
            const portData = await portRes.json();
            setData(portData.data);
          }
          if (histRes.ok) {
            const histData = await histRes.json();
            setHistory(histData.data || []);
          }
        }
      } catch (err) {
        console.error("Failed to fetch portfolio", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPortfolio();
    return () => { isMounted = false };
  }, [walletAddress]);

  if (!walletAddress) {
    return (
      <main className="main-content">
        <div className="state-container">
          <h3>Portfolio</h3>
          <p>Please connect your wallet to view your active positions and trade history.</p>
          <button className="connect-btn" style={{ marginTop: '1rem' }} onClick={onConnectWallet}>
            🔗 Connect Wallet
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="main-content">
      <section className="hero" style={{ padding: '1rem', marginBottom: '2rem' }}>
        <h1>Your Portfolio</h1>
        <p>Manage your active predictions and view realized returns</p>
      </section>

      {loading ? (
        <div className="state-container">
          <div className="spinner" />
          <h3>Loading portfolio...</h3>
        </div>
      ) : (
        <div className="portfolio-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Stats Overview */}
          <div className="stats-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="stat-card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Estimated Value</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>${(data?.totalValue || 0).toFixed(2)}</div>
            </div>
            <div className="stat-card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Realized PnL</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: (data?.realizedPnl || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {(data?.realizedPnl || 0) >= 0 ? '+' : ''}${(data?.realizedPnl || 0).toFixed(2)}
              </div>
            </div>
            <div className="stat-card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Volume</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>${(data?.totalVolume || 0).toFixed(2)}</div>
            </div>
          </div>

          {/* Active Positions */}
          <div>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Active Positions</h2>
            {data?.positions?.length > 0 ? (
              <div className="positions-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {data.positions.map((pos: any, idx: number) => (
                  <div key={idx} style={{ background: 'var(--bg-card)', padding: '1rem 1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>Market {pos.marketId.substring(0, 8)}...</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Token: {pos.tokenMint.substring(0, 6)}... | Avg Entry: ${pos.averageEntryPrice.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--accent-blue)', fontSize: '1.1rem' }}>{pos.amount} Shares</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: 'var(--bg-card)', padding: '2rem', textAlign: 'center', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>
                No active positions found.
              </div>
            )}
          </div>

          {/* Recent Trades (History) */}
          <div>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Recent Trades</h2>
            {history.length > 0 ? (
              <div className="positions-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {history.map((trade: any, idx: number) => (
                  <div key={idx} style={{ background: 'var(--bg-card)', padding: '1rem 1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                        <span className={`side-badge ${trade.side.toLowerCase()}`} style={{ marginRight: '8px' }}>{trade.side}</span>
                        {trade.amount} shares @ ${trade.price.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {new Date(trade.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <a href={`https://explorer.solana.com/tx/${trade.signature}?cluster=mainnet-beta`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-purple)', fontSize: '0.85rem', textDecoration: 'none' }}>View Tx ↗</a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: 'var(--bg-card)', padding: '2rem', textAlign: 'center', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>
                No recent trades found.
              </div>
            )}
          </div>

        </div>
      )}
    </main>
  );
}

/* ===== Leaderboard View Component ===== */
function LeaderboardView({ walletAddress }: { walletAddress: string | null }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'volume' | 'streak'>('volume');

  useEffect(() => {
    let isMounted = true;
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/leaderboard?sortBy=${sortBy}&limit=50`);
        if (res.ok && isMounted) {
          const json = await res.json();
          setData(json.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch leaderboard", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchLeaderboard();
    return () => { isMounted = false };
  }, [sortBy]);

  return (
    <main className="main-content">
      <section className="hero" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <h1>Top Traders</h1>
        <p>See who is making the best predictions on SimPredict</p>
      </section>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button
          className={`filter-pill ${sortBy === 'volume' ? 'active' : ''}`}
          onClick={() => setSortBy('volume')}
        >Top Volume</button>
        <button
          className={`filter-pill ${sortBy === 'streak' ? 'active' : ''}`}
          onClick={() => setSortBy('streak')}
        >Highest Streak</button>
      </div>

      {loading ? (
        <div className="state-container">
          <div className="spinner" />
          <h3>Loading leaderboard...</h3>
        </div>
      ) : (
        <div className="leaderboard-table-wrapper" style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rank</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Trader</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Total Volume</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Best Streak</th>
              </tr>
            </thead>
            <tbody>
              {data.map((user: any, index: number) => {
                const isMe = walletAddress && user.walletAddress === walletAddress;
                return (
                  <tr key={user.walletAddress} style={{ borderBottom: '1px solid var(--border)', transition: 'background var(--transition)', background: isMe ? 'rgba(59, 130, 246, 0.1)' : 'transparent' }} onMouseEnter={(e) => !isMe && (e.currentTarget.style.background = 'var(--bg-card-hover)')} onMouseLeave={(e) => !isMe && (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '1.25rem 1.5rem', fontWeight: 'bold', color: index < 3 ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </td>
                    <td style={{ padding: '1.25rem 1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'white' }}>
                          {user.walletAddress.substring(2, 4).toUpperCase()}
                        </div>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: isMe ? 'var(--accent-blue)' : 'inherit' }}>
                          {isMe ? `${user.walletAddress} (You)` : `${user.walletAddress.substring(0, 6)}...${user.walletAddress.substring(user.walletAddress.length - 4)}`}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                      ${(user.totalVolume || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '1.25rem 1.5rem', textAlign: 'center' }}>
                      <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-yellow)', padding: '4px 12px', borderRadius: 'var(--radius-xl)', fontWeight: 'bold', fontSize: '0.85rem' }}>
                        🔥 {user.highestStreak || 0}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No traders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default App;
