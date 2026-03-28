import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { clusterApiUrl } from '@solana/web3.js'
import App from './App'
import './index.css'
import '@solana/wallet-adapter-react-ui/styles.css'

function Root() {
  const endpoint = useMemo(() => {
    const url = import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('devnet');
    console.log('[ConnectionProvider] Using endpoint:', url);
    return url;
  }, [])
  const wallets = useMemo(() => [new SolflareWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
