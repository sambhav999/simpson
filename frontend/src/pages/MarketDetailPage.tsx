import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchMarketDetail, fetchComments, createComment, trackPrediction } from '../lib/api';
import { useUserStore } from '../stores/userStore';
import { useState } from 'react';

export default function MarketDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { isAuthenticated, wallet } = useUserStore();
    const [commentText, setCommentText] = useState('');

    const { data: market, isLoading } = useQuery({
        queryKey: ['market', id],
        queryFn: () => fetchMarketDetail(id!),
        enabled: !!id,
    });

    const { data: commentsData, refetch: refetchComments } = useQuery({
        queryKey: ['comments', id],
        queryFn: () => fetchComments(id!),
        enabled: !!id,
    });

    const handleTrade = async (side: string) => {
        if (!isAuthenticated) return;
        try {
            const result = await trackPrediction({ market_id: id!, side });
            if (result.redirect_url) window.open(result.redirect_url, '_blank');
        } catch (err) { console.error(err); }
    };

    const handleComment = async () => {
        if (!commentText.trim() || !isAuthenticated) return;
        try {
            await createComment({ market_id: id!, text: commentText });
            setCommentText('');
            refetchComments();
        } catch (err) { console.error(err); }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!market) return <div className="p-6 text-center text-gray-400">Market not found</div>;

    const yesPercent = Math.round((market.yes_price || 0.5) * 100);
    const noPercent = 100 - yesPercent;

    // Mock price history for chart
    const priceHistory = Array.from({ length: 14 }, (_, i) => ({
        date: new Date(Date.now() - (13 - i) * 86400000).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        yes: Math.max(0.1, Math.min(0.9, (market.yes_price || 0.5) + (Math.random() - 0.5) * 0.2)),
        no: Math.max(0.1, Math.min(0.9, (market.no_price || 0.5) + (Math.random() - 0.5) * 0.2)),
    }));

    return (
        <div className="min-h-screen pb-24">
            {/* Header */}
            <div className="sticky top-0 z-20 glass px-4 py-3 flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <span className="text-xl">←</span>
                </button>
                <span className="text-sm text-gray-400 truncate flex-1">{market.source}</span>
            </div>

            {/* Market Image */}
            {market.image_url && (
                <div className="h-48 overflow-hidden">
                    <img src={market.image_url} alt="" className="w-full h-full object-cover" />
                </div>
            )}

            <div className="px-4 py-6 space-y-6">
                {/* Question */}
                <div>
                    <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-300 capitalize">{market.category}</span>
                    <h1 className="text-2xl font-bold mt-2">{market.question}</h1>
                    {market.description && <p className="text-gray-400 text-sm mt-2">{market.description}</p>}
                </div>

                {/* Homer Baba Analysis */}
                {market.ai_prediction && (
                    <div className="glass rounded-2xl p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-2xl">🔮</div>
                            <div>
                                <p className="font-semibold text-purple-300">Homer Baba Analysis</p>
                                <p className="text-sm text-gray-400">{market.ai_prediction.confidence}% confident</p>
                            </div>
                            <span className={`ml-auto px-4 py-2 rounded-full font-bold ${market.ai_prediction.prediction === 'YES' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {market.ai_prediction.prediction}
                            </span>
                        </div>
                        <p className="text-gray-300 italic">"{market.ai_prediction.commentary}"</p>
                    </div>
                )}

                {/* Probability Chart */}
                <div className="glass rounded-2xl p-5">
                    <h3 className="font-semibold mb-4">Probability History</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={priceHistory}>
                            <XAxis dataKey="date" stroke="#4B5563" tick={{ fill: '#6B7280', fontSize: 11 }} />
                            <YAxis domain={[0, 1]} stroke="#4B5563" tick={{ fill: '#6B7280', fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                            <Tooltip contentStyle={{ background: '#1A1A2E', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '12px' }} />
                            <Line type="monotone" dataKey="yes" stroke="#10B981" strokeWidth={2} dot={false} name="YES" />
                            <Line type="monotone" dataKey="no" stroke="#EF4444" strokeWidth={2} dot={false} name="NO" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Current Odds */}
                <div className="glass rounded-2xl p-5">
                    <h3 className="font-semibold mb-3">Current Odds</h3>
                    <div className="flex items-center gap-4">
                        <div className="flex-1 text-center p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                            <p className="text-3xl font-bold text-emerald-400">{yesPercent}%</p>
                            <p className="text-sm text-gray-400 mt-1">YES</p>
                        </div>
                        <div className="text-gray-600 text-xl">vs</div>
                        <div className="flex-1 text-center p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                            <p className="text-3xl font-bold text-red-400">{noPercent}%</p>
                            <p className="text-sm text-gray-400 mt-1">NO</p>
                        </div>
                    </div>
                </div>

                {/* Market Info */}
                <div className="glass rounded-2xl p-5 space-y-3">
                    <h3 className="font-semibold">Market Info</h3>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Volume</span>
                        <span className="font-medium">${((market.volume || 0) / 1000).toFixed(0)}K</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Closes</span>
                        <span className="font-medium">{market.closes_at ? new Date(market.closes_at).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Source</span>
                        <span className="font-medium capitalize">{market.source}</span>
                    </div>
                </div>

                {/* Trade Buttons */}
                <div className="flex gap-3">
                    <button onClick={() => handleTrade('YES')} className="flex-1 py-4 rounded-xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-emerald-500/20">
                        Trade YES
                    </button>
                    <button onClick={() => handleTrade('NO')} className="flex-1 py-4 rounded-xl font-bold bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-red-500/20">
                        Trade NO
                    </button>
                </div>

                {/* Creator */}
                {market.creator && (
                    <div className="glass rounded-2xl p-5">
                        <p className="text-sm text-gray-400 mb-2">Hosted by</p>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-500/30 flex items-center justify-center">👤</div>
                            <div>
                                <p className="font-semibold">@{market.creator.username || market.creator.id.slice(0, 8)}</p>
                                <p className="text-sm text-gray-400 italic">"{market.creator.caption}"</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Comments */}
                <div className="glass rounded-2xl p-5">
                    <h3 className="font-semibold mb-4">Comments ({market.comments_count || 0})</h3>

                    {isAuthenticated && (
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                placeholder="Add a comment..."
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-purple-500 transition-colors"
                                maxLength={500}
                            />
                            <button
                                onClick={handleComment}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-sm font-medium transition-colors"
                            >
                                Post
                            </button>
                        </div>
                    )}

                    <div className="space-y-3">
                        {commentsData?.comments?.map((c: any) => (
                            <div key={c.id} className="p-3 rounded-xl bg-white/5">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium text-purple-300">@{c.user.username || c.user.id.slice(0, 8)}</span>
                                    <span className="text-xs text-gray-500">{c.user.rank_badge}</span>
                                    <span className="ml-auto text-xs text-gray-500">{new Date(c.created_at).toLocaleDateString()}</span>
                                </div>
                                <p className="text-sm text-gray-300">{c.text}</p>
                                <div className="mt-1 text-xs text-gray-500">▲ {c.upvotes}</div>
                            </div>
                        ))}
                        {(!commentsData?.comments || commentsData.comments.length === 0) && (
                            <p className="text-sm text-gray-500 text-center py-4">No comments yet. Be the first!</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
