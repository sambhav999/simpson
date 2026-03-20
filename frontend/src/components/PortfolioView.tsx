import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function PortfolioView({ walletAddress, onConnectWallet, refreshTrigger = 0 }: { walletAddress: string | null; onConnectWallet: () => void; refreshTrigger?: number }) {
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
    }, [walletAddress, refreshTrigger]);

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
                    {/* Wallet Address */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        background: 'rgba(255,255,255,0.04)', borderRadius: '12px',
                        padding: '1rem 1.25rem', border: '1px solid rgba(255,255,255,0.08)'
                    }}>
                        <span style={{ fontSize: '1.2rem' }}>👛</span>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Wallet Address</span>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>
                                {walletAddress}
                            </span>
                        </div>
                        <button
                            onClick={() => { navigator.clipboard.writeText(walletAddress || ''); }}
                            style={{
                                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px', padding: '0.5rem 0.75rem', cursor: 'pointer',
                                color: 'var(--text-dim)', fontSize: '0.8rem', transition: 'all 0.2s'
                            }}
                            title="Copy address"
                        >📋 Copy</button>
                    </div>

                    {/* Stats Grid */}
                    <div className="stats-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                        <div className="stat-card"><div>💰 Value</div><div>${(data?.totalValue || 0).toFixed(2)}</div></div>
                        <div className="stat-card"><div>📈 PnL</div><div style={{ color: (data?.realizedPnl || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>${(data?.realizedPnl || 0).toFixed(2)}</div></div>
                        <div className="stat-card"><div>📊 Volume</div><div>${(data?.totalVolume || 0).toFixed(2)}</div></div>
                        <div className="stat-card"><div>⚡ Total XP</div><div style={{ color: '#a78bfa' }}>{(data?.xpTotal || 0).toLocaleString()}</div></div>
                        <div className="stat-card"><div>🎯 Accuracy</div><div style={{ color: '#38bdf8' }}>{((data?.accuracy || 0) * 100).toFixed(1)}%</div></div>
                        <div className="stat-card"><div>🏆 Record</div><div>{data?.totalWins || 0}W / {(data?.totalResolved || 0) - (data?.totalWins || 0)}L</div></div>
                    </div>
                    <div>
                        <h3>Recent Activity</h3>
                        {history.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {history.map((h, i) => (
                                    <div key={i} className="stat-card activity-card" style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'auto 1fr auto',
                                        gap: '1.5rem',
                                        alignItems: 'center',
                                        padding: '1.25rem'
                                    }}>
                                        <div className="activity-market-image" style={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: '8px',
                                            backgroundColor: 'rgba(255,255,255,0.05)',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {h.marketImage ? (
                                                <img src={h.marketImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <span style={{ fontSize: '1.5rem' }}>📊</span>
                                            )}
                                        </div>

                                        <div className="activity-info" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            <div style={{ fontWeight: '600', fontSize: '1rem', color: 'var(--text-main)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                {h.marketTitle || 'Unknown Market'}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                                                <span className={`side-badge ${h.tokenSide?.toLowerCase()}`} style={{
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 'bold',
                                                    backgroundColor: h.tokenSide === 'YES' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                    color: h.tokenSide === 'YES' ? '#4ade80' : '#f87171'
                                                }}>
                                                    {h.tokenSide}
                                                </span>
                                                <span>{h.amount ? `$${Number(h.amount).toFixed(2)}` : '$0.00'} @ ${Number(h.price || 0).toFixed(3)}</span>
                                                <span style={{ opacity: 0.5 }}>•</span>
                                                <span>{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>

                                        <div className="activity-meta" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                                                {h.signature?.startsWith('sim_') ? 'Simulation' : 'On-chain'}
                                            </div>
                                            <a
                                                href={`https://solscan.io/tx/${h.signature}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', textDecoration: 'none' }}
                                            >
                                                {h.signature?.substring(0, 8)}...
                                            </a>
                                        </div>
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
