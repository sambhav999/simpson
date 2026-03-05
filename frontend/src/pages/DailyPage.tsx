import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDaily, submitDailyPredictions, fetchDailyUserStats, fetchDailyLeaderboard } from '../lib/api';
import { useState } from 'react';
import { useUserStore } from '../stores/userStore';

export default function DailyPage() {
    const { isAuthenticated } = useUserStore();
    const queryClient = useQueryClient();
    const [predictions, setPredictions] = useState<Record<string, string>>({});
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    const { data: battle, isLoading } = useQuery({ queryKey: ['daily-battle'], queryFn: fetchDaily });
    const { data: userStats } = useQuery({ queryKey: ['daily-user-stats'], queryFn: fetchDailyUserStats, enabled: isAuthenticated });
    const { data: leaderboard } = useQuery({ queryKey: ['daily-leaderboard'], queryFn: fetchDailyLeaderboard, enabled: showLeaderboard });

    const submitMutation = useMutation({
        mutationFn: submitDailyPredictions,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['daily-battle'] }),
    });

    const handlePrediction = (marketId: string, prediction: string) => {
        setPredictions(prev => ({ ...prev, [marketId]: prediction }));
    };

    const handleSubmit = () => {
        const allPredictions = battle?.markets?.map((m: any) => ({
            daily_battle_market_id: m.id,
            prediction: predictions[m.id],
        }));
        if (allPredictions?.length === 5 && allPredictions.every((p: any) => p.prediction)) {
            submitMutation.mutate(allPredictions);
        }
    };

    const allPredicted = battle?.markets?.length === 5 && battle.markets.every((m: any) => predictions[m.id]);
    const alreadyParticipated = battle?.user_stats?.participated;

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-24 px-4 pt-6">
            {/* Header */}
            <div className="text-center mb-6">
                <h1 className="text-3xl font-bold">⚡ Daily 5</h1>
                <p className="text-gray-400 text-sm mt-1">Beat Homer Baba • Win Bonus XP</p>
                {battle?.date && <p className="text-xs text-gray-500 mt-1">{new Date(battle.date).toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}</p>}
            </div>

            {/* User Stats */}
            {userStats && (
                <div className="glass rounded-2xl p-4 mb-6">
                    <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                            <p className="text-lg font-bold text-purple-400">{userStats.total_battles_participated}</p>
                            <p className="text-xs text-gray-400">Battles</p>
                        </div>
                        <div>
                            <p className="text-lg font-bold text-emerald-400">{userStats.wins}</p>
                            <p className="text-xs text-gray-400">Correct</p>
                        </div>
                        <div>
                            <p className="text-lg font-bold text-red-400">{userStats.losses}</p>
                            <p className="text-xs text-gray-400">Wrong</p>
                        </div>
                        <div>
                            <p className="text-lg font-bold text-amber-400">{(userStats.accuracy * 100).toFixed(0)}%</p>
                            <p className="text-xs text-gray-400">Accuracy</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Markets */}
            {!battle?.markets?.length ? (
                <div className="glass rounded-2xl p-8 text-center">
                    <p className="text-4xl mb-4">🔮</p>
                    <p className="text-gray-400">No Daily 5 battle today. Check back tomorrow!</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {battle.markets.map((m: any, idx: number) => {
                        const userPred = m.user_prediction || predictions[m.id];
                        const isResolved = m.result !== 'PENDING';
                        return (
                            <div key={m.id} className="glass rounded-2xl p-4 animate-fadeIn" style={{ animationDelay: `${idx * 100}ms` }}>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">{m.position}</span>
                                    <span className="text-sm font-medium flex-1">{m.market.question}</span>
                                </div>

                                {/* Homer's pick */}
                                <div className="flex items-center gap-2 text-xs text-gray-400 mb-3 bg-white/5 rounded-lg px-3 py-2">
                                    <span>🔮</span>
                                    <span>Homer says <strong className={m.homer_prediction === 'YES' ? 'text-emerald-400' : 'text-red-400'}>{m.homer_prediction}</strong></span>
                                    <span className="text-gray-500">({m.homer_confidence}%)</span>
                                    {isResolved && (
                                        <span className={`ml-auto font-bold ${m.result === 'WIN' ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {m.result === 'WIN' ? '✅' : '❌'}
                                        </span>
                                    )}
                                </div>

                                {/* Prediction Buttons */}
                                {!alreadyParticipated && !isResolved ? (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handlePrediction(m.id, 'YES')}
                                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${userPred === 'YES' ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-emerald-500/20'
                                                }`}
                                        >
                                            YES
                                        </button>
                                        <button
                                            onClick={() => handlePrediction(m.id, 'NO')}
                                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${userPred === 'NO' ? 'bg-red-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-red-500/20'
                                                }`}
                                        >
                                            NO
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center text-sm text-gray-400">
                                        Your pick: <strong className={userPred === 'YES' ? 'text-emerald-400' : 'text-red-400'}>{userPred || '—'}</strong>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Submit */}
            {!alreadyParticipated && battle?.markets?.length > 0 && (
                <button
                    onClick={handleSubmit}
                    disabled={!allPredicted || submitMutation.isPending}
                    className={`mt-6 w-full py-4 rounded-xl font-bold text-lg transition-all ${allPredicted ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transform hover:scale-[1.02] active:scale-95' : 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                        }`}
                >
                    {submitMutation.isPending ? 'Submitting...' : submitMutation.isSuccess ? '✅ Submitted!' : `Submit Predictions (${Object.keys(predictions).length}/5)`}
                </button>
            )}

            {/* Leaderboard Toggle */}
            <button onClick={() => setShowLeaderboard(!showLeaderboard)} className="mt-6 w-full text-center text-sm text-purple-400 hover:text-purple-300 transition-colors">
                {showLeaderboard ? 'Hide' : 'Show'} Daily 5 Leaderboard
            </button>

            {showLeaderboard && leaderboard?.leaderboard && (
                <div className="mt-4 space-y-2">
                    {leaderboard.leaderboard.map((entry: any) => (
                        <div key={entry.rank} className="glass rounded-xl p-3 flex items-center gap-3">
                            <span className="w-6 text-center text-sm font-bold text-gray-400">{entry.rank}</span>
                            <div className="flex-1">
                                <p className="text-sm font-medium">@{entry.user.username || entry.user.id?.slice(0, 8)}</p>
                            </div>
                            <p className="text-sm font-bold text-emerald-400">{(entry.accuracy * 100).toFixed(0)}%</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
