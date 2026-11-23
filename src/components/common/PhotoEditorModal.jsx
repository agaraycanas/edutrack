import { useState, useEffect, useRef, useCallback } from 'react';
import Modal from './Modal';

const VIEW_W = 240;
const VIEW_H = 300;
const OUT_W = 480;
const OUT_H = 600;
const EXPORT_SCALE = OUT_W / VIEW_W;

export default function PhotoEditorModal({ isOpen, imageSrc, onClose, onConfirm, saving = false }) {
  const canvasRef = useRef(null);
  const [imgObj, setImgObj] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [zoom, setZoom] = useState(1);
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const resetTransforms = useCallback(() => {
    setZoom(1);
    setScaleX(1);
    setScaleY(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Cargar la imagen al abrir el editor
  useEffect(() => {
    if (!isOpen || !imageSrc) {
      setImgObj(null);
      setLoadError(null);
      return;
    }

    resetTransforms();
    setLoadError(null);

    const img = new Image();
    if (!imageSrc.startsWith('blob:') && !imageSrc.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      setImgObj(img);
    };
    img.onerror = () => {
      setLoadError('No se pudo cargar la imagen para editarla. Prueba a seleccionar un archivo desde tu equipo.');
    };
    img.src = imageSrc;
  }, [isOpen, imageSrc, resetTransforms]);

  const drawToContext = useCallback((ctx, width, height, multiplier) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    if (!imgObj) return;

    const baseScale = Math.max(VIEW_W / imgObj.width, VIEW_H / imgObj.height);
    const drawW = imgObj.width * baseScale * zoom * scaleX * multiplier;
    const drawH = imgObj.height * baseScale * zoom * scaleY * multiplier;
    const cx = (VIEW_W / 2 + offset.x) * multiplier;
    const cy = (VIEW_H / 2 + offset.y) * multiplier;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgObj, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  }, [imgObj, zoom, scaleX, scaleY, offset]);

  // Redibujar vista previa
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = VIEW_W * dpr;
    canvas.height = VIEW_H * dpr;
    drawToContext(ctx, VIEW_W * dpr, VIEW_H * dpr, dpr);
  }, [drawToContext]);

  const handlePointerDown = (e) => {
    if (!imgObj) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset({
      x: dragStartRef.current.ox + dx,
      y: dragStartRef.current.oy + dy
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    if (!imgObj) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setZoom((prev) => Math.min(3, Math.max(0.5, Number((prev + delta).toFixed(2)))));
  };

  const handleSave = () => {
    if (!imgObj) return;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = OUT_W;
    outCanvas.height = OUT_H;
    const ctx = outCanvas.getContext('2d');
    drawToContext(ctx, OUT_W, OUT_H, EXPORT_SCALE);

    outCanvas.toBlob(
      (blob) => {
        if (blob && onConfirm) {
          onConfirm(blob);
        }
      },
      'image/jpeg',
      0.92
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title="Editar Foto de Perfil"
      maxWidth="560px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-primary"
            style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '0.55rem 0.9rem' }}
            onClick={resetTransforms}
            disabled={saving || !imgObj}
          >
            Restablecer
          </button>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || !imgObj}
            >
              {saving ? 'Subiendo...' : 'Aplicar y Subir'}
            </button>
          </div>
        </div>
      }
    >
      <div style={styles.wrapper}>
        {loadError ? (
          <div style={styles.errorBox}>{loadError}</div>
        ) : (
          <>
            <div style={styles.previewColumn}>
              <div
                style={{
                  ...styles.canvasFrame,
                  cursor: isDragging ? 'grabbing' : 'grab'
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
                title="Arrastra para mover · Rueda del ratón para hacer zoom"
              >
                <canvas
                  ref={canvasRef}
                  style={{ width: `${VIEW_W}px`, height: `${VIEW_H}px`, display: 'block', touchAction: 'none' }}
                />
                {/* Guía sutil de encuadre */}
                <div style={styles.guideOverlay} />
              </div>
              <span style={styles.hint}>
                Arrastra la foto para encuadrarla · Usa la rueda para zoom
              </span>
            </div>

            <div style={styles.controlsColumn}>
              <div style={styles.sliderGroup}>
                <div style={styles.sliderHeader}>
                  <label style={styles.sliderLabel}>Zoom</label>
                  <span style={styles.sliderValue}>{Math.round(zoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.01"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  style={styles.rangeInput}
                />
              </div>

              <div style={styles.sliderGroup}>
                <div style={styles.sliderHeader}>
                  <label style={styles.sliderLabel}>Escala horizontal (Ancho)</label>
                  <span style={styles.sliderValue}>{Math.round(scaleX * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.4"
                  step="0.01"
                  value={scaleX}
                  onChange={(e) => setScaleX(parseFloat(e.target.value))}
                  style={styles.rangeInput}
                />
              </div>

              <div style={styles.sliderGroup}>
                <div style={styles.sliderHeader}>
                  <label style={styles.sliderLabel}>Escala vertical (Alto)</label>
                  <span style={styles.sliderValue}>{Math.round(scaleY * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.4"
                  step="0.01"
                  value={scaleY}
                  onChange={(e) => setScaleY(parseFloat(e.target.value))}
                  style={styles.rangeInput}
                />
              </div>

              <div style={styles.posButtons}>
                <button
                  type="button"
                  style={styles.centerBtn}
                  onClick={() => setOffset({ x: 0, y: 0 })}
                >
                  Centrar posición
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem'
  },
  previewColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem'
  },
  canvasFrame: {
    position: 'relative',
    width: `${VIEW_W}px`,
    height: `${VIEW_H}px`,
    borderRadius: '10px',
    overflow: 'hidden',
    border: '2px solid var(--accent-primary)',
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.25)',
    userSelect: 'none'
  },
  guideOverlay: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    border: '1px dashed rgba(255, 255, 255, 0.45)',
    borderRadius: '8px',
    boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.15)'
  },
  hint: {
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
    textAlign: 'center'
  },
  controlsColumn: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.9rem',
    padding: '0.9rem 1rem',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '10px',
    border: '1px solid var(--border-color)'
  },
  sliderGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem'
  },
  sliderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sliderLabel: {
    fontSize: '0.84rem',
    fontWeight: '500',
    color: 'var(--text-primary)'
  },
  sliderValue: {
    fontSize: '0.8rem',
    fontWeight: '600',
    color: 'var(--accent-primary)',
    fontVariantNumeric: 'tabular-nums'
  },
  rangeInput: {
    width: '100%',
    cursor: 'pointer',
    accentColor: 'var(--accent-primary)'
  },
  posButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '0.2rem'
  },
  centerBtn: {
    background: 'transparent',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    fontSize: '0.78rem',
    padding: '0.35rem 0.7rem',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  errorBox: {
    padding: '1rem',
    borderRadius: '8px',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid #ef4444',
    color: '#ef4444',
    fontSize: '0.9rem',
    textAlign: 'center'
  }
};
