import { useQuery } from '@tanstack/react-query';
import { fetchXPLeaderboard, fetchAccuracyLeaderboard, fetchCreatorsLeaderboard, fetchVolumeLeaderboard } from '../lib/api';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

const METRICS = ['XP Leaders', 'Accuracy Kings', 'Volume Kings', 'Top Creators'] as const;
const TIMEFRAMES = ['daily', 'weekly', 'monthly', 'all_time'] as const;

export default function LeaderboardsPage() {
    const [metric, setMetric] = useState<typeof METRICS[number]>('XP Leaders');
    const [timeframe, setTimeframe] = useState<typeof TIMEFRAMES[number]>('all_time');
    const navigate = useNavigate();

    const { data: xpData, isLoading: xpLoading } = useQuery({
        queryKey: ['leaderboard-xp', timeframe],
        queryFn: () => fetchXPLeaderboard({ timeframe }),
        enabled: metric === 'XP Leaders',
    });

    const { data: accuracyData, isLoading: accLoading } = useQuery({
        queryKey: ['leaderboard-accuracy', timeframe],
        queryFn: () => fetchAccuracyLeaderboard({ timeframe, min_predictions: '5' }),
        enabled: metric === 'Accuracy Kings',
    });

    const { data: volumeData, isLoading: volumeLoading } = useQuery({
        queryKey: ['leaderboard-volume', timeframe],
        queryFn: () => fetchVolumeLeaderboard({ timeframe }),
        enabled: metric === 'Volume Kings',
    });

    const { data: creatorsData, isLoading: creatorsLoading } = useQuery({
        queryKey: ['leaderboard-creators'],
        queryFn: fetchCreatorsLeaderboard,
        enabled: metric === 'Top Creators',
    });

    const getRankEmoji = (rank: number) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `${rank}`;
    };

    const isLoading = metric === 'XP Leaders' ? xpLoading : metric === 'Accuracy Kings' ? accLoading : metric === 'Volume Kings' ? volumeLoading : creatorsLoading;

    return (
        <div className="min-h-screen pb-24 px-4 pt-6">
            <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Leaderboards
            </h1>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
                {/* Metric Dropdown */}
                <div className="relative flex-1 min-w-[200px]">
                    <select
                        value={metric}
                        onChange={(e) => setMetric(e.target.value as typeof METRICS[number])}
                        className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/50 cursor-pointer"
                    >
                        {METRICS.map(m => (
                            <option key={m} value={m} className="bg-gray-900 text-white">
                                {m}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>

                {/* Timeframe Dropdown */}
                {metric !== 'Top Creators' && (
                    <div className="relative w-full sm:w-auto min-w-[140px]">
                        <select
                            value={timeframe}
                            onChange={(e) => setTimeframe(e.target.value as typeof TIMEFRAMES[number])}
                            className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 cursor-pointer capitalize"
                        >
                            {TIMEFRAMES.map(tf => (
                                <option key={tf} value={tf} className="bg-gray-900 text-white">
                                    {tf.replace('_', ' ')}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="flex justify-center py-10">
                    <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : (
                <div className="space-y-2">
                    {/* XP Tab */}
                    {metric === 'XP Leaders' && xpData?.leaderboard?.map((entry: any) => (
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
                    {metric === 'Accuracy Kings' && accuracyData?.leaderboard?.map((entry: any) => (
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

                    {/* Volume Tab */}
                    {metric === 'Volume Kings' && volumeData?.leaderboard?.map((entry: any) => (
                        <div key={entry.rank} onClick={() => navigate(`/creator/${entry.user.id}`)}
                            className={`glass rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors ${entry.rank <= 3 ? 'border border-blue-500/20' : ''}`}>
                            <span className="text-lg w-8 text-center font-bold">{getRankEmoji(entry.rank)}</span>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-sm">
                                {(entry.user.username || entry.user.id)?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">@{entry.user.username || entry.user.id?.slice(0, 8)}</p>
                                <p className="text-xs text-gray-400">Whale</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-blue-400">${(entry.volume || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        </div>
                    ))}

                    {/* Creators Tab */}
                    {metric === 'Top Creators' && creatorsData?.leaderboard?.map((entry: any) => (
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
