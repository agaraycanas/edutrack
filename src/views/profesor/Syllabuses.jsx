import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../config/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { calcularHorasReales } from '../../utils/timeCalculations';
import { Edit2, Activity, Plus, Trash2, Save, MoveUp, MoveDown } from 'lucide-react';
import Modal from '../../components/common/Modal';

export default function Syllabuses() {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [programaciones, setProgramaciones] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState('all');
  const navigate = useNavigate();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [tempTemas, setTempTemas] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messageModal, setMessageModal] = useState({ isOpen: false, title: '', message: '' });

  const activeIesId = localStorage.getItem('activeIesId');
  const uid = auth.currentUser?.uid;
  
  // Fetch initial data
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user && activeIesId) {
        fetchData(user.uid, activeIesId);
      } else if (!user) {
        setLoading(false); // Stop loading if no user
      }
    });
    return () => unsubscribe();
  }, [activeIesId]);

  const fetchData = async (uid, iesId) => {
    setLoading(true);
    console.log("Fetching syllabuses data for:", { uid, iesId });
    try {
      // 1. Fetch Teacher's Assignments
      const qAssignments = query(
        collection(db, 'ies_imparticiones'),
        where('usuarioId', '==', uid),
        where('iesId', '==', iesId)
      );
      const snapAssignments = await getDocs(qAssignments);
      const assignmentsData = snapAssignments.docs.map(d => ({ id: d.id, ...d.data() }));

      // Order
      assignmentsData.sort((a, b) => {
        const labelA = a.cursoAcademicoLabel || '';
        const labelB = b.cursoAcademicoLabel || '';
        if (labelA !== labelB) return labelB.localeCompare(labelA);
        return (a.asignaturaNombre || '').localeCompare(b.asignaturaNombre || '');
      });
      setAssignments(assignmentsData);

      // 2. Fetch programaciones for this IES (to support imported data)
      const qProg = query(
        collection(db, 'profesor_programaciones'), 
        where('iesId', '==', iesId)
      );
      const snapProg = await getDocs(qProg);
      const progsData = snapProg.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log("Fetched programaciones:", progsData.length);
      setProgramaciones(progsData);

      // 3. Fetch Horarios for this IES
      const qHorarios = query(
        collection(db, 'profesor_horarios'),
        where('iesId', '==', iesId)
      );
      const snapHorarios = await getDocs(qHorarios);
      setHorarios(snapHorarios.docs.map(d => ({ id: d.id, ...d.data() })));

      // 4. Fetch Academic Years
      const qYears = query(
        collection(db, 'cursos_academicos'),
        where('iesId', '==', iesId)
      );
      const snapYears = await getDocs(qYears);
      setAcademicYears(snapYears.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (error) {
      console.error("Error fetching syllabuses data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Process data for the table using useMemo to avoid re-renders
  const displayRows = useMemo(() => {
    console.log("Calculating displayRows", { 
      assigns: assignments.length, 
      progs: programaciones.length 
    });

    // We base the list on assignments (imparticiones), not programaciones, 
    // so the teacher sees what assignments need a programming.
    return assignments.map(a => {
      try {
        // Support matching by imparticionId field OR by document ID (legacy)
        const p = programaciones.find(prog => prog.imparticionId === a.id || prog.id === a.id);
        const h = horarios.find(hor => hor.id === a.id);
        
        // Find academic year metadata
        const ay = academicYears.find(year => year.id === a.cursoAcademicoId || year.nombre === a.cursoAcademicoLabel);
        
        const duracionSesion = ay?.duracionSesion || 55;
        const today = new Date().toISOString().split('T')[0];

        // Calculate Estimated Progress Hours (H. EST)
        let hEst = 0;
        if (h && ay?.fechaInicioClases) {
          try {
            hEst = calcularHorasReales(ay.fechaInicioClases, today, h, duracionSesion);
          } catch (e) {
            console.warn("Error calculating hEst for", a.id, e);
          }
        }

        // Calculate Real Hours (H. REAL) and Total Hours
        let hReal = 0;
        let totalHours = 0;
        
        if (p) {
          // Total hours from themes
          totalHours = p.temas?.reduce((acc, t) => acc + (t.horasEstimadas || 0), 0) || 0;
          
          // Real hours: prefer p.sesiones if available, fallback to theme dates calculation
          if (p.sesiones && p.sesiones.length > 0) {
            hReal = p.sesiones.reduce((acc, s) => acc + (s.horasReales || 0), 0);
          } else if (p.temas) {
            p.temas.forEach(t => {
              if (t.fechaInicio && t.fechaFin && h) {
                try {
                  hReal += calcularHorasReales(t.fechaInicio, t.fechaFin, h, duracionSesion);
                } catch (err) { /* ignore */ }
              }
            });
          }
        }

        // --- NEW CALCULATIONS ---
        let currentTheme = null;
        let realCurrentTheme = null;
        let totalDev = 0;
        let lastUpdate = p?.updatedAt ? new Date(p.updatedAt.seconds * 1000) : null;

        if (p && p.temas) {
          // 1. Calculate Total Deviation (sum of partials)
          p.temas.forEach(t => {
            if (t.fechaInicio) {
              // Tracking update: check fechaInicio and fechaFin as fallbacks for lastUpdate
              const dInicio = new Date(t.fechaInicio);
              if (!isNaN(dInicio.getTime()) && (!lastUpdate || dInicio > lastUpdate)) lastUpdate = dInicio;
              
              if (t.fechaFin) {
                const dFin = new Date(t.fechaFin);
                if (!isNaN(dFin.getTime()) && (!lastUpdate || dFin > lastUpdate)) lastUpdate = dFin;

                try {
                  const hRealTema = calcularHorasReales(t.fechaInicio, t.fechaFin, h, duracionSesion);
                  totalDev += (hRealTema - (Number(t.horasEstimadas) || 0));
                } catch (err) { /* ignore */ }
              }
            }
          });

          // 2. Find Theoretical Current Theme
          let cumulative = 0;
          for (const t of p.temas) {
            const tHours = Number(t.horasEstimadas) || 0;
            if (cumulative + tHours > hEst) {
              currentTheme = {
                nombre: t.nombre,
                progress: Math.max(0, Math.min(100, ((hEst - cumulative) / tHours) * 100))
              };
              break;
            }
            cumulative += tHours;
          }
          if (!currentTheme && p.temas.length > 0 && hEst >= totalHours && totalHours > 0) {
            currentTheme = { nombre: p.temas[p.temas.length - 1].nombre, progress: 100 };
          }

          // 3. Find Real Current Theme
          const startedThemes = p.temas.filter(t => t.fechaInicio);
          if (startedThemes.length > 0) {
            const lastStarted = startedThemes[startedThemes.length - 1];
            if (lastStarted.fechaFin) {
              realCurrentTheme = { nombre: lastStarted.nombre, progress: 100, status: 'Completado' };
            } else {
              const hRealTema = calcularHorasReales(lastStarted.fechaInicio, today, h, duracionSesion);
              const est = Number(lastStarted.horasEstimadas) || 1;
              realCurrentTheme = { 
                nombre: lastStarted.nombre, 
                progress: Math.min(100, (hRealTema / est) * 100),
                status: 'En curso'
              };
            }
          }
        }

        return { 
          ...a,
          id: a.id,
          assignmentLabel: a.label || 'N/A', 
          cursoAcademicoLabel: a.cursoAcademicoLabel || 'N/A', 
          asignaturaSigla: a.asignaturaSigla || 'N/A', 
          asignaturaNombre: a.asignaturaNombre || 'Sin nombre', 
          grupoNombre: a.grupoNombre || 'Sin grupo',
          hEst,
          hReal,
          totalHours,
          totalDev,
          currentTheme,
          realCurrentTheme,
          lastUpdate,
          progRef: p,
          hasProgramming: !!p,
          temas: p?.temas || []
        };
      } catch (e) {
        console.error("Error processing row for assignment:", a.id, e);
        return { 
          ...a,
          id: a.id, 
          asignaturaNombre: a.asignaturaNombre || 'Error', 
          hasProgramming: false,
          hEst: 0, hReal: 0, totalHours: 0 
        };
      }
    });
  }, [assignments, programaciones, horarios, academicYears]);

  const handleEdit = (row) => {
    setEditingRow(row);
    setTempTemas(row.progRef?.temas ? [...row.progRef.temas] : []);
    setIsEditModalOpen(true);
  };

  const handleAddTheme = () => {
    const nextId = tempTemas.length + 1;
    setTempTemas([...tempTemas, { id: nextId.toString(), nombre: '', horasEstimadas: 1 }]);
  };

  const handleRemoveTheme = (index) => {
    setTempTemas(tempTemas.filter((_, i) => i !== index));
  };

  const handleMoveTheme = (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === tempTemas.length - 1) return;
    
    const newTemas = [...tempTemas];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newTemas[index], newTemas[targetIndex]] = [newTemas[targetIndex], newTemas[index]];
    setTempTemas(newTemas);
  };

  const handleThemeChange = (index, field, value) => {
    const newTemas = [...tempTemas];
    newTemas[index] = { ...newTemas[index], [field]: value };
    setTempTemas(newTemas);
  };

  const handleSaveProgramming = async () => {
    if (!editingRow) return;
    setIsProcessing(true);
    try {
      const progRef = doc(db, 'profesor_programaciones', editingRow.id);
      await setDoc(progRef, {
        imparticionId: editingRow.id,
        iesId: activeIesId,
        usuarioId: uid,
        temas: tempTemas,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setMessageModal({ isOpen: true, title: 'Éxito', message: 'Programación guardada correctamente.' });
      setIsEditModalOpen(false);
      fetchData(uid, activeIesId);
    } catch (error) {
      console.error("Error saving programming:", error);
      setMessageModal({ isOpen: true, title: 'Error', message: 'No se pudo guardar la programación.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredDisplayRows = useMemo(() => {
    return displayRows.filter(row => {
      if (selectedYear !== 'all' && row.cursoAcademicoLabel !== selectedYear) return false;
      return true;
    });
  }, [displayRows, selectedYear]);

  const uniqueYears = [...new Set(assignments.map(a => a.cursoAcademicoLabel).filter(Boolean))].sort().reverse();

  if (loading) return <div style={styles.loading}>Cargando programaciones...</div>;

  return (
    <div className="animate-fade-in" style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.titleSection}>
            <div>
              <h1 style={styles.title}>Mis Programaciones</h1>
              <p style={styles.subtitle}>Gestión de contenidos y seguimiento temporal</p>
            </div>
          </div>
          
          <div style={styles.filterBar}>
             <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Filtrar por Año</label>
                <select 
                  style={styles.filterSelect}
                  value={selectedYear}
                  onChange={e => setSelectedYear(e.target.value)}
                >
                  <option value="all">Todos los años</option>
                  {uniqueYears.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
             </div>
          </div>
        </div>
      </header>

      <div className="glass-panel" style={{ 
        overflowX: 'auto', 
        overflowY: 'auto', 
        borderRadius: '16px',
        maxHeight: 'calc(100vh - 16rem)',
        position: 'relative'
      }}>
        <table style={styles.table}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-color)' }}>
            <tr>
              <th style={{...styles.th, background: 'rgba(255,255,255,0.03)'}}>Asignatura</th>
              <th style={{...styles.th, background: 'rgba(255,255,255,0.03)'}}>Progreso: Teórico vs Real</th>
              <th style={{...styles.th, textAlign: 'center', background: 'rgba(255,255,255,0.03)'}}>Desviación Total</th>
              <th style={{...styles.th, textAlign: 'center', background: 'rgba(255,255,255,0.03)'}}>Última Act.</th>
              <th style={{...styles.th, textAlign: 'right', background: 'rgba(255,255,255,0.03)'}}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredDisplayRows.length === 0 ? (
              <tr>
                <td colSpan="5" style={styles.emptyState}>No se han encontrado imparticiones para los filtros seleccionados.</td>
              </tr>
            ) : (
              filteredDisplayRows.map((row) => {
                const progressReal = row.totalHours > 0 ? (row.hReal / row.totalHours) * 100 : 0;
                const progressEst = row.totalHours > 0 ? (row.hEst / row.totalHours) * 100 : 0;
                
                return (
                  <tr key={row.id} style={styles.tr}>
                    <td style={styles.td}>
                      <div 
                        style={styles.subjectCell} 
                        title={`${row.asignaturaNombre} | Grupo: ${row.grupoNombre} | Curso: ${row.cursoAcademicoLabel}`}
                      >
                        <div style={styles.subjectIcon}>
                          <span style={styles.siglaBadge}>{row.asignaturaSigla}</span>
                        </div>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '2rem', minWidth: '400px' }}>
                        {/* Progress Theoretical */}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Teórico</div>
                          {row.currentTheme ? (
                            <>
                              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }} title={row.currentTheme.nombre}>
                                {row.currentTheme.nombre}
                              </div>
                              <div style={{...styles.progressBarBg, height: '6px', marginTop: '4px', width: '120px'}}>
                                <div style={{...styles.progressBarFill, width: `${row.currentTheme.progress}%`}} />
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>{Math.round(row.currentTheme.progress)}% completado</div>
                            </>
                          ) : (
                            <span style={{ color: '#475569', fontSize: '0.8rem' }}>No iniciado</span>
                          )}
                        </div>

                        {/* Progress Real */}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Real</div>
                          {row.realCurrentTheme ? (
                            <>
                              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }} title={row.realCurrentTheme.nombre}>
                                {row.realCurrentTheme.nombre}
                              </div>
                              <div style={{...styles.progressBarBg, height: '6px', marginTop: '4px', width: '120px'}}>
                                <div style={{...styles.progressBarFill, background: '#10b981', width: `${row.realCurrentTheme.progress}%`}} />
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>{row.realCurrentTheme.status} ({Math.round(row.realCurrentTheme.progress)}%)</div>
                            </>
                          ) : (
                            <span style={{ color: '#475569', fontSize: '0.8rem' }}>Sin seguimiento</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{...styles.td, textAlign: 'center'}}>
                      <div style={{ 
                        fontSize: '1.1rem', 
                        fontWeight: '800', 
                        color: row.totalDev < 0 ? '#10b981' : (row.totalDev > 0 ? '#ef4444' : '#94a3b8')
                      }}>
                        {row.totalDev > 0 ? `+${row.totalDev}` : row.totalDev}h
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        {row.hReal}h reales / {row.totalHours}h totales
                      </div>
                    </td>
                    <td style={{...styles.td, textAlign: 'center'}}>
                      <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                        {row.lastUpdate ? row.lastUpdate.toLocaleDateString() : '-'}
                      </div>
                    </td>
                    <td style={{...styles.td, textAlign: 'right', whiteSpace: 'nowrap'}}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button 
                          className="btn-icon" 
                          style={{ color: '#6366f1', background: 'rgba(99, 102, 241, 0.1)' }}
                          onClick={() => handleEdit(row)}
                          title="Editar Temas"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          className="btn-icon" 
                          style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}
                          onClick={() => navigate(`/profesor/programaciones/${row.id}/seguimiento`)}
                          disabled={!row.hasProgramming}
                          title={row.hasProgramming ? "Seguimiento de Programación" : "Define los temas primero"}
                        >
                          <Activity size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isEditModalOpen && (
        <Modal 
          isOpen={isEditModalOpen} 
          onClose={() => setIsEditModalOpen(false)}
          title={`Editar Programación: ${editingRow?.asignaturaSigla} - ${editingRow?.grupoNombre}`}
          width="800px"
          footer={
            <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setIsEditModalOpen(false)}>Cancelar</button>
              <button type="button" className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={handleSaveProgramming} disabled={isProcessing}>
                <Save size={18} /> {isProcessing ? 'Guardando...' : 'Guardar Programación'}
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#94a3b8' }}>Listado de Temas</h3>
              <button className="btn-primary" onClick={handleAddTheme} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '8px' }}>
                <Plus size={14} style={{ marginRight: '4px' }} /> Añadir Tema
              </button>
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{...styles.th, padding: '0.5rem'}}>ID</th>
                    <th style={{...styles.th, padding: '0.5rem'}}>Nombre del Tema</th>
                    <th style={{...styles.th, padding: '0.5rem', textAlign: 'center'}}>Horas</th>
                    <th style={{...styles.th, padding: '0.5rem', textAlign: 'right'}}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tempTemas.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{...styles.emptyState, padding: '2rem'}}>No hay temas definidos. Añade el primero.</td>
                    </tr>
                  ) : (
                    tempTemas.map((tema, index) => (
                      <tr key={index} style={styles.tr}>
                        <td style={{...styles.td, padding: '0.5rem'}}>
                          <input 
                            type="text" 
                            className="input-field" 
                            style={{ padding: '0.4rem', fontSize: '0.85rem', width: '40px', textAlign: 'center' }}
                            value={tema.id}
                            onChange={(e) => handleThemeChange(index, 'id', e.target.value)}
                          />
                        </td>
                        <td style={{...styles.td, padding: '0.5rem'}}>
                          <input 
                            type="text" 
                            className="input-field" 
                            style={{ padding: '0.4rem', fontSize: '0.85rem' }}
                            placeholder="Ej: Introducción a la materia"
                            value={tema.nombre}
                            onChange={(e) => handleThemeChange(index, 'nombre', e.target.value)}
                          />
                        </td>
                        <td style={{...styles.td, padding: '0.5rem', textAlign: 'center'}}>
                          <input 
                            type="number" 
                            className="input-field" 
                            style={{ padding: '0.4rem', fontSize: '0.85rem', width: '60px', textAlign: 'center' }}
                            value={tema.horasEstimadas}
                            min="1"
                            onChange={(e) => handleThemeChange(index, 'horasEstimadas', Number(e.target.value))}
                          />
                        </td>
                        <td style={{...styles.td, padding: '0.5rem', textAlign: 'right'}}>
                          <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                            <button className="btn-icon" style={{ padding: '0.3rem' }} onClick={() => handleMoveTheme(index, 'up')} disabled={index === 0}>
                              <MoveUp size={14} />
                            </button>
                            <button className="btn-icon" style={{ padding: '0.3rem' }} onClick={() => handleMoveTheme(index, 'down')} disabled={index === tempTemas.length - 1}>
                              <MoveDown size={14} />
                            </button>
                            <button className="btn-icon" style={{ padding: '0.3rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }} onClick={() => handleRemoveTheme(index)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', margin: 0 }}>
              * Los temas se guardarán en el orden que aparecen en la tabla.
            </p>
          </div>
        </Modal>
      )}

      {messageModal.isOpen && (
        <Modal isOpen={messageModal.isOpen} onClose={() => setMessageModal({ ...messageModal, isOpen: false })} title={messageModal.title}>
          <p>{messageModal.message}</p>
        </Modal>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' },
  header: { marginBottom: '1.5rem' },
  headerContent: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  titleSection: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '1.5rem', fontWeight: '800', margin: 0, background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle: { color: '#94a3b8', fontSize: '0.95rem', marginTop: '0.25rem' },
  actionBtn: { padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', borderRadius: '10px' },
  filterBar: { background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' },
  filterGroup: { display: 'flex', alignItems: 'center', gap: '1rem' },
  filterLabel: { fontSize: '0.85rem', color: '#94a3b8', fontWeight: '600' },
  filterSelect: { background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0.35rem', borderRadius: '8px', outline: 'none', fontSize: '0.85rem' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' },
  th: { padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tr: { borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' },
  td: { padding: '1rem 0.75rem' },
  subjectCell: { display: 'flex', gap: '0.75rem', alignItems: 'center' },
  subjectIcon: { minWidth: '48px', height: '32px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a5b4fc', padding: '0 8px' },
  siglaBadge: { fontWeight: '800', fontSize: '0.85rem', color: '#a5b4fc', letterSpacing: '0.05em' },
  hoursComparison: { display: 'flex', gap: '0.3rem', justifyContent: 'center', alignItems: 'center', fontWeight: '700' },
  hourEst: { color: '#94a3b8' },
  hourReal: { color: '#10b981' },
  hourSeparator: { color: '#475569' },
  progressWrapper: { width: '100%', maxWidth: '160px', margin: '0 auto' },
  progressBarBg: { height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', position: 'relative', overflow: 'hidden', marginBottom: '4px' },
  progressBarFill: { height: '100%', background: 'linear-gradient(90deg, #3b82f6, #2563eb)', borderRadius: '10px' },
  progressBarTarget: { position: 'absolute', top: 0, bottom: 0, width: '2px', background: 'rgba(255,255,255,0.4)', zIndex: 1 },
  progressLabels: { display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '700', color: '#64748b' },
  loading: { padding: '4rem', textAlign: 'center', color: '#94a3b8' }
};
