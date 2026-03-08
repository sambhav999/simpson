

export default function OracleView({ predictions, stats, loading, onMarketClick }: any) {
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
