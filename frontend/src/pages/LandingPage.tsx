import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useEffect } from 'react';
import { requestNonce, verifyAuth } from '../lib/api';
import { useUserStore } from '../stores/userStore';

export default function LandingPage() {
    const { publicKey, connected, signMessage } = useWallet();
    const { isAuthenticated, setUser, setWallet } = useUserStore();
    const navigate = useNavigate();

    useEffect(() => {
        if (connected && publicKey) {
            handleAuth();
        }
    }, [connected, publicKey]);

    const handleAuth = async () => {
        if (!publicKey) return;
        const wallet = publicKey.toBase58();
        try {
            // Get nonce
            const { nonce, message } = await requestNonce(wallet);

            // Sign message
            let signature = 'dev-signature';
            if (signMessage) {
                try {
                    const encoded = new TextEncoder().encode(message);
                    const sig = await signMessage(encoded);
                    signature = Buffer.from(sig).toString('hex');
                } catch {
                    // User rejected or signMessage not available
                }
            }

            // Verify
            const result = await verifyAuth(wallet, signature);
            localStorage.setItem('auth_token', result.token);
            setWallet(wallet);
            setUser(result.user);
            navigate('/feed');
        } catch (err) {
            console.error('Auth failed:', err);
        }
    };

    if (isAuthenticated) {
        navigate('/feed');
        return null;
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-blue-900/20" />
            <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px]" />
            <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-blue-600/10 rounded-full blur-[80px]" />

            <div className="relative z-10 text-center max-w-lg">
                {/* Logo / Icon */}
                <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-5xl mb-8 pulse-glow rotate-12 transform">
                    🔮
                </div>

                <h1 className="text-5xl md:text-6xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent leading-tight mb-4">
                    SimPredicts
                </h1>
                <p className="text-xl text-gray-300 mb-2 font-medium">Discover. Predict. Flex.</p>
                <p className="text-sm text-gray-500 mb-10 max-w-xs mx-auto">
                    Swipe through prediction markets, follow Homer Baba's AI calls, and compete on the Daily 5.
                </p>

                {/* Feature cards */}
                <div className="grid grid-cols-3 gap-3 mb-10 text-center">
                    <div className="glass rounded-xl p-3">
                        <p className="text-2xl mb-1">📱</p>
                        <p className="text-xs text-gray-400">Swipe Feed</p>
                    </div>
                    <div className="glass rounded-xl p-3">
                        <p className="text-2xl mb-1">🔮</p>
                        <p className="text-xs text-gray-400">AI Oracle</p>
                    </div>
                    <div className="glass rounded-xl p-3">
                        <p className="text-2xl mb-1">⚡</p>
                        <p className="text-xs text-gray-400">Daily 5</p>
                    </div>
                </div>

                {/* Wallet Connect */}
                <div className="space-y-3">
                    <WalletMultiButton style={{
                        width: '100%',
                        padding: '18px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, #7C3AED, #2563EB)',
                        fontSize: '16px',
                        fontWeight: 700,
                        justifyContent: 'center',
                    }} />
                    <button
                        onClick={() => navigate('/feed')}
                        className="w-full py-3 rounded-xl text-gray-400 hover:text-white text-sm transition-colors border border-white/10 hover:border-white/20"
                    >
                        Browse without wallet →
                    </button>
                </div>

                <p className="text-xs text-gray-600 mt-6">
                    Prediction markets • Not financial advice
                </p>
            </div>
        </div>
    );
}
