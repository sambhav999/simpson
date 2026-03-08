import { useState, useEffect } from 'react';
import { fetchAdminUnfeaturedMarkets, createDailyBattle, resolveDailyBattle } from '../lib/api';

export default function AdminDashboard() {
    const [markets, setMarkets] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Create Battle State
    const [battleDate, setBattleDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedMarkets, setSelectedMarkets] = useState<any[]>([]);
    const [homerPredictions, setHomerPredictions] = useState<Record<string, { prediction: 'YES' | 'NO', confidence: number, commentary: string }>>({});

    // Resolve Battle State
    const [resolveBattleId, setResolveBattleId] = useState('');
    const [resolutions, setResolutions] = useState<Record<string, 'YES' | 'NO'>>({});

    useEffect(() => {
        loadUnfeaturedMarkets();
    }, []);

    const loadUnfeaturedMarkets = async () => {
        setLoading(true);
        try {
            const data = await fetchAdminUnfeaturedMarkets();
            setMarkets(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectMarket = (market: any) => {
        if (selectedMarkets.find(m => m.id === market.id)) {
            setSelectedMarkets(selectedMarkets.filter(m => m.id !== market.id));
            const newPreds = { ...homerPredictions };
            delete newPreds[market.id];
            setHomerPredictions(newPreds);
        } else {
            if (selectedMarkets.length >= 5) return;
            setSelectedMarkets([...selectedMarkets, market]);
            setHomerPredictions({
                ...homerPredictions,
                [market.id]: { prediction: 'YES', confidence: 80, commentary: 'Homer predicts this with strong conviction.' }
            });
        }
    };

    const handlePredictionChange = (marketId: string, field: string, value: any) => {
        setHomerPredictions({
            ...homerPredictions,
            [marketId]: { ...homerPredictions[marketId], [field]: value }
        });
    };

    const submitCreateBattle = async () => {
        if (selectedMarkets.length !== 5) {
            alert("Must select exactly 5 markets");
            return;
        }

        const payload = {
            date: new Date(battleDate).toISOString(),
            markets: selectedMarkets.map((m, idx) => ({
                market_id: m.id,
                position: idx + 1,
                homer_prediction: homerPredictions[m.id].prediction,
                homer_confidence: Number(homerPredictions[m.id].confidence),
                homer_commentary: homerPredictions[m.id].commentary
            }))
        };

        try {
            await createDailyBattle(payload);
            alert("Daily Battle Created Successfully!");
            setSelectedMarkets([]);
            setHomerPredictions({});
        } catch (err: any) {
            alert("Error creating battle: " + err.message);
        }
    };

    const submitResolveBattle = async () => {
        if (!resolveBattleId) {
            alert("Enter a battle ID");
            return;
        }

        const payload = Object.entries(resolutions).map(([id, outcome]) => ({
            daily_battle_market_id: id,
            outcome
        }));

        try {
            await resolveDailyBattle(resolveBattleId, payload);
            alert("Battle Resolved Successfully!");
        } catch (err: any) {
            alert("Error resolving battle: " + err.message);
        }
    };

    return (
        <main className="main-content" style={{ padding: '2rem' }}>
            <h1>Admin Dashboard</h1>

            <section style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg-card)', borderRadius: '12px' }}>
                <h2>Create Daily 5 Battle</h2>
                <div style={{ margin: '1rem 0' }}>
                    <label>Battle Date: </label>
                    <input type="date" value={battleDate} onChange={e => setBattleDate(e.target.value)} style={{ padding: '0.5rem', background: '#333', color: 'white', border: 'none', borderRadius: '4px' }} />
                </div>

                <div style={{ display: 'flex', gap: '2rem' }}>
                    <div style={{ flex: 1, maxHeight: '500px', overflowY: 'auto' }}>
                        <h3>Available Markets (Select 5)</h3>
                        {loading ? <p>Loading...</p> : markets.map(m => (
                            <div key={m.id} onClick={() => handleSelectMarket(m)} style={{ padding: '1rem', border: '1px solid #444', marginBottom: '0.5rem', cursor: 'pointer', background: selectedMarkets.find(sm => sm.id === m.id) ? '#2a2a4a' : 'transparent' }}>
                                <strong>{m.title}</strong>
                            </div>
                        ))}
                    </div>

                    <div style={{ flex: 1 }}>
                        <h3>Selected Markets ({selectedMarkets.length}/5)</h3>
                        {selectedMarkets.map((m, idx) => (
                            <div key={m.id} style={{ padding: '1rem', border: '1px solid var(--accent-purple)', marginBottom: '1rem', borderRadius: '8px' }}>
                                <h4>{idx + 1}. {m.title}</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                    <select
                                        value={homerPredictions[m.id]?.prediction}
                                        onChange={e => handlePredictionChange(m.id, 'prediction', e.target.value)}
                                        style={{ padding: '0.5rem', background: '#333', color: 'white' }}
                                    >
                                        <option value="YES">YES</option>
                                        <option value="NO">NO</option>
                                    </select>
                                    <input
                                        type="number"
                                        min="1" max="100"
                                        value={homerPredictions[m.id]?.confidence}
                                        onChange={e => handlePredictionChange(m.id, 'confidence', e.target.value)}
                                        placeholder="Confidence %"
                                        style={{ padding: '0.5rem', background: '#333', color: 'white' }}
                                    />
                                    <textarea
                                        value={homerPredictions[m.id]?.commentary}
                                        onChange={e => handlePredictionChange(m.id, 'commentary', e.target.value)}
                                        placeholder="Homer's Commentary"
                                        rows={2}
                                        style={{ padding: '0.5rem', background: '#333', color: 'white' }}
                                    />
                                </div>
                            </div>
                        ))}
                        <button className="trade-btn" onClick={submitCreateBattle} disabled={selectedMarkets.length !== 5} style={{ width: '100%', marginTop: '1rem' }}>
                            Create Battle
                        </button>
                    </div>
                </div>
            </section>

            <section style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg-card)', borderRadius: '12px' }}>
                <h2>Resolve Daily 5 Battle</h2>
                <div style={{ margin: '1rem 0', display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                    <input
                        type="text"
                        placeholder="Daily Battle ID"
                        value={resolveBattleId}
                        onChange={e => setResolveBattleId(e.target.value)}
                        style={{ padding: '0.75rem', background: '#333', color: 'white', border: 'none', borderRadius: '4px', maxWidth: '400px' }}
                    />
                    <p style={{ fontSize: '0.9rem', color: '#aaa' }}>
                        To resolve, you need to provide the resolutions as a JSON object where keys are the `dailyBattleMarketId` and values are "YES" or "NO".
                        In a full implementation, you'd fetch the battle details first to render a UI. For now, you can enter the raw resolution JSON snippet if needed, or build out a fetch step.
                    </p>
                    <textarea
                        placeholder={'{"markerId1": "YES", "markerId2": "NO"}'}
                        rows={5}
                        onChange={e => {
                            try { setResolutions(JSON.parse(e.target.value)); } catch (err) { }
                        }}
                        style={{ padding: '0.75rem', background: '#333', color: 'white', border: 'none', borderRadius: '4px', maxWidth: '400px', fontFamily: 'monospace' }}
                    />
                    <button className="trade-btn" onClick={submitResolveBattle} style={{ maxWidth: '400px' }}>
                        Resolve Battle
                    </button>
                </div>
            </section>
        </main>
    );
}
