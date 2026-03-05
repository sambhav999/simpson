import { create } from 'zustand';

interface UserState {
    wallet: string | null;
    user: any | null;
    isAuthenticated: boolean;
    setWallet: (wallet: string | null) => void;
    setUser: (user: any) => void;
    logout: () => void;
}

export const useUserStore = create<UserState>((set) => ({
    wallet: null,
    user: null,
    isAuthenticated: false,
    setWallet: (wallet) => set({ wallet, isAuthenticated: !!wallet }),
    setUser: (user) => set({ user, isAuthenticated: true }),
    logout: () => {
        localStorage.removeItem('auth_token');
        set({ wallet: null, user: null, isAuthenticated: false });
    },
}));

function getRankBadge(xpTotal: number): string {
    if (xpTotal >= 50001) return 'Legendary Baba';
    if (xpTotal >= 10001) return 'Grand Oracle';
    if (xpTotal >= 2001) return 'Oracle Prophet';
    if (xpTotal >= 501) return 'Market Caller';
    if (xpTotal >= 101) return 'Degen Prophet';
    return 'Apprentice Prophet';
}

export { getRankBadge };
