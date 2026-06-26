import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { loadMetricsForAssignments } from '../../utils/metricsLoader';
import { normalizeDate } from '../../utils/timeCalculations';

export default function GenerateSummary() {
  const [loading, setLoading] = useState(true);
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYearId, setSelectedYearId] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [userDept, setUserDept] = useState('');
  const [copyStatus, setCopyStatus] = useState({ success: false, error: false, message: '' });

  const activeIesId = localStorage.getItem('activeIesId');
  const activeRole = localStorage.getItem('activeRole');

  useEffect(() => {
    fetchInitialData();
  }, [activeIesId, activeRole]);

  useEffect(() => {
    if (selectedYearId && userDept) {
      fetchAssignmentsAndMetrics();
    }
  }, [selectedYearId, userDept]);

  const fetchInitialData = async () => {
    if (!activeIesId) return;
    setLoading(true);
    try {
      // 1. Fetch User Profile to get Department
      const userDoc = await getDoc(doc(db, 'usuarios', auth.currentUser.uid));
      if (userDoc.exists()) {
        const profile = userDoc.data();
        setUserProfile(profile);
        const myRole = profile.roles?.find(r => r.rol === activeRole && r.iesId === activeIesId);
        setUserDept(myRole?.departamento || '');
      }

      // 2. Fetch Academic Years
      const qYears = query(collection(db, 'cursos_academicos'), where('iesId', '==', activeIesId));
      const snapYears = await getDocs(qYears);
      const yearsData = snapYears.docs.map(d => ({ id: d.id, ...d.data() }));
      yearsData.sort((a, b) => b.añoInicio - a.añoInicio);
      setAcademicYears(yearsData);
      if (yearsData.length > 0) {
        setSelectedYearId(yearsData[0].id);
      }
    } catch (error) {
      console.error("Error fetching initial data for summary:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignmentsAndMetrics = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'ies_imparticiones'),
        where('iesId', '==', activeIesId),
        where('cursoAcademicoId', '==', selectedYearId),
        where('departamento', '==', userDept)
      );
      const snap = await getDocs(q);
      const rawAssigns = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const currentYear = academicYears.find(y => y.id === selectedYearId);
      const assignmentsWithMetrics = await loadMetricsForAssignments(activeIesId, rawAssigns, currentYear);

      setAssignments(assignmentsWithMetrics);
    } catch (error) {
      console.error("Error loading assignments for summary:", error);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to parse group name for logical sorting and grouping
  const parseGrupo = (grupoNombre) => {
    if (!grupoNombre) return { ciclo: 'Otros', nivel: 99, grupo: '' };
    
    // Pattern: SMR1A, DAM1D, IFC2B, DAW2V, etc.
    const match = grupoNombre.match(/^([A-Za-z]+)([0-9])(.*)$/);
    if (match) {
      return {
        ciclo: match[1].toUpperCase(),
        nivel: parseInt(match[2], 10),
        grupo: match[3].toUpperCase()
      };
    }
    
    return {
      ciclo: grupoNombre.toUpperCase(),
      nivel: 99,
      grupo: ''
    };
  };

  // Groups and sorts assignments
  const getGroupedAssignments = () => {
    const grouped = {};
    
    assignments.forEach(a => {
      const parsed = parseGrupo(a.grupoNombre);
      const key = `${parsed.ciclo}_${parsed.nivel}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          ciclo: parsed.ciclo,
          nivel: parsed.nivel,
          label: `Ciclo ${parsed.ciclo} - ${parsed.nivel}º Curso`,
          list: []
        };
      }
      grouped[key].list.push({ ...a, parsedGroup: parsed });
    });
    
    // Sort keys alphabetically by ciclo, then by nivel (1, 2)
    const sortedKeys = Object.keys(grouped).sort((keyA, keyB) => {
      const groupA = grouped[keyA];
      const groupB = grouped[keyB];
      
      if (groupA.ciclo !== groupB.ciclo) {
        return groupA.ciclo.localeCompare(groupB.ciclo);
      }
      return groupA.nivel - groupB.nivel;
    });
    
    // Sort assignments inside each group by group letter (A, B, D, V) then by subject name
    sortedKeys.forEach(key => {
      grouped[key].list.sort((a, b) => {
        if (a.parsedGroup.grupo !== b.parsedGroup.grupo) {
          return a.parsedGroup.grupo.localeCompare(b.parsedGroup.grupo);
        }
        return (a.asignaturaNombre || '').localeCompare(b.asignaturaNombre || '');
      });
    });
    
    return { sortedKeys, grouped };
  };

  const { sortedKeys, grouped } = getGroupedAssignments();

  const generateHTMLForGoogleDocs = () => {
    let html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5;">
        <h1 style="color: #0f172a; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; margin-bottom: 20px; font-size: 24px;">
          Resumen de Seguimiento de Programación - Departamento de ${userDept}
        </h1>
        <p style="color: #64748b; font-size: 14px; margin-bottom: 28px;">
          Curso Académico: <strong>${academicYears.find(y => y.id === selectedYearId)?.nombre || ''}</strong>
        </p>
    `;

    sortedKeys.forEach(groupKey => {
      const group = grouped[groupKey];
      html += `
        <div style="margin-top: 32px; margin-bottom: 16px; border-left: 4px solid #3b82f6; padding-left: 12px;">
          <h2 style="font-size: 18px; color: #1e3a8a; margin: 0;">${group.label}</h2>
        </div>
      `;

      group.list.forEach(a => {
        const devText = a.desviacion > 0 ? `+${a.desviacion}h` : `${a.desviacion}h`;
        const devColor = a.desviacion > 0 ? '#dc2626' : (a.desviacion < 0 ? '#16a34a' : '#4b5563');
        const lastUpdateText = a.lastUpdate 
          ? normalizeDate(a.lastUpdate)?.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) 
          : 'Sin actualizar';

        html += `
          <div style="margin-bottom: 32px; page-break-inside: avoid;">
            <h3 style="font-size: 14px; color: #0f172a; margin-top: 0; margin-bottom: 4px; padding-top: 8px;">
              ${a.asignaturaNombre || 'Asignatura'} (${a.asignaturaSigla}) - Grupo ${a.grupoNombre}
            </h3>
            <p style="font-size: 12px; color: #475569; margin: 0 0 10px 0;">
              Profesor: <strong>${a.profesorNombre}</strong> | 
              Desviación: <strong style="color: ${devColor};">${devText}</strong> | 
              Última Act.: <strong>${lastUpdateText}</strong>
            </p>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; font-size: 11px; table-layout: auto;">
              <thead>
                <tr style="background-color: #f1f5f9;">
                  <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; width: 5%; white-space: nowrap;">Tema</th>
                  <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left; font-weight: bold; width: 30%;">Nombre</th>
                  <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; width: 10%; white-space: nowrap;">F. Inicio</th>
                  <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; width: 10%; white-space: nowrap;">F. Fin</th>
                  <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; width: 8%; white-space: nowrap;">H. Est.</th>
                  <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; width: 8%; white-space: nowrap;">Sesiones</th>
                  <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; width: 8%; white-space: nowrap;">H. Real</th>
                  <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; width: 8%; white-space: nowrap;">Desv.</th>
                  <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left; font-weight: bold; width: 13%;">Observaciones</th>
                </tr>
              </thead>
              <tbody>
        `;

        if (!a.temas || a.temas.length === 0) {
          html += `
            <tr>
              <td colspan="9" style="border: 1px solid #cbd5e1; padding: 10px; text-align: center; color: #64748b; font-style: italic;">
                No hay temas en esta programación.
              </td>
            </tr>
          `;
        } else {
          a.temas.forEach(t => {
            const temaMetrics = a.metricasPorTema?.find(m => Number(m.id) === Number(t.id)) || {
              hReal: 0,
              nSesiones: 0,
              desviacion: null
            };

            const tDevText = temaMetrics.desviacion !== null 
              ? (temaMetrics.desviacion > 0 ? `+${temaMetrics.desviacion}h` : `${temaMetrics.desviacion}h`) 
              : '-';
            const tDevColor = temaMetrics.desviacion > 0 
              ? '#dc2626' 
              : (temaMetrics.desviacion < 0 ? '#16a34a' : '#4b5563');

            const tStart = t.fechaInicio 
              ? normalizeDate(t.fechaInicio)?.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) 
              : '-';
            const tEnd = t.fechaFin 
              ? normalizeDate(t.fechaFin)?.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) 
              : '-';

            html += `
              <tr>
                <td style="border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; font-weight: bold; color: #475569; white-space: nowrap;">${t.id}</td>
                <td style="border: 1px solid #cbd5e1; padding: 5px 6px; font-weight: 500;">${t.nombre}</td>
                <td style="border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; color: #475569; white-space: nowrap;">${tStart}</td>
                <td style="border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; color: #475569; white-space: nowrap;">${tEnd}</td>
                <td style="border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; font-weight: bold; background-color: #fafafa; white-space: nowrap;">${Math.round(t.horasEstimadas)}h</td>
                <td style="border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; white-space: nowrap;">${t.fechaInicio && t.fechaFin ? temaMetrics.nSesiones : '-'}</td>
                <td style="border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; font-weight: bold; white-space: nowrap;">${t.fechaInicio && t.fechaFin ? `${temaMetrics.hReal}h` : '-'}</td>
                <td style="border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; font-weight: bold; color: ${tDevColor}; white-space: nowrap;">${tDevText}</td>
                <td style="border: 1px solid #cbd5e1; padding: 5px 6px; color: #475569; font-style: italic;">${t.observaciones || '-'}</td>
              </tr>
            `;
          });
        }

        html += `
              </tbody>
            </table>
          </div>
        `;
      });
    });

    html += `</div>`;
    return html;
  };

  const copyToClipboard = async () => {
    try {
      const htmlContent = generateHTMLForGoogleDocs();
      
      // Text fall back layout structure
      const textContent = sortedKeys.map(groupKey => {
        const group = grouped[groupKey];
        const groupText = `=== ${group.label} ===\n`;
        const listText = group.list.map(a => {
          const header = `${a.asignaturaNombre} (${a.asignaturaSigla}) - Grupo ${a.grupoNombre} - Profesor: ${a.profesorNombre}`;
          const tableHeader = 'Tema\tNombre\tF. Inicio\tF. Fin\tH. Est\tSesiones\tH. Real\tDesv.\tObservaciones';
          const rows = (a.temas || []).map(t => {
            const m = a.metricasPorTema?.find(m => Number(m.id) === Number(t.id)) || { hReal: 0, nSesiones: 0, desviacion: null };
            return `${t.id}\t${t.nombre}\t${t.fechaInicio || '-'}\t${t.fechaFin || '-'}\t${t.horasEstimadas}h\t${t.fechaInicio && t.fechaFin ? m.nSesiones : '-'}\t${t.fechaInicio && t.fechaFin ? m.hReal + 'h' : '-'}\t${m.desviacion !== null ? m.desviacion : '-'}\t${t.observaciones || '-'}`;
          }).join('\n');
          return `${header}\n${tableHeader}\n${rows}`;
        }).join('\n\n');
        return `${groupText}${listText}`;
      }).join('\n\n');

      const blobHtml = new Blob([htmlContent], { type: 'text/html' });
      const blobText = new Blob([textContent], { type: 'text/plain' });

      const data = [
        new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText
        })
      ];

      await navigator.clipboard.write(data);
      setCopyStatus({ success: true, error: false, message: '¡Resumen copiado correctamente! Ya puedes pegarlo (Ctrl+V) en Google Docs.' });
    } catch (err) {
      console.error("Clipboard Error:", err);
      setCopyStatus({ success: false, error: true, message: 'No se pudo copiar automáticamente. Intenta seleccionar el texto manualmente o descarga el archivo HTML.' });
    }
  };

  const downloadHTMLFile = () => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Resumen de Programación - ${userDept}</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #f8fafc; padding: 2rem; }
          .container { max-width: 900px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
        </style>
      </head>
      <body>
        <div class="container">
          ${generateHTMLForGoogleDocs()}
        </div>
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Resumen_Programaciones_${userDept || 'Dept'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && assignments.length === 0) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8', fontSize: '1.2rem' }}>
        Cargando resumen de programaciones...
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', margin: 0, background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Generar Resumen de Seguimiento
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Departamento de {userDept || 'cargando...'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>Curso</label>
            <select 
              className="input-field" 
              value={selectedYearId} 
              onChange={e => setSelectedYearId(e.target.value)} 
              style={{ padding: '0.5rem 1rem', borderRadius: '10px', minWidth: '150px' }}
            >
              {academicYears.map(y => <option key={y.id} value={y.id}>{y.nombre}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* Control Panel */}
      <section className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: '300px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: '600' }}>Copiar para Google Docs</h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', lineHeight: '1.4' }}>
            Haz clic en el botón para copiar el resumen agrupado por Ciclo y Nivel. Al pegarlo en Google Docs, se conservarán las tablas y colores sin descolocarse, gracias a los anchos fijos y la prevención de saltos de línea automáticos.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            className="btn-primary" 
            onClick={copyToClipboard}
            style={{ padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', borderRadius: '10px' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
            Copiar al portapapeles
          </button>
          <button 
            className="btn-secondary" 
            onClick={downloadHTMLFile}
            style={{ padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', borderRadius: '10px' }}
            title="Descargar archivo HTML por si falla el portapapeles"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Descargar HTML
          </button>
        </div>
      </section>

      {/* Copy Alert Status */}
      {copyStatus.message && (
        <div style={{ 
          padding: '1rem', 
          borderRadius: '10px', 
          marginBottom: '2rem', 
          backgroundColor: copyStatus.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', 
          border: `1px solid ${copyStatus.success ? '#10b981' : '#ef4444'}`,
          color: copyStatus.success ? '#10b981' : '#ef4444',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{copyStatus.message}</span>
          <button 
            onClick={() => setCopyStatus({ success: false, error: false, message: '' })}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Preview Section */}
      <section>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.25rem' }}>
          Vista Previa del Documento
        </h2>

        {assignments.length === 0 ? (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
            No se encontraron asignaturas asignadas a este departamento para el curso seleccionado.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {sortedKeys.map(groupKey => {
              const group = grouped[groupKey];
              return (
                <div key={groupKey} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Group Header */}
                  <div style={{ borderLeft: '4px solid var(--active-role-bg)', paddingLeft: '12px', marginTop: '1rem' }}>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                      {group.label}
                    </h2>
                  </div>

                  {group.list.map(a => {
                    const devText = a.desviacion > 0 ? `+${a.desviacion}h` : `${a.desviacion}h`;
                    const devColor = a.desviacion > 0 ? '#ef4444' : (a.desviacion < 0 ? '#10b981' : '#94a3b8');

                    return (
                      <div key={a.id} className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                              {a.asignaturaNombre} ({a.asignaturaSigla})
                            </h3>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                              Grupo: <strong>{a.grupoNombre}</strong> | Profesor: <strong>{a.profesorNombre}</strong>
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Desviación</span>
                              <strong style={{ fontSize: '1.2rem', color: devColor }}>{devText}</strong>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Última Act.</span>
                              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                {a.lastUpdate ? normalizeDate(a.lastUpdate)?.toLocaleDateString() : 'Nunca'}
                              </strong>
                            </div>
                          </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '0.6rem', color: '#94a3b8', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', width: '5%', whiteSpace: 'nowrap' }}>Tema</th>
                                <th style={{ padding: '0.6rem', color: '#94a3b8', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', width: '30%' }}>Nombre</th>
                                <th style={{ padding: '0.6rem', color: '#94a3b8', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', width: '10%', textAlign: 'center', whiteSpace: 'nowrap' }}>F. Inicio</th>
                                <th style={{ padding: '0.6rem', color: '#94a3b8', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', width: '10%', textAlign: 'center', whiteSpace: 'nowrap' }}>F. Fin</th>
                                <th style={{ padding: '0.6rem', color: '#94a3b8', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', width: '8%', textAlign: 'center', whiteSpace: 'nowrap' }}>H. Est.</th>
                                <th style={{ padding: '0.6rem', color: '#94a3b8', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', width: '8%', textAlign: 'center', whiteSpace: 'nowrap' }}>Sesiones</th>
                                <th style={{ padding: '0.6rem', color: '#94a3b8', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', width: '8%', textAlign: 'center', whiteSpace: 'nowrap' }}>H. Real</th>
                                <th style={{ padding: '0.6rem', color: '#94a3b8', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', width: '8%', textAlign: 'center', whiteSpace: 'nowrap' }}>Desv.</th>
                                <th style={{ padding: '0.6rem', color: '#94a3b8', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', width: '13%' }}>Observaciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {!a.temas || a.temas.length === 0 ? (
                                <tr>
                                  <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                    No hay temas en esta programación.
                                  </td>
                                </tr>
                              ) : (
                                a.temas.map(t => {
                                  const temaMetrics = a.metricasPorTema?.find(m => Number(m.id) === Number(t.id)) || {
                                    hReal: 0,
                                    nSesiones: 0,
                                    desviacion: null
                                  };

                                  const tDevColor = temaMetrics.desviacion < 0 ? '#10b981' : (temaMetrics.desviacion > 0 ? '#ef4444' : '#94a3b8');

                                  return (
                                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                      <td style={{ padding: '0.6rem', fontWeight: 'bold', color: '#94a3b8', whiteSpace: 'nowrap' }}>{t.id}</td>
                                      <td style={{ padding: '0.6rem', color: '#f8fafc', fontWeight: '500' }}>{t.nombre}</td>
                                      <td style={{ padding: '0.6rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                        {t.fechaInicio ? normalizeDate(t.fechaInicio)?.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}
                                      </td>
                                      <td style={{ padding: '0.6rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                        {t.fechaFin ? normalizeDate(t.fechaFin)?.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}
                                      </td>
                                      <td style={{ padding: '0.6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                        <span style={{ padding: '0.2rem 0.4rem', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                          {Math.round(t.horasEstimadas)}h
                                        </span>
                                      </td>
                                      <td style={{ padding: '0.6rem', textAlign: 'center', color: '#a5b4fc', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                        {t.fechaInicio && t.fechaFin ? temaMetrics.nSesiones : '-'}
                                      </td>
                                      <td style={{ padding: '0.6rem', textAlign: 'center', color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                        {t.fechaInicio && t.fechaFin ? `${temaMetrics.hReal}h` : '-'}
                                      </td>
                                      <td style={{ padding: '0.6rem', textAlign: 'center', fontWeight: '800', color: tDevColor, whiteSpace: 'nowrap' }}>
                                        {temaMetrics.desviacion !== null ? (temaMetrics.desviacion > 0 ? `+${temaMetrics.desviacion}h` : `${temaMetrics.desviacion}h`) : '-'}
                                      </td>
                                      <td style={{ padding: '0.6rem', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                        {t.observaciones || '-'}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
