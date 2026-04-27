import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import Modal from '../../components/common/Modal';

export default function Syllabuses() {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [programaciones, setProgramaciones] = useState([]);
  const navigate = useNavigate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });

  // Form State
  const [imparticionId, setImparticionId] = useState('');
  const [temas, setTemas] = useState([{ id: 1, nombre: '', horasEstimadas: '' }]);

  const activeIesId = localStorage.getItem('activeIesId');
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (activeIesId && uid) {
      fetchData();
    }
  }, [activeIesId, uid]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Teacher's Assignments
      const qAssignments = query(
        collection(db, 'ies_imparticiones'),
        where('iesId', '==', activeIesId),
        where('usuarioId', '==', uid)
      );
      const snapAssignments = await getDocs(qAssignments);
      let assignmentsData = snapAssignments.docs.map(d => ({ id: d.id, ...d.data() }));

      // Order
      assignmentsData.sort((a, b) => {
        if (a.cursoAcademicoLabel !== b.cursoAcademicoLabel) {
          return b.cursoAcademicoLabel.localeCompare(a.cursoAcademicoLabel);
        }
        return a.asignaturaNombre.localeCompare(b.asignaturaNombre);
      });
      setAssignments(assignmentsData);

      // 2. Fetch Programaciones
      const qProg = query(
        collection(db, 'profesor_programaciones'),
        where('iesId', '==', activeIesId),
        where('usuarioId', '==', uid)
      );
      const snapProg = await getDocs(qProg);
      setProgramaciones(snapProg.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching syllabuses data:", error);
    } finally {
      setLoading(false);
    }
  };

  const hasStartedThemes = (progId) => {
    const prog = programaciones.find(p => p.id === progId);
    if (!prog || !prog.temas) return false;
    return prog.temas.some(t => t.fechaInicio || t.fechaFin);
  };

  const openNewForm = () => {
    setImparticionId('');
    setTemas([{ id: 1, nombre: '', horasEstimadas: '' }]);
    setIsFormOpen(true);
  };

  const openEditForm = (prog) => {
    setImparticionId(prog.imparticionId);
    setTemas(prog.temas || []);
    setIsFormOpen(true);
  };

  const handleAddTema = () => {
    const nextId = temas.length > 0 ? Math.max(...temas.map(t => t.id)) + 1 : 1;
    setTemas([...temas, { id: nextId, nombre: '', horasEstimadas: '' }]);
  };

  const handleRemoveTema = (index) => {
    const newTemas = [...temas];
    newTemas.splice(index, 1);
    // Re-index
    const reindexed = newTemas.map((t, i) => ({ ...t, id: i + 1 }));
    setTemas(reindexed);
  };

  const handleTemaChange = (index, field, value) => {
    const newTemas = [...temas];
    if (field === 'horasEstimadas') {
      newTemas[index][field] = value === '' ? '' : parseInt(value, 10);
    } else {
      newTemas[index][field] = value;
    }
    setTemas(newTemas);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imparticionId) {
      setModal({ isOpen: true, title: 'Error', message: 'Selecciona una impartición.' });
      return;
    }
    if (temas.length === 0) {
      setModal({ isOpen: true, title: 'Error', message: 'Debes añadir al menos un tema.' });
      return;
    }
    for (let t of temas) {
      if (!t.nombre.trim()) {
        setModal({ isOpen: true, title: 'Error', message: 'Todos los temas deben tener un nombre.' });
        return;
      }
      if (t.horasEstimadas === '' || isNaN(t.horasEstimadas) || t.horasEstimadas < 1) {
        setModal({ isOpen: true, title: 'Error', message: `El tema ${t.id} no tiene un número de horas válido (mínimo 1).` });
        return;
      }
    }

    setIsProcessing(true);
    try {
      // Use imparticionId as the document ID for programaciones (1 to 1 relation)
      const progRef = doc(db, 'profesor_programaciones', imparticionId);
      await setDoc(progRef, {
        imparticionId: imparticionId,
        iesId: activeIesId,
        usuarioId: uid,
        temas: temas,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setModal({ isOpen: true, title: 'Éxito', message: 'Programación guardada correctamente.' });
      setIsFormOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error saving syllabus:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudo guardar la programación.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const unassignedAssignments = assignments.filter(a => !programaciones.some(p => p.imparticionId === a.id));

  const displayRows = programaciones.map(p => {
    const a = assignments.find(assign => assign.id === p.imparticionId) || {};
    return { ...p, assignmentLabel: a.label, cursoAcademicoLabel: a.cursoAcademicoLabel, asignaturaSigla: a.asignaturaSigla, asignaturaNombre: a.asignaturaNombre, grupoNombre: a.grupoNombre };
  }).filter(p => p.assignmentLabel); // Ensure we only show ones that belong to current assignments

  const horasTotales = temas.reduce((acc, t) => acc + (parseInt(t.horasEstimadas, 10) || 0), 0);

  if (loading) return <div style={styles.loading}>Cargando programaciones...</div>;

  return (
    <div className="animate-fade-in" style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div>
            <h1 style={styles.title}>Mis Programaciones</h1>
            <p style={styles.subtitle}>Gestión de temas y estimación de horas</p>
          </div>
          <button className="btn-primary" onClick={openNewForm} style={styles.newButton}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Nueva programación
          </button>
        </div>
      </header>

      <div className="glass-panel" style={{ overflowX: 'auto', borderRadius: '16px' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Año Académico</th>
              <th style={styles.th}>Grupo</th>
              <th style={styles.th}>Asignatura</th>
              <th style={styles.th}>Temas</th>
              <th style={styles.th}>Total Horas Estimadas</th>
              <th style={{...styles.th, textAlign: 'center'}}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan="6" style={styles.emptyState}>No tienes programaciones definidas.</td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const isLocked = hasStartedThemes(row.id);
                const totalHours = (row.temas || []).reduce((acc, t) => acc + (t.horasEstimadas || 0), 0);
                return (
                  <tr key={row.id} style={styles.tr}>
                    <td style={styles.td}><span style={styles.badge}>{row.cursoAcademicoLabel}</span></td>
                    <td style={styles.td}>{row.grupoNombre}</td>
                    <td style={styles.td}>
                      <div style={{ fontWeight: '600' }}>{row.asignaturaSigla}</div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{row.asignaturaNombre}</div>
                    </td>
                    <td style={styles.td}>{row.temas?.length || 0}</td>
                    <td style={styles.td}>{totalHours}h</td>
                    <td style={{...styles.td, textAlign: 'center', whiteSpace: 'nowrap'}}>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', marginRight: '0.5rem', opacity: isLocked ? 0.5 : 1 }}
                        onClick={() => openEditForm(row)}
                        disabled={isLocked}
                        title={isLocked ? "No se puede editar: ya hay temas iniciados en el seguimiento." : "Editar programación"}
                      >
                        Editar
                      </button>
                      <button 
                        className="btn-primary" 
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', background: '#10b981', color: 'white', border: 'none' }}
                        onClick={() => navigate(`/profesor/programaciones/${row.id}/seguimiento`)}
                        title="Ir al seguimiento"
                      >
                        Seguimiento
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isFormOpen && (
        <Modal 
          isOpen={isFormOpen} 
          onClose={() => setIsFormOpen(false)}
          title={imparticionId && programaciones.some(p => p.imparticionId === imparticionId) ? "Editar Programación" : "Nueva Programación"}
          maxWidth="800px"
          footer={
            <div style={{ display: 'flex', gap: '1rem', width: '100%', alignItems: 'center' }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setIsFormOpen(false)}>Cancelar</button>
              <button type="submit" form="progForm" className="btn-primary" style={{ flex: 1 }} disabled={isProcessing}>
                {isProcessing ? 'Guardando...' : 'Guardar Programación'}
              </button>
            </div>
          }
        >
          <form id="progForm" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Impartición</label>
              {programaciones.some(p => p.imparticionId === imparticionId) ? (
                <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {assignments.find(a => a.id === imparticionId)?.label}
                </div>
              ) : (
                <select 
                  className="input-field" 
                  value={imparticionId} 
                  onChange={e => setImparticionId(e.target.value)}
                  required
                >
                  <option value="">Selecciona una impartición...</option>
                  {unassignedAssignments.map(a => (
                    <option key={a.id} value={a.id}>{a.label} ({a.asignaturaNombre})</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', background: 'rgba(255,255,255,0.05)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>Temas</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                     <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Total Estimado:</span>
                     <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--active-role-color)' }}>{horasTotales}h</span>
                  </div>
                </div>
                <button type="button" onClick={handleAddTema} className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                  + Añadir Tema
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '55vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {temas.map((tema, index) => (
                  <div key={index} style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px' }}>
                    <div style={{ width: '40px', textAlign: 'center', fontWeight: 'bold', color: '#94a3b8' }}>
                      {tema.id}
                    </div>
                    <div style={{ flex: 1 }}>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="Nombre del tema" 
                        value={tema.nombre}
                        onChange={e => handleTemaChange(index, 'nombre', e.target.value)}
                        required
                      />
                    </div>
                    <div style={{ width: '100px' }}>
                      <input 
                        type="number" 
                        className="input-field" 
                        min="1"
                        step="1"
                        value={tema.horasEstimadas === '' ? '' : tema.horasEstimadas}
                        onChange={e => handleTemaChange(index, 'horasEstimadas', e.target.value)}
                        required
                        placeholder="h"
                      />
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveTema(index)} 
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.5rem' }}
                      title="Eliminar tema"
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                ))}
                {temas.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem', fontStyle: 'italic' }}>
                    Añade el primer tema de tu programación.
                  </div>
                )}
              </div>
            </div>
            
          </form>
        </Modal>
      )}

      {modal.isOpen && (
        <Modal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} title={modal.title}>
          <p>{modal.message}</p>
        </Modal>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '2rem', maxWidth: '1200px', margin: '0 auto' },
  header: { marginBottom: '2.5rem' },
  headerContent: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '2rem', fontWeight: '800', marginBottom: '0.5rem', background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle: { color: '#94a3b8', fontSize: '1.1rem' },
  newButton: { padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', fontWeight: '600', borderRadius: '12px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tr: { borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' },
  td: { padding: '1rem', verticalAlign: 'middle', color: '#e2e8f0' },
  badge: { padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace' },
  emptyState: { padding: '3rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' },
  loading: { padding: '4rem', textAlign: 'center', color: '#94a3b8', fontSize: '1.2rem' }
};
