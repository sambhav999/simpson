import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LandingPage from './pages/LandingPage';
import FeedPage from './pages/FeedPage';
import MarketDetailPage from './pages/MarketDetailPage';
import LeaderboardsPage from './pages/LeaderboardsPage';
import AIScoreboardPage from './pages/AIScoreboardPage';
import DailyPage from './pages/DailyPage';
import ProfilePage from './pages/ProfilePage';
import { useUserStore } from './stores/userStore';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

function Layout({ children }: { children: React.ReactNode }) {
  const { wallet } = useUserStore();

  return (
    <div className="min-h-screen bg-[#0F0F1A]">
      {children}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/5 safe-area-pb">
        <div className="max-w-lg mx-auto flex items-center justify-around py-2 px-1">
          <NavLink to="/feed" className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all ${isActive ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`
          }>
            <span className="text-xl">📱</span>
            <span className="text-[10px]">Feed</span>
          </NavLink>
          <NavLink to="/daily" className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all ${isActive ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`
          }>
            <span className="text-xl">⚡</span>
            <span className="text-[10px]">Daily 5</span>
          </NavLink>
          <NavLink to="/scoreboard" className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all ${isActive ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`
          }>
            <span className="text-xl">🔮</span>
            <span className="text-[10px]">Homer</span>
          </NavLink>
          <NavLink to="/leaderboards" className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all ${isActive ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`
          }>
            <span className="text-xl">🏆</span>
            <span className="text-[10px]">Ranks</span>
          </NavLink>
          {wallet ? (
            <NavLink to={`/profile/${wallet}`} className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all ${isActive ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`
            }>
              <span className="text-xl">👤</span>
              <span className="text-[10px]">Profile</span>
            </NavLink>
          ) : (
            <NavLink to="/" className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all ${isActive ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`
            }>
              <span className="text-xl">🔗</span>
              <span className="text-[10px]">Connect</span>
            </NavLink>
          )}
        </div>
      </nav>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/feed" element={<FeedPage />} />
            <Route path="/market/:id" element={<MarketDetailPage />} />
            <Route path="/leaderboards" element={<LeaderboardsPage />} />
            <Route path="/scoreboard" element={<AIScoreboardPage />} />
            <Route path="/daily" element={<DailyPage />} />
            <Route path="/profile/:id" element={<ProfilePage />} />
            <Route path="/creator/:id" element={<ProfilePage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
