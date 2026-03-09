import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const METRICS = ['XP Leaders', 'Accuracy Kings'] as const;
const TIMEFRAMES = ['daily', 'weekly', 'monthly', 'all_time'] as const;

export default function LeaderboardView({ walletAddress }: { walletAddress: string | null }) {
    const [metric, setMetric] = useState<typeof METRICS[number]>('XP Leaders');
    const [timeframe, setTimeframe] = useState<typeof TIMEFRAMES[number]>('all_time');

    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        let endpoint = `${API}/leaderboard/xp?timeframe=${timeframe}`;
        if (metric === 'Accuracy Kings') endpoint = `${API}/leaderboard/accuracy?timeframe=${timeframe}&min_predictions=5`;

        fetch(endpoint)
            .then(res => res.json())
            .then(json => {
                setData(json.leaderboard || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [metric, timeframe]);

    const getRankEmoji = (rank: number) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    };

    return (
        <main className="main-content">
            <section className="hero">
                <h1>Top Traders</h1>
                <p>Leaderboard Rankings</p>
            </section>

            {/* Filters */}
            <div className="filters-container glass-effect" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', background: 'transparent', padding: 0 }}>
                {/* Metric Dropdown */}
                <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
                    <select
                        value={metric}
                        onChange={(e) => setMetric(e.target.value as typeof METRICS[number])}
                        style={{
                            width: '100%',
                            appearance: 'none',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            padding: '0.75rem 1rem',
                            paddingRight: '2.5rem',
                            color: 'white',
                            fontWeight: '500',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        {METRICS.map(m => (
                            <option key={m} value={m} style={{ background: '#111827', color: 'white' }}>
                                {m}
                            </option>
                        ))}
                    </select>
                    <ChevronDown style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px', color: '#9ca3af', pointerEvents: 'none' }} />
                </div>

                {/* Timeframe Dropdown */}
                <div style={{ position: 'relative', flex: '1', minWidth: '140px' }}>
                    <select
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value as typeof TIMEFRAMES[number])}
                        style={{
                            width: '100%',
                            appearance: 'none',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            padding: '0.75rem 1rem',
                            paddingRight: '2.5rem',
                            color: 'white',
                            textTransform: 'capitalize',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        {TIMEFRAMES.map(tf => (
                            <option key={tf} value={tf} style={{ background: '#111827', color: 'white' }}>
                                {tf.replace('_', ' ',)}
                            </option>
                        ))}
                    </select>
                    <ChevronDown style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px', color: '#9ca3af', pointerEvents: 'none' }} />
                </div>
            </div>

            {loading ? (
                <div className="state-container">
                    <div className="spinner" />
                    <h3>Loading leaderboard...</h3>
                </div>
            ) : (
                <div className="leaderboard-table-wrapper" style={{ background: 'var(--bg-card)', borderRadius: '12px' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                <th style={{ padding: '1rem' }}>Rank</th>
                                <th style={{ padding: '1rem' }}>Trader</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>
                                    {metric === 'XP Leaders' ? 'XP' : 'Win Rate'}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((entry: any, index: number) => {
                                let id = '';
                                let displayValue = '';
                                if (metric === 'XP Leaders') {
                                    id = entry.user?.id;
                                    displayValue = `${(entry.xp || 0).toLocaleString()} XP`;
                                } else if (metric === 'Accuracy Kings') {
                                    id = entry.user?.id;
                                    displayValue = `${(entry.win_rate * 100 || 0).toFixed(1)}%`;
                                }

                                return (
                                    <tr key={index} style={{ borderBottom: '1px solid var(--border)', background: walletAddress === id ? 'rgba(59, 130, 246, 0.1)' : 'transparent' }}>
                                        <td style={{ padding: '1rem', fontSize: '1.125rem', fontWeight: 'bold' }}>{getRankEmoji(entry.rank || index + 1)}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem' }}>
                                                    {(entry.user?.username || entry.creator?.username || id)?.[0]?.toUpperCase() || '?'}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: '500' }}>
                                                        {entry.user?.username ? `@${entry.user.username}` : `${id?.substring(0, 6)}...${id?.substring(id.length - 4)}`}
                                                    </div>
                                                    {metric === 'Accuracy Kings' && (
                                                        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{entry.wins}W - {entry.losses}L</div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: metric === 'XP Leaders' ? '#c084fc' : '#34d399' }}>
                                            {displayValue}
                                            {metric === 'Accuracy Kings' && entry.current_streak > 0 && (
                                                <span style={{ fontSize: '0.75rem', color: '#fbbf24', marginLeft: '0.5rem' }}>🔥 {entry.current_streak}</span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </main>
    );
}
