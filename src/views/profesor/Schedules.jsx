import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import Modal from '../../components/common/Modal';

export default function Schedules() {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [programaciones, setProgramaciones] = useState([]);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    imparticionId: '',
    lunes: 0,
    martes: 0,
    miercoles: 0,
    jueves: 0,
    viernes: 0
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });

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

      // Order by Academic Year (descending), then Subject Name
      assignmentsData.sort((a, b) => {
        if (a.cursoAcademicoLabel !== b.cursoAcademicoLabel) {
          return b.cursoAcademicoLabel.localeCompare(a.cursoAcademicoLabel);
        }
        return a.asignaturaNombre.localeCompare(b.asignaturaNombre);
      });
      setAssignments(assignmentsData);

      // 2. Fetch Schedules
      const qSchedules = query(
        collection(db, 'profesor_horarios'),
        where('iesId', '==', activeIesId),
        where('usuarioId', '==', uid)
      );
      const snapSchedules = await getDocs(qSchedules);
      setSchedules(snapSchedules.docs.map(d => ({ id: d.id, ...d.data() })));

      // 3. Fetch Programaciones (to check for started themes)
      const qProg = query(
        collection(db, 'profesor_programaciones'),
        where('iesId', '==', activeIesId),
        where('usuarioId', '==', uid)
      );
      const snapProg = await getDocs(qProg);
      setProgramaciones(snapProg.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (error) {
      console.error("Error fetching schedules data:", error);
    } finally {
      setLoading(false);
    }
  };

  const hasStartedThemes = (imparticionId) => {
    const prog = programaciones.find(p => p.imparticionId === imparticionId);
    if (!prog || !prog.temas) return false;
    return prog.temas.some(t => t.fechaInicio || t.fechaFin);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.imparticionId) {
      setModal({ isOpen: true, title: 'Error', message: 'Selecciona una impartición.' });
      return;
    }

    setIsProcessing(true);
    try {
      const scheduleRef = doc(db, 'profesor_horarios', formData.imparticionId);
      await setDoc(scheduleRef, {
        imparticionId: formData.imparticionId,
        iesId: activeIesId,
        usuarioId: uid,
        lunes: Number(formData.lunes),
        martes: Number(formData.martes),
        miercoles: Number(formData.miercoles),
        jueves: Number(formData.jueves),
        viernes: Number(formData.viernes),
        updatedAt: serverTimestamp()
      }, { merge: true });

      setModal({ isOpen: true, title: 'Éxito', message: 'Horario guardado correctamente.' });
      setIsFormOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error saving schedule:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudo guardar el horario.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const openNewScheduleForm = () => {
    setFormData({
      imparticionId: '',
      lunes: 0, martes: 0, miercoles: 0, jueves: 0, viernes: 0
    });
    setIsFormOpen(true);
  };

  const openEditScheduleForm = (schedule) => {
    setFormData({
      imparticionId: schedule.imparticionId,
      lunes: schedule.lunes,
      martes: schedule.martes,
      miercoles: schedule.miercoles,
      jueves: schedule.jueves,
      viernes: schedule.viernes
    });
    setIsFormOpen(true);
  };

  const unassignedAssignments = assignments.filter(a => !schedules.some(s => s.imparticionId === a.id));

  // Merge assignments with their schedules for display
  const displayRows = assignments.filter(a => schedules.some(s => s.imparticionId === a.id)).map(a => {
    const s = schedules.find(sch => sch.imparticionId === a.id);
    return { ...a, schedule: s };
  });

  if (loading) return <div style={styles.loading}>Cargando horarios...</div>;

  return (
    <div className="animate-fade-in" style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div>
            <h1 style={styles.title}>Mis Horarios</h1>
            <p style={styles.subtitle}>Carga lectiva semanal por asignatura</p>
          </div>
          <button className="btn-primary" onClick={openNewScheduleForm} style={styles.newButton}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Crear nuevo horario
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
              <th style={{...styles.th, textAlign: 'center'}}>L</th>
              <th style={{...styles.th, textAlign: 'center'}}>M</th>
              <th style={{...styles.th, textAlign: 'center'}}>X</th>
              <th style={{...styles.th, textAlign: 'center'}}>J</th>
              <th style={{...styles.th, textAlign: 'center'}}>V</th>
              <th style={{...styles.th, textAlign: 'center'}}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan="9" style={styles.emptyState}>No tienes horarios definidos.</td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const isLocked = hasStartedThemes(row.id);
                return (
                  <tr key={row.id} style={styles.tr}>
                    <td style={styles.td}><span style={styles.badge}>{row.cursoAcademicoLabel}</span></td>
                    <td style={styles.td}>{row.grupoNombre}</td>
                    <td style={styles.td}>
                      <div style={{ fontWeight: '600' }}>{row.asignaturaSigla}</div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{row.asignaturaNombre}</div>
                    </td>
                    <td style={{...styles.td, textAlign: 'center'}}>{row.schedule.lunes}</td>
                    <td style={{...styles.td, textAlign: 'center'}}>{row.schedule.martes}</td>
                    <td style={{...styles.td, textAlign: 'center'}}>{row.schedule.miercoles}</td>
                    <td style={{...styles.td, textAlign: 'center'}}>{row.schedule.jueves}</td>
                    <td style={{...styles.td, textAlign: 'center'}}>{row.schedule.viernes}</td>
                    <td style={{...styles.td, textAlign: 'center'}}>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', opacity: isLocked ? 0.5 : 1 }}
                        onClick={() => openEditScheduleForm(row.schedule)}
                        disabled={isLocked}
                        title={isLocked ? "No se puede editar: ya hay temas iniciados en el seguimiento." : "Editar horario"}
                      >
                        Editar
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
          title={formData.imparticionId && schedules.some(s => s.imparticionId === formData.imparticionId) ? "Editar Horario" : "Nuevo Horario"}
          footer={
            <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setIsFormOpen(false)}>Cancelar</button>
              <button type="submit" form="scheduleForm" className="btn-primary" style={{ flex: 1 }} disabled={isProcessing}>
                {isProcessing ? 'Guardando...' : 'Guardar Horario'}
              </button>
            </div>
          }
        >
          <form id="scheduleForm" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="form-group">
              <label>Impartición</label>
              {/* If editing, select is disabled and shows the current assignment name. If new, it's an active select */}
              {schedules.some(s => s.imparticionId === formData.imparticionId) ? (
                <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {assignments.find(a => a.id === formData.imparticionId)?.label}
                </div>
              ) : (
                <select 
                  className="input-field" 
                  value={formData.imparticionId} 
                  onChange={e => setFormData({...formData, imparticionId: e.target.value})}
                  required
                >
                  <option value="">Selecciona una impartición sin horario...</option>
                  {unassignedAssignments.map(a => (
                    <option key={a.id} value={a.id}>{a.label} ({a.asignaturaNombre})</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem' }}>
              {['lunes', 'martes', 'miercoles', 'jueves', 'viernes'].map((day, idx) => (
                <div key={day} className="form-group" style={{ textAlign: 'center' }}>
                  <label style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>{day.charAt(0).toUpperCase()}</label>
                  <select 
                    className="input-field" 
                    style={{ textAlign: 'center', padding: '0.5rem' }}
                    value={formData[day]} 
                    onChange={e => setFormData({...formData, [day]: e.target.value})}
                  >
                    {[0,1,2,3,4,5,6,7,8].map(num => <option key={num} value={num}>{num}</option>)}
                  </select>
                </div>
              ))}
            </div>
            
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #3b82f6', fontSize: '0.85rem' }}>
              <strong>Nota:</strong> Se asume que cada sesión tiene una duración de 55 minutos.
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
