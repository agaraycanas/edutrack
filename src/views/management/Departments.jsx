import { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  updateDoc,
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import Modal from '../../components/common/Modal';

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDeptName, setNewDeptName] = useState('');
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, dept: null });
  
  const activeIesId = localStorage.getItem('activeIesId');

  useEffect(() => {
    fetchData();
  }, [activeIesId]);

  const fetchData = async () => {
    if (!activeIesId) return;
    setLoading(true);
    try {
      // 1. Fetch Departments
      const qDepts = query(
        collection(db, 'departamentos'),
        where('iesId', '==', activeIesId)
      );
      const snapshotDepts = await getDocs(qDepts);
      const deptsData = snapshotDepts.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // 2. Fetch Staff (to find heads of department)
      const qStaff = query(
        collection(db, 'usuarios'),
        where('iesIds', 'array-contains', activeIesId)
      );
      const snapshotStaff = await getDocs(qStaff);
      const staffData = snapshotStaff.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStaff(staffData);

      // Sort alphabetically
      deptsData.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setDepartments(deptsData);
    } catch (error) {
      console.error("Error fetching departments data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!activeIesId || !newDeptName.trim()) return;

    // Check if already exists
    if (departments.some(d => d.nombre.toLowerCase() === newDeptName.trim().toLowerCase())) {
      setModal({
        isOpen: true,
        title: 'Departamento Duplicado',
        message: `El departamento "${newDeptName}" ya existe en este centro.`
      });
      return;
    }

    try {
      await addDoc(collection(db, 'departamentos'), {
        iesId: activeIesId,
        nombre: newDeptName.trim(),
        createdAt: serverTimestamp()
      });
      setNewDeptName('');
      setModal({
        isOpen: true,
        title: 'Éxito',
        message: 'Departamento creado correctamente.'
      });
      fetchData();
    } catch (error) {
      console.error("Error creating department:", error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo crear el departamento.'
      });
    }
  };

  const requestDelete = (dept) => {
    setConfirmDelete({ isOpen: true, dept });
  };

  const openEditModal = (dept) => {
    setEditingDept(dept);
    setNewDeptName(dept.nombre);
    setIsFormOpen(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingDept || !newDeptName.trim()) return;

    try {
      await updateDoc(doc(db, 'departamentos', editingDept.id), {
        nombre: newDeptName.trim()
      });
      setEditingDept(null);
      setNewDeptName('');
      setIsFormOpen(false);
      fetchData();
      setModal({ isOpen: true, title: 'Éxito', message: 'Departamento actualizado correctamente.' });
    } catch (error) {
      console.error("Error updating department:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudo actualizar el departamento.' });
    }
  };

  const executeDelete = async () => {
    const dept = confirmDelete.dept;
    if (!dept) return;

    try {
      await deleteDoc(doc(db, 'departamentos', dept.id));
      setDepartments(departments.filter(d => d.id !== dept.id));
      setConfirmDelete({ isOpen: false, dept: null });
      setModal({
        isOpen: true,
        title: 'Eliminado',
        message: `El departamento ${dept.nombre} ha sido eliminado.`
      });
    } catch (error) {
      console.error("Error deleting department:", error);
      setConfirmDelete({ isOpen: false, dept: null });
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Hubo un problema al eliminar el departamento.'
      });
    }
  };

  const getDeptHead = (deptName) => {
    return staff.find(u => 
      u.roles?.some(r => 
        r.iesId === activeIesId && 
        r.rol === 'jefe_departamento' && 
        r.departamento === deptName && 
        r.estado === 'activo'
      )
    );
  };

  const initDefaultDepts = async () => {
    const defaultDepts = [
      "Biología y Geología", "Cultura Clásica", "Dibujo", "Economía", "Educación Física",
      "Filosofía", "Física y Química", "Geografía e Historia", "Inglés", 
      "Lengua Castellana y Literatura", "Matemáticas", "Música", "Orientación", 
      "Religión", "Tecnología", "Administración y Gestión", "Comercio y Márketing", 
      "Formación y Orientación Laboral", "Informática y Comunicaciones", 
      "Imagen Personal", "Extraescolares", "General"
    ];

    setLoading(true);
    try {
      const oldName = "Informática";
      const newName = "Informática y Comunicaciones";
      
      // 1. Force migration across all collections regardless of department document existence
      
      // Update users
      const qUsers = query(collection(db, 'usuarios'), where('iesIds', 'array-contains', activeIesId));
      const usersSnap = await getDocs(qUsers);
      for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        let changed = false;
        const newRoles = userData.roles?.map(r => {
          if (r.iesId === activeIesId && r.departamento === oldName) {
            changed = true;
            return { ...r, departamento: newName };
          }
          return r;
        });
        if (changed) {
          await updateDoc(userDoc.ref, { roles: newRoles });
        }
      }

      // Update ies_estudios
      const qStudies = query(collection(db, 'ies_estudios'), where('iesId', '==', activeIesId));
      const studiesSnap = await getDocs(qStudies);
      for (const studyDoc of studiesSnap.docs) {
        const studyData = studyDoc.data();
        if (studyData.departamentos?.includes(oldName)) {
          let newDepts = studyData.departamentos.map(d => d === oldName ? newName : d);
          newDepts = [...new Set(newDepts)];
          await updateDoc(studyDoc.ref, { departamentos: newDepts });
        }
      }

      // Update ies_asignaturas
      const qSubjects = query(collection(db, 'ies_asignaturas'), where('iesId', '==', activeIesId), where('departamento', '==', oldName));
      const subjectsSnap = await getDocs(qSubjects);
      for (const subjectDoc of subjectsSnap.docs) {
        await updateDoc(subjectDoc.ref, { departamento: newName });
      }

      // 2. Handle the department document itself
      const infoDept = departments.find(d => d.nombre === oldName);
      const canonicalDept = departments.find(d => d.nombre === newName);

      if (infoDept) {
        if (canonicalDept) {
          await deleteDoc(doc(db, 'departamentos', infoDept.id));
        } else {
          await updateDoc(doc(db, 'departamentos', infoDept.id), { nombre: newName });
        }
      }

      // 3. Add missing defaults
      for (const name of defaultDepts) {
        // Fetch fresh departments state or use the updated one
        const exists = departments.some(d => d.nombre === name) || 
                      (name === newName && (infoDept || canonicalDept));
        if (!exists) {
          await addDoc(collection(db, 'departamentos'), {
            iesId: activeIesId,
            nombre: name,
            createdAt: serverTimestamp()
          });
        }
      }
      
      fetchData();
      setModal({
        isOpen: true,
        title: 'Departamentos Inicializados',
        message: 'Se han cargado los departamentos por defecto y se ha completado la migración de "Informática" a "Informática y Comunicaciones" en todos los registros.'
      });
    } catch (error) {
      console.error("Error initializing departments:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudieron inicializar los departamentos.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Gestión de Departamentos</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn-primary" onClick={() => setIsFormOpen(true)}>
            Nuevo Departamento
          </button>
          {!loading && (
            <button className="btn-primary" onClick={initDefaultDepts} style={{ background: 'var(--accent-secondary)' }}>
              Sincronizar departamentos por defecto
            </button>
          )}
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Departamentos del Centro</h2>
          {loading ? (
            <p>Cargando departamentos...</p>
          ) : departments.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              No hay departamentos registrados.
            </p>
          ) : (
          <div className="table-scroll-wrapper">
            <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}></th>
                <th>Nombre del Departamento</th>
                <th>Responsable / Jefe</th>
                <th style={{ textAlign: 'center', width: '100px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {departments.map(dept => {
                const head = getDeptHead(dept.nombre);
                return (
                  <tr key={dept.id}>
                    <td>
                      <div style={styles.deptIcon}>
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: '600' }}>{dept.nombre}</span>
                    </td>
                    <td>
                      {head ? (
                        <div style={styles.headInfo}>
                          <img src={head.foto || 'https://via.placeholder.com/24'} style={styles.headAvatar} alt="" />
                          <span style={styles.headName}>{head.nombre} {head.apellidos}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sin asignar</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => openEditModal(dept)} 
                          className="btn-icon" 
                          title="Editar"
                          style={{ borderRadius: '8px' }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button 
                          onClick={() => requestDelete(dept)} 
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
          </div>
          )}
        </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingDept(null);
          setNewDeptName('');
        }}
        title={editingDept ? "Editar Departamento" : "Nuevo Departamento"}
      >
        <form onSubmit={(e) => {
          if (editingDept) handleUpdate(e);
          else handleCreate(e);
        }} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Nombre del Departamento</label>
            <input 
              type="text" 
              className="input-field"
              placeholder="Ej: Latín"
              value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }}>
            {editingDept ? "Guardar Cambios" : "Crear Departamento"}
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
        onClose={() => setConfirmDelete({ isOpen: false, dept: null })}
        title="Confirmar Eliminación"
        footer={
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              className="btn-primary" 
              style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
              onClick={() => setConfirmDelete({ isOpen: false, dept: null })}
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
        <p>¿Estás seguro de que quieres eliminar el departamento <b>{confirmDelete.dept?.nombre}</b>?</p>
        <p style={{ marginTop: '0.5rem', color: '#ef4444', fontSize: '0.9rem' }}>Esta acción podría dejar huérfanos a los profesores vinculados a este departamento.</p>
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
    display: 'grid', 
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
    gap: '1rem',
    paddingBottom: '2rem'
  },
  deptItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)'
  },
  deptInfo: {
    display: 'flex', alignItems: 'center', gap: '1rem'
  },
  deptIcon: {
    width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
  },
  headInfo: {
    display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px'
  },
  headAvatar: {
    width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover'
  },
  headName: {
    fontSize: '0.75rem', color: 'var(--text-secondary)'
  }
};
