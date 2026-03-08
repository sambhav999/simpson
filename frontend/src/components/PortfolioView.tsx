import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function PortfolioView({ walletAddress, onConnectWallet }: { walletAddress: string | null; onConnectWallet: () => void }) {
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
