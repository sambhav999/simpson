

export default function OracleView({ predictions, misses, stats, loading, onMarketClick, oracleStatus, setOracleStatus }: any) {
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>Latest Oracle Insights</h2>
                <select
                    value={oracleStatus}
                    onChange={(e) => setOracleStatus(e.target.value)}
                    className="glass-effect"
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        color: 'white',
                        border: '1px solid rgba(175,82,222,0.3)',
                        padding: '0.4rem 1rem',
                        borderRadius: '20px',
                        outline: 'none',
                        cursor: 'pointer'
                    }}
                >
                    <option value="pending" style={{ color: 'black' }}>🟢 Active Predictions</option>
                    <option value="resolved" style={{ color: 'black' }}>⏳ Expired Predictions (Past 50)</option>
                </select>
            </div>

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
                                <div 
                                    className="oracle-market-img" 
                                    style={{ 
                                        backgroundImage: `url(${p.market.image || 'https://loremflickr.com/800/600/abstract/all?lock=1'})` 
                                    }}
                                    onError={(e: any) => {
                                        e.target.style.backgroundImage = `url(https://loremflickr.com/800/600/abstract/all?lock=${p.id.length})`;
                                    }}
                                ></div>
                                <div style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${p.prediction === 'YES' ? 'var(--accent-green)' : 'var(--accent-red)'}`, textAlign: 'center', minWidth: '80px' }}>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: p.prediction === 'YES' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{p.prediction}</div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--accent-purple)', fontWeight: 'bold' }}>{p.confidence}% CONFIDENCE</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(p.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <h3 style={{ margin: '0.5rem 0' }}>{p.market.question}</h3>
                                    <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: '1rem' }}>"{p.summary_commentary || p.commentary || 'The oracle is weighing the signals...'}"</p>
                                    
                                    {(p.bullish_commentary || p.bearish_commentary) && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                                            <div style={{ background: 'rgba(175,82,222,0.05)', padding: '0.8rem', borderRadius: '8px', borderLeft: '3px solid var(--accent-purple)' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--accent-purple)', marginBottom: '0.3rem' }}>THE BULL CASE</div>
                                                <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>{p.bullish_commentary || "Oracle synthesis suggests hidden upside potential."}</div>
                                            </div>
                                            <div style={{ background: 'rgba(0,122,255,0.05)', padding: '0.8rem', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--accent-blue)', marginBottom: '0.3rem' }}>THE BEAR CASE</div>
                                                <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>{p.bearish_commentary || "Entropy in the data stream indicates downside risk."}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {misses && misses.length > 0 && (
                <div style={{ marginTop: '4rem' }}>
                    <div style={{ padding: '1rem', background: 'rgba(255,59,48,0.1)', borderRadius: '12px', borderLeft: '4px solid var(--accent-red)', marginBottom: '2rem' }}>
                        <h2 style={{ margin: 0, color: 'var(--accent-red)' }}>The Oracle's Big Misses 📉</h2>
                        <p style={{ margin: '0.5rem 0 0 0', opacity: 0.8 }}>Even the strongest AI gets it wrong. Here is where the community proved superior.</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                        {misses.map((m: any) => (
                            <div key={m.id} className="stat-card glass-effect" style={{ border: '1px solid rgba(255,255,255,0.05)', textAlign: 'left' }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                                    <div 
                                        style={{ 
                                            width: '40px', 
                                            height: '40px', 
                                            borderRadius: '4px', 
                                            backgroundImage: `url(${m.market.image})`, 
                                            backgroundSize: 'cover' 
                                        }}
                                        onError={(e: any) => {
                                            e.target.style.backgroundImage = 'url(https://loremflickr.com/200/200/abstract/all?lock=miss)';
                                        }}
                                    ></div>
                                    <h4 style={{ margin: 0, fontSize: '0.9rem', flex: 1 }}>{m.market.question}</h4>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.7 }}>
                                    <span>AI Suggested: <b>{m.oracle_prediction}</b></span>
                                    <span>Result: <b>LOST</b></span>
                                </div>
                                <div className="progress-bar" style={{ height: '6px', margin: '1rem 0' }}>
                                    <div className="progress-fill" style={{ width: `${m.community_accuracy * 100}%`, background: 'var(--accent-green)' }}></div>
                                </div>
                                <div style={{ fontSize: '0.75rem', textAlign: 'right', color: 'var(--accent-green)', fontWeight: 'bold' }}>
                                    {m.community_wins} Community Wins ({ (m.community_accuracy * 100).toFixed(0) }%)
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </main>
    );
}
