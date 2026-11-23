import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import {
  compareUsersAlphabetically,
  formatShortName,
  getUserInitials,
  hasRealPhoto
} from '../../utils/nameUtils';

const AVATAR_COLORS = [
  '#4f46e5', '#0284c7', '#0d9488', '#059669',
  '#d97706', '#dc2626', '#7c3aed', '#2563eb'
];

const getAvatarColor = (seed = '') => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const loadImageForCanvas = (url) =>
  new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

const drawRoundedRect = (ctx, x, y, width, height, radius) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const drawCoverImage = (ctx, img, x, y, w, h, radius) => {
  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.clip();

  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let drawW, drawH, offsetX, offsetY;

  if (imgRatio > boxRatio) {
    drawH = h;
    drawW = h * imgRatio;
    offsetX = x - (drawW - w) / 2;
    offsetY = y;
  } else {
    drawW = w;
    drawH = w / imgRatio;
    offsetX = x;
    // Alinear ligeramente hacia arriba para no cortar cabezas
    offsetY = y - (drawH - h) * 0.2;
  }

  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  ctx.restore();
};

const drawInitialsBox = (ctx, user, x, y, w, h, radius) => {
  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = '#f1f5f9';
  ctx.fill();

  const circleR = Math.min(w, h) * 0.28;
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, circleR, 0, Math.PI * 2);
  ctx.fillStyle = getAvatarColor(user.email || user.apellidos || user.nombre);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(circleR * 0.85)}px "Inter", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(getUserInitials(user.nombre, user.apellidos), x + w / 2, y + h / 2 + 2);
  ctx.restore();
};

