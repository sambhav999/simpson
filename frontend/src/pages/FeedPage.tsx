import { useEffect, useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchFeaturedMarkets, trackPrediction } from '../lib/api';
import { useFeedStore } from '../stores/feedStore';
import { useUserStore } from '../stores/userStore';

export default function FeedPage() {
    const navigate = useNavigate();
    const { currentIndex, markets, setMarkets, nextMarket, prevMarket } = useFeedStore();
    const { isAuthenticated } = useUserStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const [touchStart, setTouchStart] = useState(0);

    const { data, isLoading } = useQuery({
        queryKey: ['featured-markets'],
        queryFn: fetchFeaturedMarkets,
    });

    useEffect(() => {
        if (data?.markets) setMarkets(data.markets);
    }, [data, setMarkets]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        setTouchStart(e.touches[0].clientY);
    }, []);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        const diff = touchStart - e.changedTouches[0].clientY;
        if (Math.abs(diff) > 50) {
            if (diff > 0) nextMarket();
            else prevMarket();
        }
    }, [touchStart, nextMarket, prevMarket]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (e.deltaY > 30) nextMarket();
        else if (e.deltaY < -30) prevMarket();
    }, [nextMarket, prevMarket]);

    const handleTrade = async (marketId: string, side: string) => {
        if (!isAuthenticated) {
            navigate('/');
            return;
        }
        try {
            const result = await trackPrediction({ market_id: marketId, side });
            if (result.redirect_url) window.open(result.redirect_url, '_blank');
        } catch (err) { console.error(err); }
    };

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading markets...</p>
                </div>
            </div>
        );
    }

    const market = markets[currentIndex];
    if (!market) {
        return (
            <div className="h-screen flex items-center justify-center text-gray-400">
                <p>No featured markets yet. Check back soon!</p>
            </div>
        );
    }

    const yesPercent = Math.round((market.yes_price || 0.5) * 100);
    const noPercent = 100 - yesPercent;

    return (
        <div
            ref={containerRef}
            className="h-screen overflow-hidden relative select-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
        >
            {/* Background Image */}
            <div className="absolute inset-0 z-0">
                {market.image_url && (
                    <img src={market.image_url} alt="" className="w-full h-full object-cover opacity-30 blur-sm" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0F0F1A] via-[#0F0F1A]/80 to-transparent" />
            </div>

            {/* Card Content */}
            <div className="relative z-10 h-full flex flex-col justify-end p-6 pb-24 animate-fadeIn" key={currentIndex}>
                {/* Counter */}
                <div className="absolute top-6 right-6 text-sm text-gray-400 bg-black/40 px-3 py-1 rounded-full">
                    {currentIndex + 1} / {markets.length}
                </div>

                {/* Homer Baba */}
                {market.ai_prediction && (
                    <div className="glass rounded-2xl p-4 mb-4 max-w-md">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-lg">🔮</div>
                            <div>
                                <p className="text-sm font-semibold text-purple-300">Homer Baba</p>
                                <p className="text-xs text-gray-400">{market.ai_prediction.confidence}% confident</p>
                            </div>
                            <span className={`ml-auto px-3 py-1 rounded-full text-sm font-bold ${market.ai_prediction.prediction === 'YES' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {market.ai_prediction.prediction}
                            </span>
                        </div>
                        <p className="text-sm text-gray-300 italic">"{market.ai_prediction.commentary}"</p>
                    </div>
                )}

                {/* Question */}
                <h2 className="text-2xl md:text-3xl font-bold mb-3 leading-tight">{market.question}</h2>

                {/* Odds Bar */}
                <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-emerald-400 font-semibold">YES {yesPercent}%</span>
                        <span className="text-red-400 font-semibold">NO {noPercent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-700 overflow-hidden flex">
                        <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500" style={{ width: `${yesPercent}%` }} />
                        <div className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-500" style={{ width: `${noPercent}%` }} />
                    </div>
                </div>

                {/* Meta */}
                <div className="flex gap-4 text-sm text-gray-400 mb-5">
                    {market.volume && <span>💰 ${(market.volume / 1000).toFixed(0)}K vol</span>}
                    {market.closes_at && <span>⏰ {new Date(market.closes_at).toLocaleDateString()}</span>}
                    <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-300 capitalize">{market.source}</span>
                </div>

                {/* Trade Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={() => handleTrade(market.id, 'YES')}
                        className="flex-1 py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-emerald-500/20"
                    >
                        Trade YES
                    </button>
                    <button
                        onClick={() => handleTrade(market.id, 'NO')}
                        className="flex-1 py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-red-500/20"
                    >
                        Trade NO
                    </button>
                </div>

                {/* Tap to detail */}
                <button
                    onClick={() => navigate(`/market/${market.id}`)}
                    className="mt-3 text-center text-sm text-gray-500 hover:text-purple-400 transition-colors"
                >
                    Tap for details →
                </button>
            </div>

            {/* Swipe hints */}
            {currentIndex > 0 && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-gray-500 animate-pulse">↑ Previous</div>
            )}
            {currentIndex < markets.length - 1 && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-xs text-gray-500 animate-pulse">↓ Next</div>
            )}
        </div>
    );
}
