const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('auth_token');
    if (token) {
        return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    }
    return { 'Content-Type': 'application/json' };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        ...options,
        headers: { ...getAuthHeaders(), ...options.headers },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err.error?.message || err.message || 'Request failed');
    }
    return res.json();
}

// Markets
export const fetchMarkets = (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/markets${qs}`);
};
export const fetchFeaturedMarkets = () => request<any>('/markets/featured');
export const fetchMarketDetail = (id: string) => request<any>(`/markets/${id}`);

// Auth
export const requestNonce = (wallet: string) =>
    request<any>('/api/auth/nonce', { method: 'POST', body: JSON.stringify({ wallet }) });
export const verifyAuth = (wallet: string, signature: string) =>
    request<any>('/api/auth/verify', { method: 'POST', body: JSON.stringify({ wallet, signature }) });

// Predictions
export const fetchAIPredictions = (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/api/predictions/ai${qs}`);
};
export const trackPrediction = (data: { market_id: string; side: string; referral_code?: string }) =>
    request<any>('/api/predictions/track', { method: 'POST', body: JSON.stringify(data) });
export const fetchUserPredictions = (userId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/api/predictions/user/${userId}${qs}`);
};

// Social
export const createComment = (data: { market_id: string; text: string; parent_id?: string }) =>
    request<any>('/api/comments', { method: 'POST', body: JSON.stringify(data) });
export const fetchComments = (marketId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/api/comments/market/${marketId}${qs}`);
};
export const upvoteComment = (id: string) =>
    request<any>(`/api/comments/${id}/upvote`, { method: 'POST' });
export const followUser = (following_id: string) =>
    request<any>('/api/comments/follow', { method: 'POST', body: JSON.stringify({ following_id }) });
export const unfollowUser = (userId: string) =>
    request<any>(`/api/comments/follow/${userId}`, { method: 'DELETE' });
export const fetchFeed = (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/api/feed/feed${qs}`);
};

// Creators
export const hostMarket = (data: { market_id: string; caption: string }) =>
    request<any>('/api/creators/host', { method: 'POST', body: JSON.stringify(data) });
export const fetchCreatorProfile = (id: string) => request<any>(`/api/creators/${id}`);
export const fetchCreatorMarkets = (id: string) => request<any>(`/api/creators/${id}/markets`);
export const fetchCreatorStats = (id: string) => request<any>(`/api/creators/${id}/stats`);

// Leaderboards
export const fetchXPLeaderboard = (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/leaderboard/xp${qs}`);
};
export const fetchAccuracyLeaderboard = (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/leaderboard/accuracy${qs}`);
};
export const fetchVolumeLeaderboard = (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/leaderboard/volume${qs}`);
};
export const fetchCreatorsLeaderboard = () => request<any>('/leaderboard/creators');

// Trades
export const recordTrade = (data: {
    walletAddress: string;
    marketId: string;
    tokenMint?: string;
    side: string;
    amount: number;
    price?: number;
}) => request<any>('/trade', { method: 'POST', body: JSON.stringify(data) });

// Daily 5
export const fetchDaily = () => request<any>('/api/daily');
export const submitDailyPredictions = (predictions: any[]) =>
    request<any>('/api/daily/predict', { method: 'POST', body: JSON.stringify({ predictions }) });
export const fetchDailyScoreboard = () => request<any>('/api/daily/scoreboard');
export const fetchDailyUserStats = () => request<any>('/api/daily/user/stats');
export const fetchDailyLeaderboard = () => request<any>('/api/daily/leaderboard');

// Cards
export const generateMemeCard = (data: { market_id: string; template: string }) =>
    request<any>('/api/cards/generate', { method: 'POST', body: JSON.stringify(data) });

// Portfolio
export const fetchPortfolio = (wallet: string) => request<any>(`/portfolio/${wallet}`);

// Points
export const fetchPoints = (wallet: string) => request<any>(`/points/${wallet}`);
