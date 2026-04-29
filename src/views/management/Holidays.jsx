import { useState, useEffect, useCallback } from 'react';
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
  
  // AI Import States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState('location'); // 'location', 'searching', 'proposal'
  const [comunidad, setComunidad] = useState('Madrid');
  const [localidad, setLocalidad] = useState('');
  const [proposedHolidays, setProposedHolidays] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProposed, setSelectedProposed] = useState([]);
  
  const activeIesId = localStorage.getItem('activeIesId');

  const fetchHolidays = useCallback(async () => {
    if (!activeIesId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'festivos'),
        where('iesId', '==', activeIesId),
        orderBy('startDate', 'desc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHolidays(data);
    } catch (error) {
      console.error("Error fetching holidays:", error);
      setModal({ 
        isOpen: true, 
        title: 'Error', 
        message: "Error al cargar los festivos. Verifique la conexión o los índices de Firestore." 
      });
    } finally {
      setLoading(false);
    }
  }, [activeIesId]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const handleStartDateChange = (val) => {
    setStartDate(val);
    setEndDate(val); // Sincronizar fecha fin con fecha inicio por defecto
  };

  const checkOverlap = (start, end, idToExclude = null) => {
    const s = new Date(start);
    const e = end ? new Date(end) : s;
    
    return holidays.find(h => {
      if (idToExclude && h.id === idToExclude) return false;
      const hStart = new Date(h.startDate);
      const hEnd = h.endDate ? new Date(h.endDate) : hStart;
      return s <= hEnd && hStart <= e;
    });
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

    const overlap = checkOverlap(payload.startDate, payload.endDate, isEditing ? editingId : null);
    if (overlap) {
      setModal({
        isOpen: true,
        title: 'Conflicto de Fechas',
        message: `Festivo ya presente en el sistema o solapado con "${overlap.nombre}".`
      });
      return;
    }

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
  const handleAIImport = () => {
    setImportStep('location');
    setIsImportModalOpen(true);
  };

  const startSearch = async () => {
    setImportStep('searching');
    setIsSearching(true);
    
    // Simular "investigación" de la IA basada en la ubicación
    setTimeout(() => {
      let mockProposed = [];
      
      if (comunidad === 'Castilla-La Mancha') {
        mockProposed = [
          { nombre: 'Fiesta Nacional (Trasladada)', startDate: '2025-10-13', endDate: null },
          { nombre: 'Día no lectivo (Puente)', startDate: '2025-10-31', endDate: null },
          { nombre: 'Todos los Santos', startDate: '2025-11-01', endDate: null },
          { nombre: 'Día de la Enseñanza', startDate: '2025-11-14', endDate: null },
          { nombre: 'Día de la Constitución', startDate: '2025-12-06', endDate: null },
          { nombre: 'Inmaculada Concepción', startDate: '2025-12-08', endDate: null },
          { nombre: 'Vacaciones de Navidad', startDate: '2025-12-22', endDate: '2026-01-07' },
          { nombre: 'Carnaval / Libre disposición', startDate: '2026-02-16', endDate: '2026-02-17' },
          { nombre: 'Vacaciones de Semana Santa', startDate: '2026-03-30', endDate: '2026-04-06' },
          { nombre: 'Fiesta del Trabajo', startDate: '2026-05-01', endDate: null },
          { nombre: 'Día de Castilla-La Mancha', startDate: '2026-05-31', endDate: null },
          { nombre: 'Corpus Christi', startDate: '2026-06-04', endDate: null },
          { nombre: 'Día no lectivo', startDate: '2026-06-05', endDate: null },
        ];
      } else if (comunidad === 'Madrid') {
        const isSanFernando = localidad.toLowerCase().includes('fernando');
        
        mockProposed = [
          { nombre: 'Fiesta Nacional (Trasladada)', startDate: '2025-10-13', endDate: null },
          { nombre: 'Día no lectivo', startDate: '2025-10-31', endDate: null },
          { nombre: 'Día de Todos los Santos', startDate: '2025-11-01', endDate: null },
          { nombre: 'Día no lectivo', startDate: '2025-11-03', endDate: null },
          { nombre: 'Día de la Constitución', startDate: '2025-12-06', endDate: null },
          { nombre: 'Inmaculada Concepción', startDate: '2025-12-08', endDate: null },
          { nombre: 'Vacaciones de Navidad', startDate: '2025-12-20', endDate: '2026-01-07' },
          { nombre: 'Día no lectivo', startDate: '2026-02-13', endDate: null },
          { nombre: 'Día no lectivo', startDate: '2026-02-16', endDate: null },
          { nombre: 'Vacaciones de Semana Santa', startDate: '2026-03-27', endDate: '2026-04-06' },
          { nombre: 'Fiesta del Trabajo', startDate: '2026-05-01', endDate: null },
          { nombre: 'Día de la Comunidad (No lectivo)', startDate: '2026-05-02', endDate: null },
        ];

        if (isSanFernando) {
          mockProposed.push({ nombre: 'Festivo Local (San Fernando)', startDate: '2026-05-15', endDate: null });
          mockProposed.push({ nombre: 'Festivo Local (San Fernando)', startDate: '2026-05-29', endDate: null });
        }
      } else {
        mockProposed = [
          { nombre: 'Fiesta Nacional (Trasladada)', startDate: '2025-10-13', endDate: null },
          { nombre: 'Todos los Santos', startDate: '2025-11-01', endDate: null },
          { nombre: 'Día de la Constitución', startDate: '2025-12-06', endDate: null },
          { nombre: 'Inmaculada Concepción', startDate: '2025-12-08', endDate: null },
          { nombre: 'Vacaciones de Navidad', startDate: '2025-12-22', endDate: '2026-01-07' },
          { nombre: 'Vacaciones de Semana Santa', startDate: '2026-03-30', endDate: '2026-04-06' },
          { nombre: 'Fiesta del Trabajo', startDate: '2026-05-01', endDate: null },
        ];
      }

      // Marcar los que ya existen en lugar de filtrarlos
      const withOverlapInfo = mockProposed.map(p => ({
        ...p,
        alreadyPresent: !!checkOverlap(p.startDate, p.endDate)
      }));
      
      setProposedHolidays(withOverlapInfo);
      // Solo seleccionar los que no están presentes
      setSelectedProposed(withOverlapInfo
        .map((p, index) => p.alreadyPresent ? null : index)
        .filter(i => i !== null)
      );
      
      setIsSearching(false);
      setImportStep('proposal');
    }, 2000);
  };

  const executeImport = async () => {
    if (!activeIesId) return;
    
    setLoading(true);
    try {
      const toImport = proposedHolidays.filter((_, index) => selectedProposed.includes(index));
      
      for (const holiday of toImport) {
        await addDoc(collection(db, 'festivos'), {
          nombre: holiday.nombre,
          startDate: holiday.startDate,
          endDate: holiday.endDate,
          iesId: activeIesId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      
      setModal({
        isOpen: true,
        title: 'Importación Completada',
        message: `Se han importado correctamente ${toImport.length} festivos para ${localidad || comunidad}.`
      });
      
      fetchHolidays();
      setIsImportModalOpen(false);
    } catch (error) {
      console.error("Error importing holidays:", error);
      setModal({ isOpen: true, title: 'Error', message: 'Hubo un error durante la importación.' });
    } finally {
      setLoading(false);
    }
  };

  const toggleProposed = (index) => {
    if (selectedProposed.includes(index)) {
      setSelectedProposed(selectedProposed.filter(i => i !== index));
    } else {
      setSelectedProposed([...selectedProposed, index]);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>Días Festivos</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Gestión de días no lectivos y periodos vacacionales del centro.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            className="btn-secondary" 
            onClick={handleAIImport}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              border: '1px solid var(--accent-primary)',
              color: 'var(--accent-primary)',
              background: 'rgba(99, 102, 241, 0.05)'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10 10 10 0 0 1-10-10 10 10 0 0 1 10-10z"></path><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.8 }}><path d="M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z"/></svg>
              (AI) Importar Festivos
            </span>
          </button>
          <button className="btn-primary" onClick={openCreateModal}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Nuevo Festivo
          </button>
        </div>
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
                          <button 
                            onClick={() => openEditModal(holiday)} 
                            className="btn-icon" 
                            title="Editar"
                            style={{ borderRadius: '8px' }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                          </button>
                          <button 
                            onClick={() => requestDelete(holiday)} 
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

      {/* AI Import Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title={
          importStep === 'location' ? "(AI) Configurar Ubicación" : 
          importStep === 'searching' ? "Investigando..." : "(AI) Propuesta de Festivos"
        }
      >
        <div style={{ minHeight: '300px' }}>
          {importStep === 'location' ? (
            <div style={styles.form}>
              <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
                Para ofrecerte el calendario correcto, la IA necesita saber la ubicación del centro.
              </p>
              
              <div className="form-group">
                <label className="form-label">Comunidad Autónoma</label>
                <select 
                  className="input-field" 
                  value={comunidad}
                  onChange={e => setComunidad(e.target.value)}
                >
                  <option value="Andalucía">Andalucía</option>
                  <option value="Aragón">Aragón</option>
                  <option value="Asturias">Asturias</option>
                  <option value="Baleares">Baleares</option>
                  <option value="Canarias">Canarias</option>
                  <option value="Cantabria">Cantabria</option>
                  <option value="Castilla y León">Castilla y León</option>
                  <option value="Castilla-La Mancha">Castilla-La Mancha</option>
                  <option value="Cataluña">Cataluña</option>
                  <option value="Comunidad Valenciana">Comunidad Valenciana</option>
                  <option value="Extremadura">Extremadura</option>
                  <option value="Galicia">Galicia</option>
                  <option value="Madrid">Madrid</option>
                  <option value="Murcia">Murcia</option>
                  <option value="Navarra">Navarra</option>
                  <option value="País Vasco">País Vasco</option>
                  <option value="La Rioja">La Rioja</option>
                  <option value="Ceuta">Ceuta</option>
                  <option value="Melilla">Melilla</option>
                </select>
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Localidad / Municipio</label>
                <input 
                  type="text" 
                  className="input-field"
                  placeholder="Ej: Toledo, Madrid, Alcázar..."
                  value={localidad}
                  onChange={e => setLocalidad(e.target.value)}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                  Usaremos esto para buscar los festivos locales específicos.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button className="btn-secondary" onClick={() => setIsImportModalOpen(false)} style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button className="btn-primary" onClick={startSearch} style={{ flex: 2 }}>
                  Investigar Calendario
                </button>
              </div>
            </div>
          ) : importStep === 'searching' ? (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
              <div className="spinner-small" style={{ margin: '0 auto 1rem' }}></div>
              <p>Investigando calendario escolar oficial para <b>{localidad ? `${localidad}, ` : ''}{comunidad}</b>...</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Buscando festivos regionales, nacionales y locales para el curso 2025-2026.</p>
            </div>
          ) : proposedHolidays.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p>No se han encontrado nuevos festivos para proponer en {comunidad}.</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Todos los festivos detectados ya están en el sistema.</p>
              <button className="btn-secondary" onClick={() => setIsImportModalOpen(false)} style={{ marginTop: '1.5rem' }}>Cerrar</button>
            </div>
          ) : (
            <>
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                Resultados encontrados para <b>{localidad ? `${localidad} (${comunidad})` : comunidad}</b>:
              </p>
              <div className="scrollable" style={{ maxHeight: '40vh', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }}>
                {proposedHolidays.map((holiday, index) => (
                  <div 
                    key={index} 
                    onClick={() => !holiday.alreadyPresent && toggleProposed(index)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '1rem', 
                      padding: '0.75rem', 
                      borderBottom: index < proposedHolidays.length - 1 ? '1px solid var(--border-color)' : 'none',
                      cursor: holiday.alreadyPresent ? 'default' : 'pointer',
                      background: selectedProposed.includes(index) ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                      opacity: holiday.alreadyPresent ? 0.6 : 1,
                      transition: 'background 0.2s',
                      borderRadius: '4px'
                    }}
                  >
                    <input 
                      type="checkbox" 
                      checked={selectedProposed.includes(index)} 
                      disabled={holiday.alreadyPresent}
                      onChange={() => {}} 
                      style={{ width: '18px', height: '18px', cursor: holiday.alreadyPresent ? 'default' : 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: '600', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {holiday.nombre}
                        {holiday.alreadyPresent && (
                          <span className="badge" style={{ fontSize: '0.7rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none' }}>
                            Ya presente
                          </span>
                        )}
                      </p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {new Date(holiday.startDate).toLocaleDateString()}
                        {holiday.endDate && <> al {new Date(holiday.endDate).toLocaleDateString()}</>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button className="btn-secondary" onClick={() => setImportStep('location')} style={{ flex: 1 }}>
                  Atrás
                </button>
                <button 
                  className="btn-primary" 
                  onClick={executeImport} 
                  disabled={selectedProposed.length === 0}
                  style={{ flex: 2 }}
                >
                  Importar {selectedProposed.length} festivos
                </button>
              </div>
            </>
          )}
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
