

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function DailyChallengesView({
    todaysChallenges,
    oldChallenges,
    expiredChallenges,
    dailyScoreboard,
    dailyUserStats,
    dailyLeaderboard,
    userPredictions,
    setUserPredictions,
    submittingDaily,
    setSubmittingDaily,
    fetchDailyData,
    walletAddress,
    setShowWalletSelector,
    userPositions = []
}: any) {

    const handlePrediction = (marketId: string, prediction: 'YES' | 'NO') => {
        if (!walletAddress) {
            setShowWalletSelector(true);
            return;
        }
        setUserPredictions((prev: any) => ({ ...prev, [marketId]: prediction }));
    };

    const submitDailyPredictions = async (targetChallenges: any[]) => {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            alert("Please connect wallet and sign in first.");
            return;
        }

        const predictionsForTarget = targetChallenges
            .filter((m: any) => userPredictions[m.id])
            .map((m: any) => ({
                daily_battle_market_id: m.id,
                prediction: userPredictions[m.id]
            }));

        if (predictionsForTarget.length === 0) return;

        setSubmittingDaily(true);
        try {
            const res = await fetch(`${API}/api/daily/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ predictions: predictionsForTarget })
            });
            if (res.ok) {
                alert("Predictions submitted!");
                fetchDailyData();
                // Clear the predictions from local state for these markets
                setUserPredictions((prev: any) => {
                    const next = { ...prev };
                    targetChallenges.forEach(m => delete next[m.id]);
                    return next;
                });
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

    const renderChallengeCard = (m: any, idx: number | null, isExpired = false) => {
        const hasPrediction = !!m.user_prediction;
        const myPick = hasPrediction 
            ? (typeof m.user_prediction === 'object' ? m.user_prediction.prediction : m.user_prediction) 
            : userPredictions[m.id];
        
        const position = userPositions.find((p: any) => p.marketId === m.market.id);
        const onChainBet = position?.betSide || (position?.tokenMint === m.market.yesTokenMint ? 'YES' : 'NO');
        
        const myResult = hasPrediction && typeof m.user_prediction === 'object' ? m.user_prediction.result : null;

        return (
            <div key={m.id} className={`daily-card ${isExpired ? 'glass-effect' : 'aura-border'}`} style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', alignItems: 'center', opacity: isExpired ? 0.7 : 1 }}>
                <div 
                    className="arena-market-img" 
                    style={{ 
                        backgroundImage: `url(${m.market.image_url || m.market.image || ''})`,
                        filter: isExpired ? 'grayscale(0.5)' : 'none'
                    }}
                ></div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h4 style={{ color: isExpired ? 'var(--text-muted)' : 'var(--text-primary)', margin: 0 }}>
                            {idx !== null ? `${idx + 1}. ` : ''}{m.market.question}
                        </h4>
                        {myResult && (
                            <span style={{ 
                                padding: '4px 12px', 
                                borderRadius: '20px', 
                                fontSize: '0.75rem', 
                                fontWeight: '900',
                                backgroundColor: myResult === 'WIN' ? 'rgba(34, 197, 94, 0.1)' : (myResult === 'LOSS' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)'),
                                color: myResult === 'WIN' ? '#4ade80' : (myResult === 'LOSS' ? '#f87171' : 'var(--text-dim)'),
                                border: `1px solid ${myResult === 'WIN' ? '#4ade80' : (myResult === 'LOSS' ? '#f87171' : 'rgba(255,255,255,0.2)')}`,
                                marginLeft: '1rem'
                            }}>
                                {myResult === 'WIN' ? 'YOU WON' : (myResult === 'LOSS' ? 'YOU LOST' : 'PENDING')}
                            </span>
                        )}
                        {position && (
                            <span style={{ 
                                padding: '4px 12px', 
                                borderRadius: '20px', 
                                fontSize: '0.65rem', 
                                fontWeight: 'bold',
                                background: 'rgba(255,255,255,0.05)',
                                color: onChainBet === 'YES' ? 'var(--accent-green)' : 'var(--accent-red)',
                                border: '1px solid currentColor'
                            }}>
                                YOUR BET: {onChainBet}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <div style={{ flex: 1, padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                            <div style={{ color: isExpired ? 'var(--text-muted)' : 'var(--accent-purple)', fontSize: '0.7rem' }}>
                                {isExpired ? 'MARKET RESULT' : "HOMER'S PICK"}
                            </div>
                            <div style={{ fontWeight: 'bold' }}>
                                {m.homer_prediction} ({m.homer_confidence}%)
                                {isExpired && <span style={{ marginLeft: '1rem', color: m.result === 'WIN' ? 'var(--accent-green)' : 'var(--accent-red)' }}>[{m.result}]</span>}
                            </div>
                            <p style={{ fontStyle: 'italic', fontSize: '0.8rem', marginBottom: '0.8rem' }}>"{m.homer_commentary || 'Homer Baba detects strong currents...'}"</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '100px' }}>
                            <button className={`dm-btn yes-btn ${myPick === 'YES' ? 'selected' : ''}`} disabled={hasPrediction || isExpired} onClick={() => handlePrediction(m.id, 'YES')}>YES</button>
                            <button className={`dm-btn no-btn ${myPick === 'NO' ? 'selected' : ''}`} disabled={hasPrediction || isExpired} onClick={() => handlePrediction(m.id, 'NO')}>NO</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const todaysPendingCount = todaysChallenges.filter((m: any) => !m.user_prediction && userPredictions[m.id]).length;
    const oldPendingCount = oldChallenges.filter((m: any) => !m.user_prediction && userPredictions[m.id]).length;

    return (
        <main className="main-content">
            <div className="battle-arena">
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <h1 style={{ fontSize: '3rem', fontWeight: '900' }}>THE DAILY</h1>
                    <p>Man vs Machine. Beat Homer Baba to climb the ranks.</p>
                </div>

                {dailyScoreboard && (
                    <div className="homer-vs-community" style={{ marginBottom: '3rem' }}>
                        <div className="side"><div>🔮</div><h4>Homer</h4><div>{(dailyScoreboard.all_time.homer_baba.accuracy * 100).toFixed(1)}%</div></div>
                        <div className="vs-badge">VS</div>
                        <div className="side"><div>🧠</div><h4>Users</h4><div>{(dailyScoreboard.all_time.community.accuracy * 100).toFixed(1)}%</div></div>
                    </div>
                )}

                {walletAddress && dailyUserStats && (
                    <div className="oracle-border pulse-glow" style={{ padding: '1.5rem', borderRadius: '12px', marginBottom: '4rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}><h4>YOUR ARENA RECORD</h4><div>{dailyUserStats.wins} Wins | {(dailyUserStats.accuracy * 100).toFixed(1)}% Accuracy</div></div>
                        <div className="prophet-badge rank-legendary">LEGENDARY PROPHET</div>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5rem' }}>
                    {/* section 1: Today's Challenges */}
                    <section>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--accent-purple)', boxShadow: '0 0 10px var(--accent-purple)' }}></div>
                                <h2 style={{ margin: 0 }}>Today's Challenge</h2>
                                <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem' }}>{todaysChallenges.length} Active</span>
                            </div>
                            {todaysPendingCount > 0 && (
                                <button className="trade-btn" onClick={() => submitDailyPredictions(todaysChallenges)} disabled={submittingDaily} style={{ padding: '0.5rem 1.5rem' }}>
                                    Lock In Today's ({todaysPendingCount})
                                </button>
                            )}
                        </div>
                        <div className="arena-markets">
                            {todaysChallenges.length > 0 ? (
                                todaysChallenges.map((m: any, i: number) => renderChallengeCard(m, i))
                            ) : (
                                <div className="glass-effect" style={{ padding: '3rem', textAlign: 'center', borderRadius: '12px', opacity: 0.5 }}>The arena is silent. New challenges arriving soon.</div>
                            )}
                        </div>
                    </section>

                    {/* section 2: Old Challenges */}
                    <section>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--accent-blue)', opacity: 0.6 }}></div>
                                <h2 style={{ margin: 0 }}>Old Challenges</h2>
                                <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem' }}>{oldChallenges.length} Active</span>
                            </div>
                            {oldPendingCount > 0 && (
                                <button className="trade-btn" onClick={() => submitDailyPredictions(oldChallenges)} disabled={submittingDaily} style={{ padding: '0.5rem 1.5rem', background: 'var(--accent-blue)' }}>
                                    Lock In Old ({oldPendingCount})
                                </button>
                            )}
                        </div>
                        <div className="arena-markets">
                            {oldChallenges.length > 0 ? (
                                oldChallenges.map((m: any) => renderChallengeCard(m, null))
                            ) : (
                                <div className="glass-effect" style={{ padding: '3rem', textAlign: 'center', borderRadius: '12px', opacity: 0.5 }}>No older challenges available right now.</div>
                            )}
                        </div>
                    </section>

                    {/* section 3: Expired Challenges */}
                    <section>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--text-muted)' }}></div>
                            <h2 style={{ margin: 0 }}>Expired Challenges</h2>
                            <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem' }}>Past {expiredChallenges.length}</span>
                        </div>
                        <div className="arena-markets">
                            {expiredChallenges.length > 0 ? (
                                expiredChallenges.map((m: any) => renderChallengeCard(m, null, true))
                            ) : (
                                <div className="glass-effect" style={{ padding: '3rem', textAlign: 'center', borderRadius: '12px', opacity: 0.5 }}>No expired challenges in the current archive.</div>
                            )}
                        </div>
                    </section>
                </div>

                {dailyLeaderboard?.length > 0 && (
                    <div style={{ marginTop: '6rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0 }}>Daily Arena Leaders</h2>
                        </div>
                        <div className="leaderboard-table-wrapper" style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                <thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}><th style={{ padding: '0.75rem 1rem' }}>Prophet</th><th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Accuracy</th></tr></thead>
                                <tbody>
                                    {dailyLeaderboard.map((entry: any, i: number) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(175,82,222,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>{i + 1}</div>
                                                {entry.user?.id?.substring(0, 12) || 'User'}...
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--accent-green)' }}>{(entry.accuracy * 100).toFixed(1)}%</td>
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
