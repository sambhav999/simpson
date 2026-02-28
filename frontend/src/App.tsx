import { useEffect, useState } from 'react';
import './App.css';

interface Market {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  expiry: string;
}

function App() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarkets();
  }, []);

  const fetchMarkets = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/markets`, {
        headers: {
          'ngrok-skip-browser-warning': 'true'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch markets');
      const data = await response.json();
      setMarkets(data.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleTrade = async (market: Market) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/trade/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          wallet: '11111111111111111111111111111111', // 32-char dummy wallet for the backend validation
          marketId: market.id,
          side: 'YES',
          amount: 10
        })
      });
      const data = await response.json();
      if (response.ok) {
        alert(`✅ Trade quote received for ${market.title}!\nExpected Price: ${data.data?.expectedPrice?.toFixed(2)}\nFee: ${data.data?.fee}\n(Mock Data via Aggregator)`);
      } else {
        alert(`❌ Failed to get quote: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`❌ Error processing trade: ${err}`);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>SimPredict Markets</h1>
        <div className="links">
          <span>Backend: {import.meta.env.VITE_BACKEND_URL}</span>
          <span>Aggregator: {import.meta.env.VITE_POLYMARKET_API_URL}</span>
        </div>
      </header>

      <main className="main-content">
        {loading && <div className="loading">Loading markets...</div>}
        {error && <div className="error">{error}</div>}

        {!loading && !error && markets.length === 0 && (
          <div className="empty-state">
            <p>No active markets found.</p>
            <p className="hint">The backend might be empty or Polymarket API might be blocked. Consider re-enabling mock markets in the backend.</p>
          </div>
        )}

        <div className="markets-grid">
          {markets.map(market => (
            <div key={market.id} className="market-card">
              <div className="market-header">
                <span className="category">{market.category}</span>
                <span className={`status ${market.status.toLowerCase()}`}>{market.status}</span>
              </div>
              <h2>{market.title}</h2>
              <p className="description">{market.description}</p>
              <div className="market-footer">
                <span className="expiry">Expires: {new Date(market.expiry).toLocaleDateString()}</span>
                <button className="bet-btn" onClick={() => handleTrade(market)}>Trade</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;
