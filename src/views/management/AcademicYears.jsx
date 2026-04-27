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

export default function AcademicYears() {
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fechaInicioClases, setFechaInicioClases] = useState(`${new Date().getFullYear()}-09-01`);
  const [duracionSesion, setDuracionSesion] = useState(55);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, year: null });
  
  const activeIesId = localStorage.getItem('activeIesId');

  useEffect(() => {
    fetchYears();
  }, [activeIesId]);

  const fetchYears = async () => {
    if (!activeIesId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'cursos_academicos'),
        where('iesId', '==', activeIesId)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Ordenar en memoria para evitar el error de índice compuesto de Firestore
      data.sort((a, b) => b.añoInicio - a.añoInicio);
      setYears(data);
    } catch (error) {
      console.error("Error fetching academic years:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!activeIesId) return;

    if (isEditing) {
      try {
        await updateDoc(doc(db, 'cursos_academicos', editingId), {
          fechaInicioClases,
          duracionSesion: parseInt(duracionSesion),
          updatedAt: serverTimestamp()
        });
        setModal({
          isOpen: true,
          title: 'Curso Actualizado',
          message: `Se ha actualizado correctamente el curso académico.`
        });
        fetchYears();
        setIsFormOpen(false);
      } catch (error) {
        console.error("Error updating academic year:", error);
        setModal({ isOpen: true, title: 'Error', message: 'No se pudo actualizar el curso académico.' });
      }
    } else {
      const yearFromDate = new Date(fechaInicioClases).getFullYear();
      // Verificar si ya existe
      if (years.some(y => y.añoInicio === yearFromDate)) {
        setModal({
          isOpen: true,
          title: 'Año Duplicado',
          message: `El curso académico ${yearFromDate}-${yearFromDate + 1} ya existe en este centro.`
        });
        return;
      }

      try {
        await addDoc(collection(db, 'cursos_academicos'), {
          iesId: activeIesId,
          añoInicio: yearFromDate,
          añoFin: yearFromDate + 1,
          nombre: `${yearFromDate}-${yearFromDate + 1}`,
          fechaInicioClases,
          duracionSesion: parseInt(duracionSesion),
          createdAt: serverTimestamp()
        });
        setModal({
          isOpen: true,
          title: 'Curso Creado',
          message: `Se ha registrado correctamente el curso ${yearFromDate}-${yearFromDate + 1}.`
        });
        fetchYears();
        setIsFormOpen(false);
      } catch (error) {
        console.error("Error creating academic year:", error);
        setModal({ isOpen: true, title: 'Error', message: 'No se pudo crear el curso académico.' });
      }
    }
  };

  const openCreateModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFechaInicioClases(`${new Date().getFullYear()}-09-01`);
    setDuracionSesion(55);
    setIsFormOpen(true);
  };

  const openEditModal = (year) => {
    setIsEditing(true);
    setEditingId(year.id);
    setFechaInicioClases(year.fechaInicioClases || '');
    setDuracionSesion(year.duracionSesion || 55);
    setIsFormOpen(true);
  };

  const requestDelete = (year) => {
    setConfirmDelete({ isOpen: true, year });
  };

  const executeDelete = async () => {
    const year = confirmDelete.year;
    if (!year) return;

    try {
      await deleteDoc(doc(db, 'cursos_academicos', year.id));
      setYears(years.filter(y => y.id !== year.id));
      setConfirmDelete({ isOpen: false, year: null });
      
      setModal({
        isOpen: true,
        title: 'Curso Eliminado',
        message: `El curso ${year.nombre} ha sido eliminado correctamente.`
      });
    } catch (error) {
      console.error("Error deleting academic year:", error);
      setConfirmDelete({ isOpen: false, year: null });
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Hubo un problema al eliminar el curso. Asegúrate de que no tenga datos dependientes.'
      });
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Configuración del Curso Académico</h1>
        <button className="btn-primary" onClick={openCreateModal}>
          Nuevo Curso Académico
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Cursos Registrados</h2>
          {loading ? (
            <p>Cargando cursos...</p>
          ) : years.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              No hay cursos académicos registrados todavía.
            </p>
          ) : (
            <div style={styles.list}>
              {years.map(year => (
                <div key={year.id} style={styles.yearItem}>
                  <div style={styles.yearInfo}>
                    <div style={styles.yearIcon}>
                      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1rem' }}>Curso {year.nombre}</h3>
                      <p style={{ fontSize: '0.8rem' }}>Inicio: {year.fechaInicioClases || 'No definida'} | Sesiones: {year.duracionSesion || 55} min</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => openEditModal(year)}
                      className="btn-secondary"
                      style={{ padding: '0.4rem', minWidth: 'auto' }}
                      title="Editar curso"
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button 
                      onClick={() => requestDelete(year)}
                      className="btn-delete"
                      style={{ padding: '0.4rem', minWidth: 'auto', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '4px' }}
                      title="Eliminar curso"
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={isEditing ? "Editar Curso Académico" : "Nuevo Curso Académico"}
      >
        <form onSubmit={handleSave} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Fecha inicio de clases</label>
            <input 
              type="date" 
              className="input-field"
              value={fechaInicioClases}
              onChange={e => setFechaInicioClases(e.target.value)}
              required
            />
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Curso detectado: <b>{new Date(fechaInicioClases).getFullYear()}-{new Date(fechaInicioClases).getFullYear() + 1}</b>
            </p>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Duración sesión (minutos)</label>
            <input 
              type="number" 
              className="input-field"
              min="10"
              max="240"
              value={duracionSesion}
              onChange={e => setDuracionSesion(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }}>
            {isEditing ? 'Guardar Cambios' : 'Crear Curso Académico'}
          </button>
        </form>
      </Modal>

      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
      >
        <p>{modal.message}</p>
      </Modal>

      <Modal
        isOpen={confirmDelete.isOpen}
        onClose={() => setConfirmDelete({ isOpen: false, year: null })}
        title="Confirmar Eliminación"
        footer={
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              className="btn-primary" 
              style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
              onClick={() => setConfirmDelete({ isOpen: false, year: null })}
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
        }
      >
        <p>¿Estás seguro de que quieres eliminar el curso <b>{confirmDelete.year?.nombre}</b>?</p>
        <p style={{ marginTop: '0.5rem', color: '#ef4444', fontSize: '0.9rem' }}>Esta acción no se puede deshacer y podría afectar a datos vinculados.</p>
      </Modal>
    </div>
  );
}

const styles = {
  grid: {
    display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start'
  },
  card: {
    padding: '2rem', flex: 1, minWidth: '300px'
  },
  form: {
    display: 'flex', flexDirection: 'column', gap: '1.5rem'
  },
  field: {
    display: 'flex', flexDirection: 'column', gap: '0.5rem'
  },
  label: {
    fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)'
  },
  list: {
    display: 'flex', flexDirection: 'column', gap: '1rem'
  },
  yearItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)'
  },
  yearInfo: {
    display: 'flex', alignItems: 'center', gap: '1rem'
  },
  yearIcon: {
    width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center'
  }
};
