import { useQuery } from '@tanstack/react-query';
import { fetchXPLeaderboard, fetchAccuracyLeaderboard, fetchCreatorsLeaderboard } from '../lib/api';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const TABS = ['XP Leaders', 'Accuracy Kings', 'Top Creators'] as const;
const TIMEFRAMES = ['daily', 'weekly', 'monthly', 'all_time'] as const;

export default function LeaderboardsPage() {
    const [tab, setTab] = useState<typeof TABS[number]>('XP Leaders');
    const [timeframe, setTimeframe] = useState<typeof TIMEFRAMES[number]>('all_time');
    const navigate = useNavigate();

    const { data: xpData, isLoading: xpLoading } = useQuery({
        queryKey: ['leaderboard-xp', timeframe],
        queryFn: () => fetchXPLeaderboard({ timeframe }),
        enabled: tab === 'XP Leaders',
    });

    const { data: accuracyData, isLoading: accLoading } = useQuery({
        queryKey: ['leaderboard-accuracy'],
        queryFn: () => fetchAccuracyLeaderboard({ min_predictions: '5' }),
        enabled: tab === 'Accuracy Kings',
    });

    const { data: creatorsData, isLoading: creatorsLoading } = useQuery({
        queryKey: ['leaderboard-creators'],
        queryFn: fetchCreatorsLeaderboard,
        enabled: tab === 'Top Creators',
    });

    const getRankEmoji = (rank: number) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `${rank}`;
    };

    const isLoading = tab === 'XP Leaders' ? xpLoading : tab === 'Accuracy Kings' ? accLoading : creatorsLoading;

    return (
        <div className="min-h-screen pb-24 px-4 pt-6">
            <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Leaderboards
            </h1>

            {/* Tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {TABS.map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${tab === t ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* Timeframe (XP only) */}
            {tab === 'XP Leaders' && (
                <div className="flex gap-2 mb-6">
                    {TIMEFRAMES.map(tf => (
                        <button
                            key={tf}
                            onClick={() => setTimeframe(tf)}
                            className={`px-3 py-1 rounded-lg text-xs capitalize transition-all ${timeframe === tf ? 'bg-purple-500/20 text-purple-300' : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            {tf.replace('_', ' ')}
                        </button>
                    ))}
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center py-10">
                    <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : (
                <div className="space-y-2">
                    {/* XP Tab */}
                    {tab === 'XP Leaders' && xpData?.leaderboard?.map((entry: any) => (
                        <div key={entry.rank} onClick={() => navigate(`/creator/${entry.user.id}`)}
                            className={`glass rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors ${entry.rank <= 3 ? 'border border-yellow-500/20' : ''}`}>
                            <span className="text-lg w-8 text-center font-bold">{getRankEmoji(entry.rank)}</span>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-sm">
                                {(entry.user.username || entry.user.id)?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">@{entry.user.username || entry.user.id?.slice(0, 8)}</p>
                                <p className="text-xs text-gray-400">{entry.user.rank_badge}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-purple-400">{(entry.xp || 0).toLocaleString()} XP</p>
                            </div>
                        </div>
                    ))}

                    {/* Accuracy Tab */}
                    {tab === 'Accuracy Kings' && accuracyData?.leaderboard?.map((entry: any) => (
                        <div key={entry.rank} onClick={() => navigate(`/creator/${entry.user.id}`)}
                            className={`glass rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors ${entry.rank <= 3 ? 'border border-emerald-500/20' : ''}`}>
                            <span className="text-lg w-8 text-center font-bold">{getRankEmoji(entry.rank)}</span>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-sm">
                                {(entry.user.username || entry.user.id)?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">@{entry.user.username || entry.user.id?.slice(0, 8)}</p>
                                <p className="text-xs text-gray-400">{entry.wins}W - {entry.losses}L</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-emerald-400">{(entry.win_rate * 100).toFixed(1)}%</p>
                                {entry.current_streak > 0 && <p className="text-xs text-orange-400">🔥 {entry.current_streak}</p>}
                            </div>
                        </div>
                    ))}

                    {/* Creators Tab */}
                    {tab === 'Top Creators' && creatorsData?.leaderboard?.map((entry: any) => (
                        <div key={entry.rank} onClick={() => navigate(`/creator/${entry.creator.id}`)}
                            className={`glass rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors ${entry.rank <= 3 ? 'border border-pink-500/20' : ''}`}>
                            <span className="text-lg w-8 text-center font-bold">{getRankEmoji(entry.rank)}</span>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-sm">
                                {(entry.creator.username || entry.creator.id)?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">@{entry.creator.username || entry.creator.id?.slice(0, 8)}</p>
                                <p className="text-xs text-gray-400">{entry.markets_hosted} markets</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-pink-400">{entry.conversions} converts</p>
                                <p className="text-xs text-gray-500">{entry.followers} followers</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
