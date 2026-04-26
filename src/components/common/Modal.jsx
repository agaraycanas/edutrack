import React from 'react';

export default function Modal({ isOpen, onClose, title, children, footer, maxWidth = '500px' }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content glass-panel animate-fade-in" 
        onClick={e => e.stopPropagation()}
        style={{ maxWidth }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.5rem' }}>{title}</h2>
            <button 
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {children}
        </div>
        {footer !== null && (
          <div className="modal-footer">
            {footer || (
              <button className="btn-primary" onClick={onClose}>
                Entendido
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
