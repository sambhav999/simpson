import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function LeaderboardView({ walletAddress }: { walletAddress: string | null }) {
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
