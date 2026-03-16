
import React from 'react';

const SkeletonCard: React.FC = () => {
  return (
    <div className="market-card glass-effect skeleton">
      <div className="market-image skeleton-pulse" style={{ height: '160px', background: 'rgba(255,255,255,0.05)' }}></div>
      <div className="market-card-content" style={{ padding: '1.2rem' }}>
        <div className="skeleton-pulse" style={{ height: '24px', width: '80%', marginBottom: '1rem', background: 'rgba(255,255,255,0.08)', borderRadius: '4px' }}></div>
        <div className="market-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="skeleton-pulse" style={{ height: '20px', width: '60px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}></div>
          <div className="skeleton-pulse" style={{ height: '32px', width: '80px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}></div>
        </div>
      </div>
      <style>{`
        .skeleton-pulse {
          animation: pulse 1.5s infinite ease-in-out;
        }
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

export default SkeletonCard;
