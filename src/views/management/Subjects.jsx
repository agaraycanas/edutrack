import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  serverTimestamp,
  getDoc,
  limit
} from 'firebase/firestore';
import Modal from '../../components/common/Modal';

export default function Subjects() {
  const [subjects, setSubjects] = useState([]);
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  
  // Filters
  const [filterStudy, setFilterStudy] = useState('all');
  const [filterLevel, setFilterLevel] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    sigla: '',
    curso: '',
    iesEstudioId: ''
  });
  
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, subject: null, inUse: false });

  const activeIesId = localStorage.getItem('activeIesId');
  const activeRole = localStorage.getItem('activeRole');

  useEffect(() => {
    fetchInitialData();
  }, [activeIesId, activeRole]);

  useEffect(() => {
    if (activeIesId) {
      fetchSubjects();
    }
  }, [filterStudy, filterLevel, userProfile]);

  const fetchInitialData = async () => {
    if (!activeIesId) return;
    setLoading(true);
    try {
      // 1. Fetch User Profile
      const userDoc = await getDoc(doc(db, 'usuarios', auth.currentUser.uid));
      const profile = userDoc.data();
      setUserProfile(profile);

      // 2. Fetch Studies (ies_estudios)
      const qStudies = query(
        collection(db, 'ies_estudios'),
        where('iesId', '==', activeIesId)
      );
      const snapshotStudies = await getDocs(qStudies);
      const studiesData = snapshotStudies.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      studiesData.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setStudies(studiesData);

      // If user is jefe_departamento, auto-select first study of their dept if available
      if (activeRole === 'jefe_departamento') {
        const myDept = profile.roles?.find(r => r.rol === activeRole && r.iesId === activeIesId)?.departamento;
        const myStudies = studiesData.filter(s => s.departamentos?.includes(myDept));
        if (myStudies.length > 0 && !filterStudy) {
          setFilterStudy(myStudies[0].id);
        }
      }

    } catch (error) {
      console.error("Error fetching initial subjects data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjects = async () => {
    if (!activeIesId || !filterStudy) {
      setSubjects([]);
      return;
    }

    const isGlobalRole = activeRole === 'jefe_estudios' || activeRole === 'superadmin';
    
    // If filtering all and not global role, we need the profile to know the department
    if (filterStudy === 'all' && !isGlobalRole && !userProfile) {
      return;
    }
    
    try {
      let q = query(
        collection(db, 'ies_asignaturas'),
        where('iesId', '==', activeIesId)
      );

      if (filterStudy !== 'all') {
        q = query(q, where('iesEstudioId', '==', filterStudy));
      } else {
        // "Todas" logic: filter by department if not a global role
        if (!isGlobalRole) {
          const myRoleData = userProfile?.roles?.find(r => r.rol === activeRole && r.iesId === activeIesId);
          const myDept = myRoleData?.departamento;
          if (myDept) {
            q = query(q, where('departamento', '==', myDept));
          } else {
            // If no department found for this role, we can't filter yet or they see nothing
            setSubjects([]);
            return;
          }
        }
      }

      if (filterLevel) {
        q = query(q, where('curso', '==', parseInt(filterLevel)));
      }

      const snapshot = await getDocs(q);
      const subjectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort by level then name
      subjectsData.sort((a, b) => {
        if (a.curso !== b.curso) return a.curso - b.curso;
        return a.nombre.localeCompare(b.nombre);
      });

      setSubjects(subjectsData);
    } catch (error) {
      console.error("Error fetching subjects:", error);
    }
  };

  const handleOpenForm = (subject = null) => {
    if (subject) {
      setEditingSubject(subject);
      setFormData({
        nombre: subject.nombre,
        sigla: subject.sigla || '',
        curso: subject.curso,
        iesEstudioId: subject.iesEstudioId
      });
    } else {
      setEditingSubject(null);
      setFormData({
        nombre: '',
        sigla: '',
        curso: filterLevel || '',
        iesEstudioId: filterStudy === 'all' ? '' : (filterStudy || '')
      });
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeIesId) return;

    if (!formData.nombre || !formData.iesEstudioId || !formData.curso) {
      setModal({
        isOpen: true,
        title: 'Campos incompletos',
        message: 'Por favor, rellena todos los campos obligatorios.'
      });
      return;
    }

    setIsProcessing(true);
    try {
      // 0. Check for duplicates in the same study and course
      const siglaUpper = formData.sigla.toUpperCase().trim();
      const nameTrimmed = formData.nombre.trim();
      
      const qCheck = query(
        collection(db, 'ies_asignaturas'),
        where('iesId', '==', activeIesId),
        where('iesEstudioId', '==', formData.iesEstudioId),
        where('curso', '==', parseInt(formData.curso))
      );
      const checkSnap = await getDocs(qCheck);
      
      const duplicateSigla = checkSnap.docs.find(doc => {
        if (editingSubject && doc.id === editingSubject.id) return false;
        return doc.data().sigla?.toUpperCase() === siglaUpper;
      });

      const duplicateName = checkSnap.docs.find(doc => {
        if (editingSubject && doc.id === editingSubject.id) return false;
        return doc.data().nombre?.toLowerCase().trim() === nameTrimmed.toLowerCase();
      });

      if (duplicateSigla) {
        setModal({
          isOpen: true,
          title: 'Sigla duplicada',
          message: `Ya existe una asignatura con la sigla "${siglaUpper}" para este curso en esta titulación.`
        });
        setIsProcessing(false);
        return;
      }

      if (duplicateName) {
        setModal({
          isOpen: true,
          title: 'Nombre duplicado',
          message: `Ya existe una asignatura con el nombre "${nameTrimmed}" para este curso en esta titulación.`
        });
        setIsProcessing(false);
        return;
      }

      const selectedStudy = studies.find(s => s.id === formData.iesEstudioId);
      const myRoleData = userProfile.roles?.find(r => r.rol === activeRole && r.iesId === activeIesId);
      const myDept = myRoleData?.departamento;

      const subjectData = {
        iesId: activeIesId,
        nombre: nameTrimmed,
        sigla: siglaUpper,
        curso: parseInt(formData.curso),
        iesEstudioId: formData.iesEstudioId,
        titulacionNombre: selectedStudy.nombre,
        departamento: activeRole === 'jefe_departamento' ? myDept : (selectedStudy.departamentos?.[0] || 'General'),
        updatedAt: serverTimestamp()
      };

      if (editingSubject) {
        await updateDoc(doc(db, 'ies_asignaturas', editingSubject.id), subjectData);
      } else {
        subjectData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'ies_asignaturas'), subjectData);
      }

      setIsFormOpen(false);
      fetchSubjects();
      setModal({
        isOpen: true,
        title: editingSubject ? 'Asignatura Actualizada' : 'Asignatura Creada',
        message: 'Los cambios se han guardado correctamente.'
      });
    } catch (error) {
      console.error("Error saving subject:", error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo guardar la asignatura.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const checkIfInUse = async (subjectId) => {
    // Check if subject is used in any group assignments, schedules or grades
    // We check collections that might contain references to this subject
    const checkCollections = [
      'ies_grupos_asignaturas',
      'ies_horarios',
      'ies_calificaciones',
      'ies_unidades_didacticas'
    ];

    try {
      for (const colName of checkCollections) {
        const q = query(collection(db, colName), where('asignaturaId', '==', subjectId), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) return true;
      }
      return false;
    } catch (e) {
      console.error("Error checking subject usage:", e);
      // If the collection doesn't exist, Firestore will error. 
      // In a real app, we should handle specific "collection not found" errors if they happen.
      return false; 
    }
  };

  const handleConfirmDelete = async (subject) => {
    setIsProcessing(true);
    const inUse = await checkIfInUse(subject.id);
    setIsProcessing(false);
    setDeleteConfirm({ isOpen: true, subject, inUse });
  };

  const handleDelete = async () => {
    if (!deleteConfirm.subject || deleteConfirm.inUse) return;
    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, 'ies_asignaturas', deleteConfirm.subject.id));
      setSubjects(subjects.filter(s => s.id !== deleteConfirm.subject.id));
      setDeleteConfirm({ isOpen: false, subject: null, inUse: false });
    } catch (error) {
      console.error("Error deleting subject:", error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo eliminar la asignatura.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedStudyForFilter = studies.find(s => s.id === filterStudy);
  const selectedStudyForForm = studies.find(s => s.id === formData.iesEstudioId);

  return (
    <div className="animate-fade-in" style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.headerText}>
            <h1 style={styles.title}>Asignaturas</h1>
            <p style={styles.subtitle}>
              {activeRole === 'jefe_estudios' || activeRole === 'superadmin'
                ? 'Gestión académica global'
                : `Departamento de ${userProfile?.roles?.find(r => r.rol === activeRole && r.iesId === activeIesId)?.departamento || '...'}`}
            </p>
          </div>
          <button className="btn-primary" onClick={() => handleOpenForm()} style={styles.newButton}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Nueva Asignatura
          </button>
        </div>
      </header>

      {/* Filters Section */}
      <section className="glass-panel" style={styles.filtersPanel}>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Titulación</label>
          <div style={styles.selectWrapper}>
            <select 
              className="input-field"
              value={filterStudy}
              onChange={e => {
                setFilterStudy(e.target.value);
                setFilterLevel('');
              }}
              style={styles.select}
            >
              <option value="all">Todas</option>
              {studies
                .filter(s => {
                  if (activeRole === 'jefe_estudios' || activeRole === 'superadmin') return true;
                  const myDept = userProfile?.roles?.find(r => r.rol === activeRole && r.iesId === activeIesId)?.departamento;
                  return s.departamentos?.includes(myDept);
                })
                .map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
            </select>
          </div>
        </div>

        <div style={{ ...styles.filterGroup, width: '180px' }}>
          <label style={styles.filterLabel}>Nivel / Curso</label>
          <div style={styles.selectWrapper}>
            <select 
              className="input-field"
              value={filterLevel}
              onChange={e => setFilterLevel(e.target.value)}
              disabled={!filterStudy}
              style={styles.select}
            >
              <option value="">TODOS LOS CURSOS</option>
              {(filterStudy === 'all' ? [1, 2, 3, 4] : selectedStudyForFilter?.cursos)?.map(c => (
                <option key={c} value={c}>{c}º Curso</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="glass-panel" style={styles.mainPanel}>
        <div style={styles.listHeader}>
          <h2 style={styles.listTitle}>
            {filterStudy === 'all' ? 'Todas las Asignaturas' : (selectedStudyForFilter?.nombre || 'Selecciona una titulación')}
          </h2>
          {filterStudy && subjects.length > 0 && (
            <span style={styles.countBadge}>{subjects.length} asignaturas</span>
          )}
        </div>
        
        {loading ? (
          <div style={styles.centered}>
            <div className="loader"></div>
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Cargando asignaturas...</p>
          </div>
        ) : !filterStudy ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><path d="M20 17h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2v-6z"></path></svg>
            </div>
            <h3>Comienza seleccionando una titulación</h3>
            <p>Podrás ver y gestionar las materias de cada curso.</p>
          </div>
        ) : subjects.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </div>
            <h3>No hay asignaturas registradas</h3>
            <p>Parece que aún no se han añadido materias para este nivel.</p>
            <button className="btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => handleOpenForm()}>
              Añadir Primera Asignatura
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Sigla</th>
                  <th style={{ textAlign: 'left' }}>Nombre de la Asignatura</th>
                  <th style={{ textAlign: 'left' }}>Curso</th>
                  <th style={{ textAlign: 'left' }}>Departamento</th>
                  <th style={{ textAlign: 'right', width: '100px' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map(subject => (
                  <tr key={subject.id}>
                    <td>
                      <div style={{ 
                        width: '44px', 
                        height: '44px', 
                        borderRadius: '12px', 
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)', 
                        color: '#a5b4fc', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        fontWeight: '800', 
                        fontSize: '0.75rem', 
                        border: '1px solid rgba(165, 180, 252, 0.2)' 
                      }}>
                        {subject.sigla || subject.nombre.substring(0, 2).toUpperCase()}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '600', fontSize: '1rem' }}>{subject.nombre}</div>
                    </td>
                    <td>
                      <span className="badge badge-accent">
                        {subject.curso}º Curso
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        {subject.departamento}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button 
                          onClick={() => handleOpenForm(subject)}
                          className="btn-secondary"
                          style={{ padding: '0.4rem', minWidth: 'auto' }}
                          title="Editar asignatura"
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button 
                          onClick={() => handleConfirmDelete(subject)}
                          className="btn-delete"
                          style={{ padding: '0.4rem', minWidth: 'auto', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '4px' }}
                          title="Eliminar asignatura"
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingSubject ? "Editar Asignatura" : "Nueva Asignatura"}
      >
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formField}>
            <label style={styles.label}>Nombre de la Materia</label>
            <input 
              type="text" 
              className="input-field"
              placeholder="Ej: Programación Multimedia..."
              value={formData.nombre}
              onChange={e => setFormData({...formData, nombre: e.target.value})}
              required
            />
          </div>

          <div style={styles.formRow}>
            <div style={{ ...styles.formField, flex: 1 }}>
              <label style={styles.label}>Siglas</label>
              <input 
                type="text" 
                className="input-field"
                placeholder="PROG"
                value={formData.sigla}
                onChange={e => setFormData({...formData, sigla: e.target.value.toUpperCase()})}
              />
            </div>
            <div style={{ ...styles.formField, width: '120px' }}>
              <label style={styles.label}>Curso</label>
              <select 
                className="input-field"
                value={formData.curso}
                onChange={e => setFormData({...formData, curso: e.target.value})}
                disabled={!formData.iesEstudioId}
                required
              >
                <option value="">Curso...</option>
                {selectedStudyForForm?.cursos?.map(c => (
                  <option key={c} value={c}>{c}º</option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.formField}>
            <label style={styles.label}>Titulación</label>
            <select 
              className="input-field"
              value={formData.iesEstudioId}
              onChange={e => setFormData({...formData, iesEstudioId: e.target.value, curso: ''})}
              required
            >
              <option value="">Selecciona titulación...</option>
              {studies
                .filter(s => {
                  if (activeRole === 'jefe_estudios' || activeRole === 'superadmin') return true;
                  const myDept = userProfile?.roles?.find(r => r.rol === activeRole && r.iesId === activeIesId)?.departamento;
                  return s.departamentos?.includes(myDept);
                })
                .map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
            </select>
          </div>

          <button 
            type="submit" 
            className="btn-primary" 
            style={styles.submitBtn}
            disabled={isProcessing}
          >
            {isProcessing ? 'Procesando...' : editingSubject ? 'Guardar Cambios' : 'Crear Asignatura'}
          </button>
        </form>
      </Modal>

      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
      >
        <p style={{ lineHeight: '1.6' }}>{modal.message}</p>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, subject: null, inUse: false })}
        title="Confirmar Eliminación"
        footer={
          <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
            <button 
              className="btn-secondary" 
              style={{ flex: 1 }}
              onClick={() => setDeleteConfirm({ isOpen: false, subject: null, inUse: false })}
            >
              Cancelar
            </button>
            <button 
              className="btn-primary" 
              style={{ flex: 1, background: deleteConfirm.inUse ? '#666' : '#ef4444' }}
              onClick={handleDelete}
              disabled={deleteConfirm.inUse || isProcessing}
            >
              {isProcessing ? '...' : 'Eliminar'}
            </button>
          </div>
        }
      >
        {deleteConfirm.inUse ? (
          <div style={styles.alertDanger}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>No se puede eliminar</strong>
                <p style={{ fontSize: '0.9rem' }}>Esta asignatura está vinculada a grupos, horarios o calificaciones existentes. Elimina primero esas vinculaciones.</p>
              </div>
            </div>
          </div>
        ) : (
          <p>¿Estás seguro de que deseas eliminar la asignatura <b>{deleteConfirm.subject?.nombre}</b>? Esta acción es irreversible.</p>
        )}
      </Modal>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1200px', margin: '0 auto', paddingBottom: '4rem'
  },
  header: {
    marginBottom: '2.5rem'
  },
  headerContent: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem'
  },
  headerText: {},
  title: {
    fontSize: '2.5rem', fontWeight: '800', background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem'
  },
  subtitle: {
    color: 'var(--text-secondary)', fontSize: '1.1rem'
  },
  newButton: {
    display: 'flex', alignItems: 'center', padding: '0.85rem 1.5rem', borderRadius: '12px', fontSize: '1rem', fontWeight: '600', boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)'
  },
  filtersPanel: {
    padding: '1.5rem 2rem', marginBottom: '2rem', display: 'flex', gap: '2rem', alignItems: 'flex-end', border: '1px solid rgba(255,255,255,0.1)'
  },
  filterGroup: {
    display: 'flex', flexDirection: 'column', gap: '0.65rem', flex: 1
  },
  filterLabel: {
    fontSize: '0.85rem', fontWeight: '700', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em'
  },
  selectWrapper: {
    position: 'relative'
  },
  select: {
    width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)'
  },
  mainPanel: {
    padding: '2.5rem', minHeight: '400px', border: '1px solid rgba(255,255,255,0.05)'
  },
  listHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem'
  },
  listTitle: {
    fontSize: '1.5rem', fontWeight: '700'
  },
  countBadge: {
    background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600'
  },
  subjectGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem'
  },
  subjectCard: {
    background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', padding: '1.25rem', transition: 'all 0.3s ease', cursor: 'default'
  },
  cardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem'
  },
  subjectBadge: {
    width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)', color: '#a5b4fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '0.75rem', border: '1px solid rgba(165, 180, 252, 0.2)'
  },
  cardActions: {
    display: 'flex', gap: '0.4rem'
  },
  actionBtn: {
    width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s'
  },
  deleteBtn: {
    width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s'
  },
  cardBody: {},
  subjectName: {
    fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.75rem', lineHeight: '1.4'
  },
  subjectMeta: {
    display: 'flex', gap: '1rem', flexWrap: 'wrap'
  },
  metaItem: {
    display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)'
  },
  emptyState: {
    textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)'
  },
  emptyIcon: {
    width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem'
  },
  form: {
    display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.5rem'
  },
  formField: {
    display: 'flex', flexDirection: 'column', gap: '0.5rem'
  },
  formRow: {
    display: 'flex', gap: '1rem'
  },
  label: {
    fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)'
  },
  submitBtn: {
    width: '100%', marginTop: '1rem', padding: '1rem', fontSize: '1rem'
  },
  alertDanger: {
    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', padding: '1.25rem', color: '#ef4444', marginBottom: '1rem'
  },
  centered: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem'
  }
};
