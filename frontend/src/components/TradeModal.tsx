
import { QRCodeSVG } from 'qrcode.react';

export default function TradeModal({
    isOpen,
    market,
    onClose,
    side,
    setSide,
    amount,
    setAmount,
    getQuote,
    quoteLoading,
    quote,
    setQuote,
    quoteError,
    confirming,
    checkBalanceAndConfirm,
    tradeSuccess,
    paymentMethod,
    setPaymentMethod,
    qrUri,
    onTradeSuccess
}: any) {
    if (!isOpen || !market) return null;

    const formatExpiry = (expiry: string | null) => {
        if (!expiry) return 'TBD';
        return new Date(expiry).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getCategoryClass = (cat: string) => {
        const c = (cat || 'General').toLowerCase();
        if (c.includes('crypto')) return 'cat-crypto';
        if (c.includes('politics')) return 'cat-politics';
        if (c.includes('sports')) return 'cat-sports';
        return 'cat-general';
    };

    return (
        <div className="modal-overlay">
            <div className="trade-modal glass-effect">
                <button className="close-btn" onClick={onClose}>✕</button>
                <div className="modal-content-grid">
                    <div className="modal-header">
                        <h2 className="market-title">{market.title || market.question}</h2>
                        <div className="modal-meta">
                            <span className={`category-tag ${getCategoryClass(market.category || 'General')}`}>{market.category || 'General'}</span>
                            <span className={`status-badge ${(market.status || 'Active').toLowerCase()}`}>{market.status || 'Active'}</span>
                            <span className="expiry-text">📅 {formatExpiry(market.expiry || market.closes_at)}</span>
                        </div>
                    </div>

                    <div className="modal-body">
                        {tradeSuccess ? (
                            <div className="trade-success-state">
                                <div className="success-icon">🎉</div>
                                <h3>Trade Successful!</h3>
                                <p>You bought <strong>${Number(amount).toFixed(2)}</strong> of <strong>{side}</strong></p>
                                <p className="success-market-title">{market.title || market.question}</p>
                                <button className="quote-btn" onClick={() => {
                                    if (onTradeSuccess) onTradeSuccess();
                                    onClose();
                                }}>Done</button>
                            </div>
                        ) : quote ? (
                            <div className="quote-confirmation">
                                <button className="back-btn" onClick={() => setQuote(null)} disabled={confirming}>← Back</button>
                                <div className="quote-result large">
                                    <h4>Review Trade</h4>
                                    <div className="quote-row"><span>Side</span><span className={`side-badge ${quote.side.toLowerCase()}`}>{quote.side}</span></div>
                                    <div className="quote-row"><span>Amount</span><span>${Number(quote.amount).toFixed(2)}</span></div>
                                    <div className="quote-row total"><span>Total Cost</span><span>${Number(quote.total).toFixed(4)}</span></div>
                                </div>
                                <div className="payment-method-selector">
                                    <button className={`method-btn ${paymentMethod === 'wallet' ? 'active' : ''}`} onClick={() => setPaymentMethod('wallet')}>Wallet</button>
                                    <button className={`method-btn ${paymentMethod === 'qr' ? 'active' : ''}`} onClick={() => setPaymentMethod('qr')}>QR Scan</button>
                                </div>
                                {quoteError && <div className="quote-error">⚠️ {quoteError}</div>}
                                {paymentMethod === 'wallet' ? (
                                    <button className={`confirm-btn ${confirming ? 'loading' : ''}`} onClick={checkBalanceAndConfirm} disabled={confirming}>
                                        {confirming ? 'Wait...' : 'Confirm Trade'}
                                    </button>
                                ) : (
                                    <div className="qr-container">
                                        <div className="qr-code-wrapper"><QRCodeSVG value={qrUri} size={200} includeMargin={true} /></div>
                                        {/* (Simulated Payment button removed for Mainnet enforcement) */}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="side-selector">
                                    <button className={`side-btn yes ${side === 'YES' ? 'selected' : ''}`} onClick={() => setSide('YES')}>YES</button>
                                    <button className={`side-btn no ${side === 'NO' ? 'selected' : ''}`} onClick={() => setSide('NO')}>NO</button>
                                </div>
                                <div className="form-group">
                                    <label>Amount (USD)</label>
                                    <input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
                                </div>
                                {quoteError && <div className="quote-error">⚠️ {quoteError}</div>}
                                <button className="quote-btn" onClick={getQuote} disabled={quoteLoading || !amount}>
                                    {quoteLoading ? 'Loading...' : 'Get Quote'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
