import { useQuery } from '@tanstack/react-query';
import { fetchAIPredictions, fetchDailyScoreboard } from '../lib/api';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AIScoreboardPage() {
    const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('all');
    const navigate = useNavigate();

    const { data: predictions, isLoading } = useQuery({
        queryKey: ['ai-predictions', filter],
        queryFn: () => fetchAIPredictions(filter !== 'all' ? { status: filter } : {}),
    });

    const { data: scoreboard } = useQuery({
        queryKey: ['daily-scoreboard'],
        queryFn: fetchDailyScoreboard,
    });

    const stats = predictions?.stats;
    const accuracy = stats?.accuracy ? (stats.accuracy * 100).toFixed(1) : '0.0';

    return (
        <div className="min-h-screen pb-24 px-4 pt-6">
            {/* Header */}
            <div className="text-center mb-8">
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-4xl mb-4 pulse-glow">
                    🔮
                </div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">
                    Homer Baba
                </h1>
                <p className="text-gray-400 text-sm mt-1">AI Oracle Track Record</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-3 mb-8">
                <div className="glass rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-purple-400">{stats?.total_predictions || 0}</p>
                    <p className="text-xs text-gray-400 mt-1">Predictions</p>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{stats?.wins || 0}</p>
                    <p className="text-xs text-gray-400 mt-1">Wins</p>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-amber-400">{accuracy}%</p>
                    <p className="text-xs text-gray-400 mt-1">Accuracy</p>
                </div>
            </div>

            {/* Homer vs Community (Daily) */}
            {scoreboard?.all_time && (
                <div className="glass rounded-2xl p-5 mb-6">
                    <h3 className="font-semibold mb-4 text-center">🤖 Homer vs 🧠 Community</h3>
                    <div className="flex items-center gap-4">
                        <div className="flex-1 text-center">
                            <p className="text-3xl font-bold text-purple-400">{(scoreboard.all_time.homer_baba.accuracy * 100).toFixed(1)}%</p>
                            <p className="text-sm text-gray-400">Homer Baba</p>
                        </div>
                        <div className="text-xl text-gray-600">vs</div>
                        <div className="flex-1 text-center">
                            <p className="text-3xl font-bold text-pink-400">{(scoreboard.all_time.community.accuracy * 100).toFixed(1)}%</p>
                            <p className="text-sm text-gray-400">Community</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter */}
            <div className="flex gap-2 mb-4">
                {(['all', 'pending', 'resolved'] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-full text-sm capitalize transition-all ${filter === f ? 'bg-purple-600' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                        {f}
                    </button>
                ))}
            </div>

            {/* Predictions List */}
            {isLoading ? (
                <div className="flex justify-center py-10">
                    <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : (
                <div className="space-y-3">
                    {predictions?.predictions?.map((p: any) => (
                        <div key={p.id} onClick={() => navigate(`/market/${p.market.id}`)}
                            className="glass rounded-xl p-4 cursor-pointer hover:bg-white/5 transition-colors">
                            <div className="flex items-start gap-3">
                                <span className={`mt-1 px-3 py-1 rounded-full text-sm font-bold ${p.result === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' :
                                    p.result === 'LOSS' ? 'bg-red-500/20 text-red-400' :
                                        'bg-purple-500/20 text-purple-300'
                                    }`}>
                                    {p.prediction}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm">{p.market.question}</p>
                                    <p className="text-xs text-gray-400 mt-1 italic">"{p.commentary}"</p>
                                    <div className="flex gap-3 mt-2 text-xs text-gray-500">
                                        <span>{p.confidence}% confident</span>
                                        <span>{new Date(p.created_at).toLocaleDateString()}</span>
                                        {p.result !== 'PENDING' && (
                                            <span className={p.result === 'WIN' ? 'text-emerald-400' : 'text-red-400'}>
                                                {p.result === 'WIN' ? '✅ Correct' : '❌ Wrong'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
