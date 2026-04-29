import { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../../config/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc,
  deleteDoc, 
  doc, 
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import Modal from '../../components/common/Modal';

export default function Absences() {
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [motivo, setMotivo] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, absence: null });
  
  const user = auth.currentUser;

  const fetchAbsences = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Intentar cargar de la colección nueva
      let q = query(
        collection(db, 'profesor_ausencias'),
        where('userId', '==', user.uid)
      );
      let snapshot = await getDocs(q);
      
      // 2. Si está vacía, intentar migrar de la antigua (solo la primera vez)
      if (snapshot.empty) {
        const oldQ = query(
          collection(db, 'ausencias'),
          where('userId', '==', user.uid)
        );
        const oldSnapshot = await getDocs(oldQ);
        
        if (!oldSnapshot.empty) {
          console.log("Migrando ausencias a profesor_ausencias...");
          for (const oldDoc of oldSnapshot.docs) {
            const data = oldDoc.data();
            // Crear en la nueva
            await addDoc(collection(db, 'profesor_ausencias'), data);
            // Borrar de la antigua
            await deleteDoc(doc(db, 'ausencias', oldDoc.id));
          }
          // Recargar snapshot de la nueva colección
          snapshot = await getDocs(q);
        }
      }

      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort client-side to avoid requiring a composite index in Firestore
      data.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
      setAbsences(data);
    } catch (error) {
      console.error("Error fetching absences:", error);
      setModal({ 
        isOpen: true, 
        title: 'Error', 
        message: "Error al cargar las ausencias. Verifique la conexión." 
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAbsences();
  }, [fetchAbsences]);

  const handleStartDateChange = (val) => {
    setStartDate(val);
    setEndDate(val);
  };

  const checkOverlap = (start, end, idToExclude = null) => {
    const s = new Date(start);
    const e = end ? new Date(end) : s;
    
    return absences.find(a => {
      if (idToExclude && a.id === idToExclude) return false;
      const aStart = new Date(a.startDate);
      const aEnd = a.endDate ? new Date(a.endDate) : aStart;
      return s <= aEnd && aStart <= e;
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      motivo,
      startDate,
      endDate: endDate === startDate ? null : endDate,
      userId: user.uid,
      updatedAt: serverTimestamp()
    };

    const overlap = checkOverlap(payload.startDate, payload.endDate, isEditing ? editingId : null);
    if (overlap) {
      setModal({
        isOpen: true,
        title: 'Conflicto de Fechas',
        message: `Ya tienes una ausencia registrada que se solapa con estas fechas ("${overlap.motivo}").`
      });
      return;
    }

    try {
      if (isEditing) {
        await updateDoc(doc(db, 'profesor_ausencias', editingId), payload);
        setModal({
          isOpen: true,
          title: 'Ausencia Actualizada',
          message: `Se ha actualizado correctamente tu ausencia.`
        });
      } else {
        await addDoc(collection(db, 'profesor_ausencias'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        setModal({
          isOpen: true,
          title: 'Ausencia Registrada',
          message: `Se ha registrado correctamente tu ausencia.`
        });
      }
      fetchAbsences();
      setIsFormOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving absence:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudo guardar la ausencia.' });
    }
  };

  const resetForm = () => {
    setMotivo('');
    setStartDate('');
    setEndDate('');
    setIsEditing(false);
    setEditingId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditModal = (absence) => {
    setIsEditing(true);
    setEditingId(absence.id);
    setMotivo(absence.motivo || '');
    setStartDate(absence.startDate || '');
    setEndDate(absence.endDate || absence.startDate || '');
    setIsFormOpen(true);
  };

  const requestDelete = (absence) => {
    setConfirmDelete({ isOpen: true, absence });
  };

  const executeDelete = async () => {
    const absence = confirmDelete.absence;
    if (!absence) return;

    try {
      await deleteDoc(doc(db, 'profesor_ausencias', absence.id));
      setAbsences(absences.filter(a => a.id !== absence.id));
      setConfirmDelete({ isOpen: false, absence: null });
      
      setModal({
        isOpen: true,
        title: 'Ausencia Eliminada',
        message: `La ausencia ha sido eliminada.`
      });
    } catch (error) {
      console.error("Error deleting absence:", error);
      setConfirmDelete({ isOpen: false, absence: null });
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Hubo un problema al eliminar la ausencia.'
      });
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>Mis Ausencias</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Registro personal de ausencias y bajas.</p>
        </div>
        <button className="btn-primary" onClick={openCreateModal}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Registrar Ausencia
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Listado de Ausencias</h2>
        </div>
        
        <div className="scrollable" style={{ maxHeight: '60vh' }}>
          {loading ? (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
              <div className="spinner-small" style={{ margin: '0 auto 1rem' }}></div>
              <p>Cargando ausencias...</p>
            </div>
          ) : absences.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem', opacity: 0.5 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              <p>No tienes ausencias registradas.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Motivo</th>
                  <th>Fecha Inicio</th>
                  <th>Fecha Fin</th>
                  <th>Duración</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {absences.map(absence => {
                  const start = new Date(absence.startDate);
                  const end = absence.endDate ? new Date(absence.endDate) : start;
                  const diffTime = Math.abs(end - start);
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                  
                  return (
                    <tr key={absence.id}>
                      <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{absence.motivo}</td>
                      <td>{start.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td>{absence.endDate ? end.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                      <td>
                        <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', border: 'none' }}>
                          {diffDays} {diffDays === 1 ? 'día' : 'días'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button 
                            onClick={() => openEditModal(absence)} 
                            className="btn-icon" 
                            title="Editar"
                            style={{ borderRadius: '8px' }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                          </button>
                          <button 
                            onClick={() => requestDelete(absence)} 
                            className="btn-icon btn-danger" 
                            title="Eliminar"
                            style={{ borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none' }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={isEditing ? "Editar Ausencia" : "Registrar Ausencia"}
      >
        <form onSubmit={handleSave} style={styles.form}>
          <div className="form-group">
            <label className="form-label">Motivo de la ausencia</label>
            <input 
              type="text" 
              className="input-field"
              placeholder="Ej: Enfermedad, Cita médica, Asuntos propios..."
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Fecha Inicio</label>
              <input 
                type="date" 
                className="input-field"
                value={startDate}
                onChange={e => handleStartDateChange(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Fecha Fin</label>
              <input 
                type="date" 
                className="input-field"
                value={endDate}
                min={startDate}
                onChange={e => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--accent-primary)' }}>
             <p style={{ fontSize: '0.9rem', color: 'var(--accent-primary)', textAlign: 'center' }}>
               {startDate ? (
                 <>
                   Periodo: <b>{new Date(startDate).toLocaleDateString()}</b>
                   {endDate && endDate !== startDate && <> al <b>{new Date(endDate).toLocaleDateString()}</b></>}
                 </>
               ) : 'Selecciona las fechas de tu ausencia'}
             </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn-secondary" onClick={() => setIsFormOpen(false)} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }}>
              {isEditing ? 'Guardar Cambios' : 'Registrar Ausencia'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Message Modal */}
      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
      >
        <p>{modal.message}</p>
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={() => setModal({ ...modal, isOpen: false })}>Aceptar</button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={confirmDelete.isOpen}
        onClose={() => setConfirmDelete({ isOpen: false, absence: null })}
        title="Confirmar Eliminación"
      >
        <p>¿Estás seguro de que quieres eliminar este registro de ausencia?</p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
          <button 
            className="btn-secondary" 
            onClick={() => setConfirmDelete({ isOpen: false, absence: null })}
          >
            Cancelar
          </button>
          <button 
            className="btn-primary" 
            style={{ background: '#ef4444' }}
            onClick={executeDelete}
          >
            Eliminar
          </button>
        </div>
      </Modal>
    </div>
  );
}

const styles = {
  form: {
    display: 'flex', flexDirection: 'column', gap: '0.5rem'
  }
};