export default function OrlaModal({
  isOpen,
  onClose,
  departmentName,
  iesName,
  academicYearLabel,
  teachers = [],
  selectedIesId
}) {
  const [downloading, setDownloading] = useState(false);

  const { heads, members } = useMemo(() => {
    const headList = [];
    const memberList = [];

    teachers.forEach((u) => {
      const isHead = u.roles?.some(
        (r) =>
          r.iesId === selectedIesId &&
          r.rol === 'jefe_departamento' &&
          r.estado === 'activo'
      );
      if (isHead) {
        headList.push(u);
      } else {
        memberList.push(u);
      }
    });

    headList.sort(compareUsersAlphabetically);
    memberList.sort(compareUsersAlphabetically);

    return { heads: headList, members: memberList };
  }, [teachers, selectedIesId]);

  const buildOrlaCanvas = async () => {
    const width = 1800;
    const outerBorder = 26;
    const innerPad = 60;
    const cols = 6;

    const headPhotoW = 200;
    const headPhotoH = 248;
    const memberPhotoW = 195;
    const memberPhotoH = 240;
    const colGap = 54;
    const rowGap = 92;

    const rows = Math.max(1, Math.ceil(members.length / cols));
    const headerHeight = 220;
    const headSectionHeight = heads.length > 0 ? headPhotoH + 140 : 0;
    const gridHeight = members.length > 0 ? rows * (memberPhotoH + rowGap) + 40 : 60;
    const height = outerBorder * 2 + innerPad * 2 + headerHeight + headSectionHeight + gridHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Fondo marfil
    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(0, 0, width, height);

    // Marco dorado exterior
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = outerBorder;
    ctx.strokeRect(
      outerBorder / 2,
      outerBorder / 2,
      width - outerBorder,
      height - outerBorder
    );

    // Filete interior fino
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 3;
    ctx.strokeRect(
      outerBorder + 14,
      outerBorder + 14,
      width - (outerBorder + 14) * 2,
      height - (outerBorder + 14) * 2
    );

    // Precargar imágenes en paralelo
    const allUsers = [...heads, ...members];
    const loadedEntries = await Promise.all(
      allUsers.map(async (u) => {
        if (!hasRealPhoto(u)) return [u.id, null];
        const img = await loadImageForCanvas(u.foto || u.avatar);
        return [u.id, img];
      })
    );
    const imageMap = new Map(loadedEntries);

    // Cabecera: Centro, Departamento y Curso
    let cursorY = outerBorder + innerPad + 30;

    if (iesName) {
      ctx.fillStyle = '#64748b';
      ctx.font = '600 24px "Inter", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(iesName.toUpperCase(), width / 2, cursorY);
      cursorY += 58;
    }

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 58px "Georgia", "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.fillText(departmentName || 'Departamento', width / 2, cursorY);
    cursorY += 50;

    // Etiqueta del curso académico
    const courseText = `Curso ${academicYearLabel || ''}`.trim();
    ctx.font = '600 28px "Inter", "Segoe UI", sans-serif';
    const pillW = Math.max(260, ctx.measureText(courseText).width + 64);
    const pillH = 48;
    drawRoundedRect(ctx, width / 2 - pillW / 2, cursorY - 26, pillW, pillH, 24);
    ctx.fillStyle = '#fef3c7';
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#92400e';
    ctx.textBaseline = 'middle';
    ctx.fillText(courseText, width / 2, cursorY - 2);
    ctx.textBaseline = 'alphabetic';

    cursorY += 66;

    // Sección destacada: Jefe(s) de Departamento
    if (heads.length > 0) {
      const headGap = 80;
      const totalHeadsW = heads.length * headPhotoW + (heads.length - 1) * headGap;
      const startX = (width - totalHeadsW) / 2;

      heads.forEach((head, idx) => {
        const x = startX + idx * (headPhotoW + headGap);
        const y = cursorY;

        // Sombra suave
        ctx.save();
        ctx.shadowColor = 'rgba(217, 119, 6, 0.25)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;
        drawRoundedRect(ctx, x - 6, y - 6, headPhotoW + 12, headPhotoH + 12, 14);
        ctx.fillStyle = '#fef3c7';
        ctx.fill();
        ctx.restore();

        const img = imageMap.get(head.id);
        if (img) {
          drawCoverImage(ctx, img, x, y, headPhotoW, headPhotoH, 10);
        } else {
          drawInitialsBox(ctx, head, x, y, headPhotoW, headPhotoH, 10);
        }

        // Borde dorado del jefe de departamento
        drawRoundedRect(ctx, x, y, headPhotoW, headPhotoH, 10);
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 5;
        ctx.stroke();

        // Badge "Jefe de Departamento"
        const badgeText = 'JEFE DE DEPARTAMENTO';
        ctx.font = '700 15px "Inter", "Segoe UI", sans-serif';
        const badgeW = ctx.measureText(badgeText).width + 26;
        const badgeH = 28;
        drawRoundedRect(ctx, x + headPhotoW / 2 - badgeW / 2, y + headPhotoH - 14, badgeW, badgeH, 14);
        ctx.fillStyle = '#d97706';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, x + headPhotoW / 2, y + headPhotoH);
        ctx.textBaseline = 'alphabetic';

        // Nombre corto
        ctx.fillStyle = '#0f172a';
        ctx.font = '700 28px "Inter", "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatShortName(head.nombre, head.apellidos), x + headPhotoW / 2, y + headPhotoH + 46);
      });

      cursorY += headPhotoH + 92;

      // Separador decorativo
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(outerBorder + innerPad + 80, cursorY);
      ctx.lineTo(width - outerBorder - innerPad - 80, cursorY);
      ctx.stroke();

      cursorY += 48;
    }

    // Cuadrícula del resto de profesores (6 columnas, última fila centrada)
    for (let r = 0; r < rows; r++) {
      const rowItems = members.slice(r * cols, (r + 1) * cols);
      if (rowItems.length === 0) break;

      const rowWidth = rowItems.length * memberPhotoW + (rowItems.length - 1) * colGap;
      const rowStartX = (width - rowWidth) / 2;
      const y = cursorY + r * (memberPhotoH + rowGap);

      rowItems.forEach((prof, c) => {
        const x = rowStartX + c * (memberPhotoW + colGap);
        const img = imageMap.get(prof.id);

        if (img) {
          drawCoverImage(ctx, img, x, y, memberPhotoW, memberPhotoH, 10);
        } else {
          drawInitialsBox(ctx, prof, x, y, memberPhotoW, memberPhotoH, 10);
        }

        drawRoundedRect(ctx, x, y, memberPhotoW, memberPhotoH, 10);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#1e293b';
        ctx.font = '600 24px "Inter", "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        const shortName = formatShortName(prof.nombre, prof.apellidos);
        ctx.fillText(shortName, x + memberPhotoW / 2, y + memberPhotoH + 36, memberPhotoW + 30);
      });
    }

    return canvas;
  };

  const handleDownloadJpg = async () => {
    setDownloading(true);
    try {
      const canvas = await buildOrlaCanvas();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
      const safeDept = (departmentName || 'Departamento')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_');
      const safeYear = (academicYearLabel || '').replace(/[^0-9-]+/g, '');
      const filename = `Orla_${safeDept}${safeYear ? `_${safeYear}` : ''}.jpg`;

      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error generando JPG de la orla:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handlePrintPdf = async () => {
    setDownloading(true);
    try {
      const canvas = await buildOrlaCanvas();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const printWin = window.open('', '_blank');
      if (!printWin) return;
      printWin.document.write(`
        <!DOCTYPE html>
        <html lang="es">
          <head>
            <title>Orla - ${departmentName || 'Departamento'} (${academicYearLabel || ''})</title>
            <style>
              @page { margin: 10mm; }
              body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fff; }
              img { max-width: 100%; max-height: 98vh; object-fit: contain; }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" onload="window.print(); window.close();" />
          </body>
        </html>
      `);
      printWin.document.close();
    } catch (err) {
      console.error('Error preparando impresión/PDF de la orla:', err);
    } finally {
      setDownloading(false);
    }
  };

  const renderPortrait = (user, isHead = false) => {
    const hasPhoto = hasRealPhoto(user);
    const shortName = formatShortName(user.nombre, user.apellidos);
    const boxStyle = isHead ? styles.headPhotoBox : styles.memberPhotoBox;

    return (
      <div key={user.id} style={isHead ? styles.headCard : styles.memberCard}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <div style={boxStyle}>
            {hasPhoto ? (
              <img
                src={user.foto || user.avatar}
                alt={shortName}
                style={styles.portraitImg}
              />
            ) : (
              <div style={styles.initialsContainer}>
                <div
                  style={{
                    ...styles.initialsCircle,
                    width: isHead ? '62px' : '50px',
                    height: isHead ? '62px' : '50px',
                    fontSize: isHead ? '1.35rem' : '1.1rem',
                    backgroundColor: getAvatarColor(user.email || user.apellidos || user.nombre)
                  }}
                >
                  {getUserInitials(user.nombre, user.apellidos)}
                </div>
              </div>
            )}
          </div>
          {isHead && <span style={styles.headBadge}>Jefe de Departamento</span>}
        </div>
        <div style={isHead ? styles.headName : styles.memberName}>{shortName}</div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Orla del Departamento"
      maxWidth="1040px"
      footer={
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>
          <button
            type="button"
            className="btn-primary"
            style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
            onClick={onClose}
            disabled={downloading}
          >
            Cerrar
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ background: 'transparent', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
            onClick={handlePrintPdf}
            disabled={downloading || teachers.length === 0}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            Imprimir / PDF
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
            onClick={handleDownloadJpg}
            disabled={downloading || teachers.length === 0}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            {downloading ? 'Generando...' : 'Descargar JPG'}
          </button>
        </div>
      }
    >
      <div style={styles.orlaOuterFrame}>
        <div style={styles.orlaInnerFrame}>
          {/* Cabecera */}
          <div style={styles.header}>
            {iesName && <div style={styles.iesName}>{iesName}</div>}
            <h2 style={styles.deptTitle}>{departmentName || 'Departamento'}</h2>
            {academicYearLabel && (
              <div style={styles.coursePill}>Curso {academicYearLabel}</div>
            )}
          </div>

          {teachers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
              No hay profesores para mostrar en la orla de este curso.
            </div>
          ) : (
            <>
              {/* Jefe de Departamento destacado arriba */}
              {heads.length > 0 && (
                <div style={styles.headSection}>
                  <div style={styles.headsRow}>
                    {heads.map((head) => renderPortrait(head, true))}
                  </div>
                  {members.length > 0 && <div style={styles.divider} />}
                </div>
              )}

              {/* Resto de profesores ordenados alfabéticamente */}
              {members.length > 0 && (
                <div style={styles.membersGrid}>
                  {members.map((prof) => renderPortrait(prof, false))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

const styles = {
  orlaOuterFrame: {
    background: '#fffdf7',
    border: '10px solid #eab308',
    borderRadius: '10px',
    padding: '8px',
    color: '#0f172a',
    boxShadow: '0 8px 28px rgba(0, 0, 0, 0.22)'
  },
  orlaInnerFrame: {
    border: '2px solid #ca8a04',
    borderRadius: '4px',
    padding: '1.75rem 1.5rem 2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  header: {
    textAlign: 'center',
    marginBottom: '1.75rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.4rem'
  },
  iesName: {
    fontSize: '0.8rem',
    fontWeight: '700',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    color: '#64748b'
  },
  deptTitle: {
    margin: 0,
    fontSize: '2rem',
    fontWeight: '700',
    fontFamily: '"Georgia", "Times New Roman", serif',
    color: '#0f172a',
    lineHeight: 1.2
  },
  coursePill: {
    marginTop: '0.35rem',
    padding: '0.3rem 1.1rem',
    borderRadius: '999px',
    backgroundColor: '#fef3c7',
    border: '1.5px solid #d97706',
    color: '#92400e',
    fontWeight: '700',
    fontSize: '0.9rem',
    letterSpacing: '0.5px'
  },
  headSection: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  headsRow: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: '2rem'
  },
  headCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.85rem'
  },
  headPhotoBox: {
    width: '132px',
    height: '164px',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '3.5px solid #d97706',
    boxShadow: '0 6px 18px rgba(217, 119, 6, 0.25)',
    backgroundColor: '#f1f5f9'
  },
  headBadge: {
    position: 'absolute',
    bottom: '-10px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#d97706',
    color: '#ffffff',
    fontSize: '0.62rem',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    padding: '3px 9px',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.18)'
  },
  headName: {
    fontWeight: '700',
    fontSize: '1rem',
    color: '#0f172a',
    textAlign: 'center'
  },
  divider: {
    width: '80%',
    height: '1px',
    background: 'linear-gradient(90deg, transparent, #cbd5e1, transparent)',
    margin: '1.6rem 0'
  },
  membersGrid: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(126px, 1fr))',
    gap: '1.5rem 1rem',
    justifyItems: 'center'
  },
  memberCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    width: '126px'
  },
  memberPhotoBox: {
    width: '108px',
    height: '134px',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '2px solid #cbd5e1',
    backgroundColor: '#f1f5f9',
    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)'
  },
  portraitImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'top center',
    display: 'block'
  },
  initialsContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9'
  },
  initialsCircle: {
    borderRadius: '50%',
    color: '#ffffff',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    letterSpacing: '0.5px'
  },
  memberName: {
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
    lineHeight: 1.25
  }
};
