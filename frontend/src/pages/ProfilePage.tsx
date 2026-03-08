import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchCreatorProfile, fetchCreatorMarkets, fetchUserPredictions, followUser } from '../lib/api';
import { useUserStore, getRankBadge } from '../stores/userStore';

export default function ProfilePage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { wallet } = useUserStore();

    const { data: profile, isLoading } = useQuery({
        queryKey: ['profile', id],
        queryFn: () => fetchCreatorProfile(id!),
        enabled: !!id,
    });

    const { data: hostedMarkets } = useQuery({
        queryKey: ['profile-markets', id],
        queryFn: () => fetchCreatorMarkets(id!),
        enabled: !!id,
    });

    const { data: predictions } = useQuery({
        queryKey: ['profile-predictions', id],
        queryFn: () => fetchUserPredictions(id!),
        enabled: !!id,
    });

    const isOwnProfile = wallet === id;

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!profile) return <div className="p-6 text-center text-gray-400">User not found</div>;

    const rank = getRankBadge(profile.xp_total || 0);

    return (
        <div className="min-h-screen pb-24 px-4 pt-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <span className="text-xl">←</span>
                </button>
                <span className="text-gray-400">Profile</span>
            </div>

            {/* Profile Card */}
            <div className="glass rounded-2xl p-6 text-center mb-6">
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-3xl mb-3">
                    {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                        (profile.username || id)?.[0]?.toUpperCase() || '?'
                    )}
                </div>
                <h2 className="text-xl font-bold">@{profile.username || id?.slice(0, 8)}</h2>
                <p className="text-sm text-purple-400 mt-1">{rank} • {profile.xp_total?.toLocaleString()} XP</p>
                {profile.bio && <p className="text-sm text-gray-400 mt-2">{profile.bio}</p>}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mt-4">
                    <div>
                        <p className="text-lg font-bold">{profile.followers_count || 0}</p>
                        <p className="text-xs text-gray-400">Followers</p>
                    </div>
                    <div>
                        <p className="text-lg font-bold">{profile.following_count || 0}</p>
                        <p className="text-xs text-gray-400">Following</p>
                    </div>
                    <div>
                        <p className="text-lg font-bold">{profile.markets_hosted || 0}</p>
                        <p className="text-xs text-gray-400">Hosted</p>
                    </div>
                </div>

                {/* Follow/Unfollow */}
                {!isOwnProfile && (
                    <button
                        onClick={async () => {
                            try { await followUser(id!); } catch { }
                        }}
                        className="mt-4 px-6 py-2 rounded-full bg-purple-600 hover:bg-purple-500 text-sm font-medium transition-colors"
                    >
                        Follow
                    </button>
                )}
            </div>

            {/* Prediction Accuracy */}
            {predictions?.stats && (
                <div className="glass rounded-2xl p-5 mb-6">
                    <h3 className="font-semibold mb-3">Prediction Stats</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 rounded-xl bg-white/5">
                            <p className="text-2xl font-bold text-emerald-400">{(predictions.stats.win_rate * 100).toFixed(0)}%</p>
                            <p className="text-xs text-gray-400">Win Rate</p>
                        </div>
                        <div className="text-center p-3 rounded-xl bg-white/5">
                            <p className="text-2xl font-bold text-purple-400">{predictions.stats.total}</p>
                            <p className="text-xs text-gray-400">Total Predictions</p>
                        </div>
                        <div className="text-center p-3 rounded-xl bg-white/5">
                            <p className="text-2xl font-bold text-emerald-400">{predictions.stats.wins}</p>
                            <p className="text-xs text-gray-400">Wins</p>
                        </div>
                        <div className="text-center p-3 rounded-xl bg-white/5">
                            <p className="text-2xl font-bold text-orange-400">{predictions.stats.active}</p>
                            <p className="text-xs text-gray-400">Active</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Hosted Markets */}
            {hostedMarkets?.markets?.length > 0 && (
                <div className="glass rounded-2xl p-5 mb-6">
                    <h3 className="font-semibold mb-3">Hosted Markets</h3>
                    <div className="space-y-3">
                        {hostedMarkets.markets.map((m: any) => (
                            <div key={m.id} onClick={() => navigate(`/market/${m.market.id}`)}
                                className="p-3 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                <p className="text-sm font-medium">{m.market.title}</p>
                                <div className="flex gap-3 text-xs text-gray-400 mt-1">
                                    <span>{m.clicks} clicks</span>
                                    <span>{m.conversions} conversions</span>
                                    <span className="capitalize">{m.market.source}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Predictions */}
            {predictions?.predictions?.length > 0 && (
                <div className="glass rounded-2xl p-5">
                    <h3 className="font-semibold mb-3">Recent Predictions</h3>
                    <div className="space-y-2">
                        {predictions.predictions.slice(0, 10).map((p: any) => (
                            <div key={p.id} onClick={() => navigate(`/market/${p.market.id}`)}
                                className="p-3 rounded-xl bg-white/5 flex items-center gap-3 cursor-pointer hover:bg-white/10 transition-colors">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${p.status === 'WON' ? 'bg-emerald-500/20 text-emerald-400' :
                                    p.status === 'LOST' ? 'bg-red-500/20 text-red-400' :
                                        'bg-gray-500/20 text-gray-400'
                                    }`}>{p.side}</span>
                                <p className="text-sm flex-1 truncate">{p.market.question}</p>
                                <span className="text-xs text-gray-500">{new Date(p.predicted_at).toLocaleDateString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
