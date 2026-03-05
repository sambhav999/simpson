import { create } from 'zustand';

interface FeedState {
    currentIndex: number;
    markets: any[];
    setCurrentIndex: (index: number) => void;
    setMarkets: (markets: any[]) => void;
    nextMarket: () => void;
    prevMarket: () => void;
}

export const useFeedStore = create<FeedState>((set, get) => ({
    currentIndex: 0,
    markets: [],
    setCurrentIndex: (index) => set({ currentIndex: index }),
    setMarkets: (markets) => set({ markets }),
    nextMarket: () => {
        const { currentIndex, markets } = get();
        if (currentIndex < markets.length - 1) {
            set({ currentIndex: currentIndex + 1 });
        }
    },
    prevMarket: () => {
        const { currentIndex } = get();
        if (currentIndex > 0) {
            set({ currentIndex: currentIndex - 1 });
        }
    },
}));
