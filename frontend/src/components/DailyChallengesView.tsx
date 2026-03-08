

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function DailyChallengesView({
    dailyBattle,
    dailyScoreboard,
    dailyUserStats,
    dailyLeaderboard,
    userPredictions,
    setUserPredictions,
    submittingDaily,
    setSubmittingDaily,
    fetchDailyData,
    walletAddress,
    setShowWalletSelector
}: any) {

    const handlePrediction = (marketId: string, prediction: 'YES' | 'NO') => {
        if (!walletAddress) {
            setShowWalletSelector(true);
            return;
        }
        setUserPredictions((prev: any) => ({ ...prev, [marketId]: prediction }));
    };

    const submitDailyPredictions = async () => {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            alert("Please connect wallet and sign in first.");
            return;
        }
        const predictionsArray = Object.entries(userPredictions).map(([marketId, prediction]) => ({
            daily_battle_market_id: marketId,
            prediction
        }));
        if (predictionsArray.length < 5) return;
        setSubmittingDaily(true);
        try {
            const res = await fetch(`${API}/api/daily/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ predictions: predictionsArray })
            });
            if (res.ok) {
                alert("Predictions submitted!");
                fetchDailyData();
            } else {
                const err = await res.json();
                alert(err.message || "Failed to submit predictions");
            }
        } catch (err) {
            console.error(err);
            alert("Network error");
        } finally {
            setSubmittingDaily(false);
        }
    };

    const hasParticipated = dailyBattle?.user_stats?.participated;
    const numSelected = Object.keys(userPredictions).length;

    return (
        <main className="main-content">
            <div className="battle-arena">
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <h1 style={{ fontSize: '3rem', fontWeight: '900' }}>THE DAILY 5</h1>
                    <p>Man vs Machine. Beat Homer Baba to climb the ranks.</p>
                </div>

                {dailyScoreboard && (
                    <div className="homer-vs-community">
                        <div className="side"><div>🔮</div><h4>Homer</h4><div>{(dailyScoreboard.all_time.homer_baba.accuracy * 100).toFixed(1)}%</div></div>
                        <div className="vs-badge">VS</div>
                        <div className="side"><div>🧠</div><h4>Users</h4><div>{(dailyScoreboard.all_time.community.accuracy * 100).toFixed(1)}%</div></div>
                    </div>
                )}

                {walletAddress && dailyUserStats && (
                    <div className="oracle-border pulse-glow" style={{ padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}><h4>YOUR ARENA RECORD</h4><div>{dailyUserStats.wins} Wins | {(dailyUserStats.accuracy * 100).toFixed(1)}% Accuracy</div></div>
                        <div className="prophet-badge rank-legendary">LEGENDARY PROPHET</div>
                    </div>
                )}

                <div className="arena-markets">
                    {dailyBattle?.markets.map((m: any, idx: number) => {
                        const isLocked = hasParticipated;
                        const myPick = isLocked ? m.user_prediction : userPredictions[m.id];
                        return (
                            <div key={m.id} className="daily-card" style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', alignItems: 'center' }}>
                                <div className="arena-market-img" style={{ backgroundImage: `url(${m.market.image_url || 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80'})` }}></div>
                                <div style={{ flex: 1 }}>
                                    <h4>{idx + 1}. {m.market.question}</h4>
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                        <div style={{ flex: 1, padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                            <div style={{ color: 'var(--accent-purple)', fontSize: '0.7rem' }}>HOMER'S PICK</div>
                                            <div style={{ fontWeight: 'bold' }}>{m.homer_prediction} ({m.homer_confidence}%)</div>
                                            <p style={{ fontStyle: 'italic', fontSize: '0.8rem' }}>"{m.homer_commentary}"</p>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <button className={`dm-btn yes-btn ${myPick === 'YES' ? 'selected' : ''}`} disabled={isLocked} onClick={() => handlePrediction(m.id, 'YES')}>YES</button>
                                            <button className={`dm-btn no-btn ${myPick === 'NO' ? 'selected' : ''}`} disabled={isLocked} onClick={() => handlePrediction(m.id, 'NO')}>NO</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {dailyBattle && !hasParticipated && (
                    <button className="trade-btn" disabled={numSelected < 5 || submittingDaily} onClick={submitDailyPredictions} style={{ width: '100%', padding: '1.5rem', marginTop: '2rem' }}>
                        {submittingDaily ? 'Submitting...' : numSelected < 5 ? `Select ${5 - numSelected} more` : 'Lock In All Picks (+10 XP)'}
                    </button>
                )}

                {dailyLeaderboard?.length > 0 && (
                    <div style={{ marginTop: '3rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}>Daily Arena Leaders</h3>
                        <div className="leaderboard-table-wrapper" style={{ background: 'var(--bg-card)', borderRadius: '12px' }}>
                            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                <thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}><th style={{ padding: '0.75rem 1rem' }}>Prophet</th><th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Accuracy</th></tr></thead>
                                <tbody>
                                    {dailyLeaderboard.map((entry: any, i: number) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.75rem 1rem' }}>{entry.user?.id?.substring(0, 8) || 'User'}...</td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold' }}>{(entry.accuracy * 100).toFixed(1)}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
