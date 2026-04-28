import { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
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

export default function Holidays() {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, holiday: null });
  
  const activeIesId = localStorage.getItem('activeIesId');

  useEffect(() => {
    fetchHolidays();
  }, [activeIesId]);

  const fetchHolidays = async () => {
    if (!activeIesId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'festivos'),
        where('iesId', '==', activeIesId),
        orderBy('startDate', 'asc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHolidays(data);
    } catch (error) {
      console.error("Error fetching holidays:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartDateChange = (val) => {
    setStartDate(val);
    setEndDate(val); // Sincronizar fecha fin con fecha inicio por defecto
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!activeIesId) return;

    const payload = {
      nombre: name,
      startDate,
      endDate: endDate === startDate ? null : endDate,
      iesId: activeIesId,
      updatedAt: serverTimestamp()
    };

    try {
      if (isEditing) {
        await updateDoc(doc(db, 'festivos', editingId), payload);
        setModal({
          isOpen: true,
          title: 'Festivo Actualizado',
          message: `Se ha actualizado correctamente el festivo "${name}".`
        });
      } else {
        await addDoc(collection(db, 'festivos'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        setModal({
          isOpen: true,
          title: 'Festivo Creado',
          message: `Se ha registrado correctamente el festivo "${name}".`
        });
      }
      fetchHolidays();
      setIsFormOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving holiday:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudo guardar el festivo.' });
    }
  };

  const resetForm = () => {
    setName('');
    setStartDate('');
    setEndDate('');
    setIsEditing(false);
    setEditingId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditModal = (holiday) => {
    setIsEditing(true);
    setEditingId(holiday.id);
    setName(holiday.nombre || '');
    setStartDate(holiday.startDate || '');
    setEndDate(holiday.endDate || '');
    setIsFormOpen(true);
  };

  const requestDelete = (holiday) => {
    setConfirmDelete({ isOpen: true, holiday });
  };

  const executeDelete = async () => {
    const holiday = confirmDelete.holiday;
    if (!holiday) return;

    try {
      await deleteDoc(doc(db, 'festivos', holiday.id));
      setHolidays(holidays.filter(h => h.id !== holiday.id));
      setConfirmDelete({ isOpen: false, holiday: null });
      
      setModal({
        isOpen: true,
        title: 'Festivo Eliminado',
        message: `El festivo "${holiday.nombre}" ha sido eliminado.`
      });
    } catch (error) {
      console.error("Error deleting holiday:", error);
      setConfirmDelete({ isOpen: false, holiday: null });
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Hubo un problema al eliminar el festivo.'
      });
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>Días Festivos</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Gestión de días no lectivos y periodos vacacionales del centro.</p>
        </div>
        <button className="btn-primary" onClick={openCreateModal}>
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Nuevo Festivo
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Listado de Festivos</h2>
        </div>
        
        <div className="scrollable" style={{ maxHeight: '60vh' }}>
          {loading ? (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
              <div className="spinner-small" style={{ margin: '0 auto 1rem' }}></div>
              <p>Cargando festivos...</p>
            </div>
          ) : holidays.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem', opacity: 0.5 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              <p>No hay días festivos registrados.</p>
              <button className="btn-secondary" onClick={openCreateModal} style={{ marginTop: '1rem', display: 'inline-flex' }}>Configurar primer festivo</button>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Fecha Inicio</th>
                  <th>Fecha Fin</th>
                  <th>Duración</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map(holiday => {
                  const start = new Date(holiday.startDate);
                  const end = holiday.endDate ? new Date(holiday.endDate) : start;
                  const diffTime = Math.abs(end - start);
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                  
                  return (
                    <tr key={holiday.id}>
                      <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{holiday.nombre}</td>
                      <td>{start.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td>{holiday.endDate ? end.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                      <td>
                        <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', border: 'none' }}>
                          {diffDays} {diffDays === 1 ? 'día' : 'días'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button onClick={() => openEditModal(holiday)} className="btn-icon" title="Editar">
                            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                          </button>
                          <button onClick={() => requestDelete(holiday)} className="btn-icon btn-danger" title="Eliminar">
                            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
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
        title={isEditing ? "Editar Festivo" : "Nuevo Festivo"}
      >
        <form onSubmit={handleSave} style={styles.form}>
          <div className="form-group">
            <label className="form-label">Nombre del festivo</label>
            <input 
              type="text" 
              className="input-field"
              placeholder="Ej: Día del Pilar, Navidad..."
              value={name}
              onChange={e => setName(e.target.value)}
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
                   Intervalo seleccionado: <b>{new Date(startDate).toLocaleDateString()}</b>
                   {endDate && endDate !== startDate && <> al <b>{new Date(endDate).toLocaleDateString()}</b></>}
                 </>
               ) : 'Selecciona las fechas para el festivo'}
             </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn-secondary" onClick={() => setIsFormOpen(false)} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }}>
              {isEditing ? 'Guardar Cambios' : 'Crear Festivo'}
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
        onClose={() => setConfirmDelete({ isOpen: false, holiday: null })}
        title="Confirmar Eliminación"
      >
        <p>¿Estás seguro de que quieres eliminar el festivo <b>{confirmDelete.holiday?.nombre}</b>?</p>
        <p style={{ marginTop: '0.5rem', color: '#ef4444', fontSize: '0.9rem' }}>Esta acción no se puede deshacer.</p>
        
        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
          <button 
            className="btn-secondary" 
            onClick={() => setConfirmDelete({ isOpen: false, holiday: null })}
          >
            Cancelar
          </button>
          <button 
            className="btn-primary" 
            style={{ background: '#ef4444' }}
            onClick={executeDelete}
          >
            Eliminar Definitivamente
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
