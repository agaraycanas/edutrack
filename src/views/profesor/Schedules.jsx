import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import Modal from '../../components/common/Modal';

export default function Schedules() {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [programaciones, setProgramaciones] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [formData, setFormData] = useState({
    imparticionId: '',
    validoDesde: '',
    lunes: 0,
    martes: 0,
    miercoles: 0,
    jueves: 0,
    viernes: 0
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    warning: null,
    isSuccessHint: false,
    onConfirm: null
  });

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

      // Order by Academic Year (descending), then Subject Name, then Group
      assignmentsData.sort((a, b) => {
        if (a.cursoAcademicoLabel !== b.cursoAcademicoLabel) {
          return (b.cursoAcademicoLabel || '').localeCompare(a.cursoAcademicoLabel || '');
        }
        const subjCompare = (a.asignaturaNombre || '').localeCompare(b.asignaturaNombre || '');
        if (subjCompare !== 0) return subjCompare;
        return (a.grupoNombre || '').localeCompare(b.grupoNombre || '');
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

      // 4. Fetch Academic Years
      const qYears = query(
        collection(db, 'cursos_academicos'),
        where('iesId', '==', activeIesId)
      );
      const snapYears = await getDocs(qYears);
      const yearsData = snapYears.docs.map(d => ({ id: d.id, ...d.data() }));
      yearsData.sort((a, b) => (b.añoInicio || 0) - (a.añoInicio || 0));
      setAcademicYears(yearsData);

      // Determine current academic year
      const now = new Date();
      const currentYearStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      const currentYearDoc = yearsData.find(y => y.añoInicio === currentYearStart) || yearsData[0];
      if (currentYearDoc) {
        setSelectedYear(prev => (!prev || prev === 'all' ? currentYearDoc.nombre : prev));
      }

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

  const formatDateEs = (dStr) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dStr;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.imparticionId) {
      setModal({ isOpen: true, title: 'Error', message: 'Selecciona una impartición.' });
      return;
    }

    if (!formData.validoDesde) {
      setModal({ isOpen: true, title: 'Error', message: 'Indica la fecha a partir de la cual entra en vigor el horario.' });
      return;
    }

    // Caso A: Alta de horario nuevo (sin horario previo registrado)
    if (!editingSchedule) {
      await saveSchedule({ isNewVersion: false });
      return;
    }

    const a = assignments.find(item => item.id === formData.imparticionId);
    const aYear = academicYears.find(y => y.nombre === a?.cursoAcademicoLabel);
    const originalValidoDesde = editingSchedule.validoDesde || aYear?.fechaInicioClases || '';

    // Caso B: Misma fecha de vigencia -> Corrección sobre el tramo actual
    if (!originalValidoDesde || formData.validoDesde === originalValidoDesde) {
      const hasThemes = hasStartedThemes(formData.imparticionId);
      setConfirmModal({
        isOpen: true,
        title: 'Guardar cambios en el horario',
        message: `Se van a guardar los cambios en el patrón horario vigente desde el ${formatDateEs(formData.validoDesde)}.`,
        warning: hasThemes 
          ? 'Atención: Al mantener la misma fecha de vigencia, si ya hay temas iniciados o finalizados se recalcularán sus horas reales con estos nuevos valores.' 
          : null,
        isSuccessHint: false,
        onConfirm: () => saveSchedule({ isNewVersion: false })
      });
      return;
    }

    // Caso C: Fecha de vigencia posterior -> Nuevo tramo / cambio de horario a mitad de curso
    if (formData.validoDesde > originalValidoDesde) {
      const [y, m, d] = formData.validoDesde.split('-').map(Number);
      const dNueva = new Date(y, m - 1, d, 12, 0, 0);
      dNueva.setDate(dNueva.getDate() - 1);
      const diaAnterior = `${dNueva.getFullYear()}-${String(dNueva.getMonth() + 1).padStart(2, '0')}-${String(dNueva.getDate()).padStart(2, '0')}`;

      setConfirmModal({
        isOpen: true,
        title: 'Nuevo tramo horario',
        message: `A partir del ${formatDateEs(formData.validoDesde)} se aplicará el nuevo patrón horario, sustituyendo al actual (vigente del ${formatDateEs(originalValidoDesde)} al ${formatDateEs(diaAnterior)}).`,
        warning: 'Las clases y temas impartidos antes de esa fecha mantendrán su cómputo histórico intacto con el horario anterior.',
        isSuccessHint: true,
        onConfirm: () => saveSchedule({ 
          isNewVersion: true, 
          diaAnterior, 
          originalValidoDesde 
        })
      });
      return;
    }

    // Caso D: Fecha anterior a la fecha inicial previa
    setConfirmModal({
      isOpen: true,
      title: 'Modificar fecha de vigencia',
      message: `La fecha seleccionada (${formatDateEs(formData.validoDesde)}) es anterior a la fecha previa (${formatDateEs(originalValidoDesde)}). Se actualizará el horario con esta nueva fecha.`,
      warning: 'Esto afectará a los cálculos previos.',
      isSuccessHint: false,
      onConfirm: () => saveSchedule({ isNewVersion: false })
    });
  };

  const saveSchedule = async ({ isNewVersion = false, diaAnterior = '', originalValidoDesde = '' }) => {
    setConfirmModal({ isOpen: false, title: '', message: '', warning: null, isSuccessHint: false, onConfirm: null });
    setIsProcessing(true);
    try {
      const scheduleRef = doc(db, 'profesor_horarios', formData.imparticionId);

      const updateData = {
        imparticionId: formData.imparticionId,
        iesId: activeIesId,
        usuarioId: uid,
        validoDesde: formData.validoDesde,
        lunes: Number(formData.lunes),
        martes: Number(formData.martes),
        miercoles: Number(formData.miercoles),
        jueves: Number(formData.jueves),
        viernes: Number(formData.viernes),
        updatedAt: serverTimestamp()
      };

      if (isNewVersion && editingSchedule) {
        const existingHistorico = Array.isArray(editingSchedule.historico) ? [...editingSchedule.historico] : [];
        const previousTramo = {
          validoDesde: originalValidoDesde,
          validoHasta: diaAnterior,
          lunes: Number(editingSchedule.lunes || 0),
          martes: Number(editingSchedule.martes || 0),
          miercoles: Number(editingSchedule.miercoles || 0),
          jueves: Number(editingSchedule.jueves || 0),
          viernes: Number(editingSchedule.viernes || 0)
        };
        updateData.historico = [...existingHistorico, previousTramo];
      }

      await setDoc(scheduleRef, updateData, { merge: true });

      setModal({ isOpen: true, title: 'Éxito', message: 'Horario guardado correctamente.' });
      setIsFormOpen(false);
      setEditingSchedule(null);
      fetchData();
    } catch (error) {
      console.error("Error saving schedule:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudo guardar el horario.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const openNewScheduleForm = () => {
    const currentYearStart = (new Date()).getMonth() >= 8 ? (new Date()).getFullYear() : (new Date()).getFullYear() - 1;
    const currentYearDoc = academicYears.find(y => y.añoInicio === currentYearStart) || academicYears[0];
    const defaultDate = currentYearDoc?.fechaInicioClases || new Date().toISOString().split('T')[0];

    setFormData({
      imparticionId: '',
      lunes: 0, martes: 0, miercoles: 0, jueves: 0, viernes: 0,
      validoDesde: defaultDate
    });
    setEditingSchedule(null);
    setIsFormOpen(true);
  };

  const openEditScheduleForm = (schedule) => {
    const a = assignments.find(item => item.id === schedule.imparticionId);
    const aYear = academicYears.find(y => y.nombre === a?.cursoAcademicoLabel);
    const defaultDate = schedule.validoDesde || aYear?.fechaInicioClases || new Date().toISOString().split('T')[0];

    setFormData({
      imparticionId: schedule.imparticionId,
      lunes: schedule.lunes,
      martes: schedule.martes,
      miercoles: schedule.miercoles,
      jueves: schedule.jueves,
      viernes: schedule.viernes,
      validoDesde: defaultDate
    });
    setEditingSchedule(schedule);
    setIsFormOpen(true);
  };

  const uniqueYears = [...new Set([
    ...academicYears.map(y => y.nombre).filter(Boolean),
    ...assignments.map(a => a.cursoAcademicoLabel).filter(Boolean)
  ])].sort().reverse();

  const filteredAssignments = assignments.filter(a => {
    if (selectedYear && selectedYear !== 'all' && a.cursoAcademicoLabel !== selectedYear) return false;
    return true;
  });

  const unassignedAssignments = filteredAssignments.filter(a => !schedules.some(s => s.imparticionId === a.id));

  // Merge assignments with their schedules for display
  const displayRows = filteredAssignments.filter(a => schedules.some(s => s.imparticionId === a.id)).map(a => {
    const s = schedules.find(sch => sch.imparticionId === a.id);
    return { ...a, schedule: s };
  });

  if (loading) return <div style={styles.loading}>Cargando horarios...</div>;

  return (
    <div className="animate-fade-in" style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.titleSection}>
            <div>
              <h1 style={styles.title}>Mis Horarios</h1>
              <p style={styles.subtitle}>Carga lectiva semanal por asignatura</p>
            </div>
            <button className="btn-primary" onClick={openNewScheduleForm} style={styles.newButton}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Crear nuevo horario
            </button>
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
              displayRows.map((row) => (
                <tr key={row.id} style={styles.tr}>
                    <td style={styles.td}><span style={styles.badge}>{row.cursoAcademicoLabel}</span></td>
                    <td style={styles.td}>{row.grupoNombre}</td>
                    <td style={styles.td}>
                      <div style={{ fontWeight: '600' }}>{row.asignaturaSigla}</div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{row.asignaturaNombre}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                        {row.schedule.validoDesde && (
                          <span style={{ fontSize: '0.72rem', color: '#a5b4fc', background: 'rgba(99, 102, 241, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            Desde {formatDateEs(row.schedule.validoDesde)}
                          </span>
                        )}
                        {row.schedule.historico && row.schedule.historico.length > 0 && (
                          <span 
                            style={{ fontSize: '0.72rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px', cursor: 'help' }}
                            title={row.schedule.historico.map((h, i) => `Tramo ${i + 1} (${formatDateEs(h.validoDesde)} - ${formatDateEs(h.validoHasta)}): L:${h.lunes} M:${h.martes} X:${h.miercoles} J:${h.jueves} V:${h.viernes}`).join('\n')}
                          >
                            {row.schedule.historico.length} {row.schedule.historico.length === 1 ? 'cambio previo' : 'cambios previos'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{...styles.td, textAlign: 'center'}}>{row.schedule.lunes}</td>
                    <td style={{...styles.td, textAlign: 'center'}}>{row.schedule.martes}</td>
                    <td style={{...styles.td, textAlign: 'center'}}>{row.schedule.miercoles}</td>
                    <td style={{...styles.td, textAlign: 'center'}}>{row.schedule.jueves}</td>
                    <td style={{...styles.td, textAlign: 'center'}}>{row.schedule.viernes}</td>
                    <td style={{...styles.td, textAlign: 'center'}}>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                        onClick={() => openEditScheduleForm(row.schedule)}
                        title="Editar horario"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
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
                  {(() => {
                    const a = assignments.find(item => item.id === formData.imparticionId);
                    if (!a) return formData.imparticionId;
                    return `${a.grupoNombre ? `[${a.grupoNombre}] ` : ''}${a.label} (${a.asignaturaNombre})`;
                  })()}
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
                    <option key={a.id} value={a.id}>
                      {a.grupoNombre ? `[${a.grupoNombre}] ` : ''}{a.label} ({a.asignaturaNombre})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Válido desde</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Fecha de entrada en vigor</span>
              </label>
              <input 
                type="date" 
                className="input-field" 
                value={formData.validoDesde || ''} 
                onChange={e => setFormData({...formData, validoDesde: e.target.value})}
                required 
              />
            </div>

            {editingSchedule && hasStartedThemes(formData.imparticionId) && (
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.85rem 1rem', borderRadius: '8px', borderLeft: '4px solid #3b82f6', fontSize: '0.83rem', color: '#93c5fd', lineHeight: '1.4' }}>
                💡 <strong>Cambio a mitad de curso:</strong> Si este cambio se aplica a partir de una fecha concreta (por ejemplo, el próximo lunes), introduce dicha fecha en <em>"Válido desde"</em> para mantener intacto el histórico de temas ya impartidos.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem' }}>
              {['lunes', 'martes', 'miercoles', 'jueves', 'viernes'].map(day => (
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

      {confirmModal.isOpen && (
        <Modal 
          isOpen={confirmModal.isOpen} 
          onClose={() => setConfirmModal({ ...confirmModal, isOpen: false, onConfirm: null })} 
          title={confirmModal.title}
          footer={
            <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ flex: 1 }} 
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false, onConfirm: null })}
                disabled={isProcessing}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                style={{ flex: 1 }} 
                onClick={confirmModal.onConfirm}
                disabled={isProcessing}
              >
                {isProcessing ? 'Guardando...' : 'Confirmar y Guardar'}
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, lineHeight: '1.5', color: '#e2e8f0' }}>{confirmModal.message}</p>
            {confirmModal.warning && (
              <div style={{ 
                background: confirmModal.isSuccessHint ? 'rgba(16, 185, 129, 0.1)' : 'rgba(234, 179, 8, 0.1)', 
                padding: '0.75rem', 
                borderRadius: '8px', 
                borderLeft: `4px solid ${confirmModal.isSuccessHint ? '#10b981' : '#eab008'}`, 
                fontSize: '0.85rem', 
                color: confirmModal.isSuccessHint ? '#6ee7b7' : '#fde047' 
              }}>
                {confirmModal.warning}
              </div>
            )}
          </div>
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
  container: { padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' },
  header: { marginBottom: '1.5rem' },
  headerContent: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  titleSection: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '1.5rem', fontWeight: '800', margin: 0, background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle: { color: '#94a3b8', fontSize: '0.95rem', marginTop: '0.25rem' },
  newButton: { padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', fontWeight: '600', borderRadius: '10px' },
  filterBar: { background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' },
  filterGroup: { display: 'flex', alignItems: 'center', gap: '1rem' },
  filterLabel: { fontSize: '0.85rem', color: '#94a3b8', fontWeight: '600' },
  filterSelect: { background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0.35rem 0.75rem', borderRadius: '8px', outline: 'none', fontSize: '0.85rem' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' },
  th: { padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: '600', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tr: { borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' },
  td: { padding: '0.85rem 1rem', verticalAlign: 'middle', color: '#e2e8f0' },
  badge: { padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace' },
  emptyState: { padding: '3rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' },
  loading: { padding: '4rem', textAlign: 'center', color: '#94a3b8' }
};
