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

export default function TeachingAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [userDept, setUserDept] = useState('');
  
  // Data for selects
  const [academicYears, setAcademicYears] = useState([]);
  const [studies, setStudies] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [groups, setGroups] = useState([]);
  const [professors, setProfessors] = useState([]);

  // Filters
  const [filterYear, setFilterYear] = useState('');
  const [filterStudy, setFilterStudy] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    cursoAcademicoId: '',
    iesEstudioId: '',
    asignaturaId: '',
    grupoId: '',
    usuarioId: '' // Professor
  });
  
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, assignment: null });
  const [conflictModal, setConflictModal] = useState({ 
    isOpen: false, 
    existingAssignment: null, 
    hasItems: false,
    message: '' 
  });

  const activeIesId = localStorage.getItem('activeIesId');
  const activeRole = localStorage.getItem('activeRole');

  useEffect(() => {
    fetchInitialData();
  }, [activeIesId, activeRole]);

  useEffect(() => {
    if (activeIesId) {
      fetchAssignments();
    }
  }, [filterYear, filterStudy]);

  // When study changes in form, fetch relevant subjects and groups
  useEffect(() => {
    if (formData.iesEstudioId) {
      fetchSubjectsAndGroups(formData.iesEstudioId);
    } else {
      setSubjects([]);
      setGroups([]);
    }
  }, [formData.iesEstudioId]);

  const fetchInitialData = async () => {
    if (!activeIesId) return;
    setLoading(true);
    try {
      // 1. User Profile & Dept
      const userDoc = await getDoc(doc(db, 'usuarios', auth.currentUser.uid));
      const profile = userDoc.data();
      setUserProfile(profile);
      const myRole = profile.roles?.find(r => r.rol === activeRole && r.iesId === activeIesId);
      const myDept = myRole?.departamento;
      setUserDept(myDept || '');

      // 2. Fetch Academic Years
      const qYears = query(collection(db, 'cursos_academicos'), where('iesId', '==', activeIesId));
      const snapYears = await getDocs(qYears);
      const yearsData = snapYears.docs.map(d => ({ id: d.id, ...d.data() }));
      yearsData.sort((a, b) => b.añoInicio - a.añoInicio);
      setAcademicYears(yearsData);
      if (yearsData.length > 0) setFilterYear(yearsData[0].id);

      // 3. Fetch Studies of this Dept
      const qStudies = query(collection(db, 'ies_estudios'), where('iesId', '==', activeIesId));
      const snapStudies = await getDocs(qStudies);
      const studiesData = snapStudies.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.departamentos?.includes(myDept));
      setStudies(studiesData);
      if (studiesData.length > 0) setFilterStudy(studiesData[0].id);

      // 4. Fetch Professors of this Dept
      // Note: We need a complex filter here, or fetch all and filter in memory if the list is small
      const qProfs = query(collection(db, 'usuarios'), where('iesIds', 'array-contains', activeIesId));
      const snapProfs = await getDocs(qProfs);
      const profsData = snapProfs.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.roles?.some(r => r.rol === 'profesor' && r.iesId === activeIesId && r.departamento === myDept));
      setProfessors(profsData);

    } catch (error) {
      console.error("Error fetching teaching initial data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjectsAndGroups = async (studyId) => {
    try {
      // Fetch Subjects for this study
      const qSub = query(collection(db, 'ies_asignaturas'), where('iesEstudioId', '==', studyId));
      const snapSub = await getDocs(qSub);
      setSubjects(snapSub.docs.map(d => ({ id: d.id, ...d.data() })));

      // Fetch Groups for this study
      const qGrp = query(collection(db, 'ies_grupos'), where('iesEstudioId', '==', studyId));
      const snapGrp = await getDocs(qGrp);
      setGroups(snapGrp.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching subjects/groups for study:", error);
    }
  };

  const fetchAssignments = async () => {
    if (!activeIesId || !filterYear) return;
    try {
      let q = query(
        collection(db, 'ies_imparticiones'),
        where('iesId', '==', activeIesId),
        where('cursoAcademicoId', '==', filterYear)
      );

      if (filterStudy) {
        q = query(q, where('iesEstudioId', '==', filterStudy));
      } else {
        // Filter by user department if no specific study is selected
        q = query(q, where('departamento', '==', userDept));
      }

      const snap = await getDocs(q);
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching assignments:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.usuarioId || !formData.asignaturaId || !formData.grupoId) {
      setModal({ isOpen: true, title: 'Error', message: 'Por favor, selecciona profesor, asignatura y grupo.' });
      return;
    }

    setIsProcessing(true);
    try {
      const prof = professors.find(p => p.id === formData.usuarioId);
      const sub = subjects.find(s => s.id === formData.asignaturaId);
      const grp = groups.find(g => g.id === formData.grupoId);
      const year = academicYears.find(y => y.id === formData.cursoAcademicoId);
      const study = studies.find(s => s.id === formData.iesEstudioId);

      // Generate ID Label: 2526_DAW1_LM_Garay
      // 1. Year Digits: "2025-2026" -> "2526"
      const yearParts = year.nombre.split(/[-\/]/);
      const yearDigits = yearParts.map(p => p.trim().slice(-2)).join('');
      
      // 2. StudyGroupSigla: e.g. "DAW" + "1" -> "DAW1"
      const studySigla = study.nombre.split(' - ')[0] || 'STD';
      const groupLevel = grp.nombre.match(/\d/)?.[0] || '';
      const studyGroupLabel = `${studySigla}${groupLevel}`;

      // 3. Subject Sigla: sub.sigla
      const subSigla = sub.sigla;

      // 4. Professor Initials: Initial of Name + Initial of First Surname
      const nameInitial = prof.nombre.trim().charAt(0).toUpperCase();
      const surnameInitial = prof.apellidos.trim().charAt(0).toUpperCase();
      const profInitials = `${nameInitial}${surnameInitial}`;

      const generatedLabel = `${yearDigits}_${studyGroupLabel}_${subSigla}_${profInitials}`;

      // Logical Duplicate Check: Same Year, Group and Subject in the same IES
      const qLogical = query(
        collection(db, 'ies_imparticiones'),
        where('iesId', '==', activeIesId),
        where('cursoAcademicoId', '==', formData.cursoAcademicoId),
        where('grupoId', '==', formData.grupoId),
        where('asignaturaId', '==', formData.asignaturaId),
        limit(1)
      );
      const snapLogical = await getDocs(qLogical);
      
      if (!snapLogical.empty) {
        const existing = { id: snapLogical.docs[0].id, ...snapLogical.docs[0].data() };
        
        // Case 1: Same professor
        if (existing.usuarioId === formData.usuarioId) {
          setModal({ 
            isOpen: true, 
            title: 'Asignación Existente', 
            message: `Este profesor ya tiene asignada esta materia para este grupo.` 
          });
          setIsProcessing(false);
          return;
        }

        // Case 2: Different professor -> Check for items
        const hasItems = await checkIfHasItems(existing.id);
        
        if (hasItems) {
          setModal({
            isOpen: true,
            title: 'Conflicto de Asignación',
            message: `Esta impartición ya está asignada a ${existing.profesorNombre} y ya contiene datos asociados (horario o temas). No se puede reasignar automáticamente para evitar pérdida de datos.`
          });
        } else {
          setConflictModal({
            isOpen: true,
            existingAssignment: existing,
            hasItems: false,
            message: `Esta impartición ya está asignada a ${existing.profesorNombre}. Al no tener datos asociados (sin horario ni temas), puedes reasignarla. ¿Deseas borrar la asignación anterior y crear esta nueva?`
          });
        }
        setIsProcessing(false);
        return;
      }

      await completeAssignment();
    } catch (error) {
      console.error("Error creating assignment:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudo crear la impartición.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const checkIfHasItems = async (assignmentId) => {
    try {
      // Check Horarios
      const hSnap = await getDoc(doc(db, 'profesor_horarios', assignmentId));
      if (hSnap.exists()) return true;

      // Check Programaciones (if has themes)
      const pSnap = await getDoc(doc(db, 'profesor_programaciones', assignmentId));
      if (pSnap.exists()) {
        const data = pSnap.data();
        if (data.temas && data.temas.length > 0) return true;
      }
      return false;
    } catch (e) {
      console.error("Error checking items:", e);
      return false;
    }
  };

  const completeAssignment = async (assignmentToDeleteId = null) => {
    try {
      if (assignmentToDeleteId) {
        await deleteDoc(doc(db, 'ies_imparticiones', assignmentToDeleteId));
      }

      const prof = professors.find(p => p.id === formData.usuarioId);
      const sub = subjects.find(s => s.id === formData.asignaturaId);
      const grp = groups.find(g => g.id === formData.grupoId);
      const year = academicYears.find(y => y.id === formData.cursoAcademicoId);
      const study = studies.find(s => s.id === formData.iesEstudioId);

      const yearParts = year.nombre.split(/[-\/]/);
      const yearDigits = yearParts.map(p => p.trim().slice(-2)).join('');
      const studySigla = study.nombre.split(' - ')[0] || 'STD';
      const groupLevel = grp.nombre.match(/\d/)?.[0] || '';
      const studyGroupLabel = `${studySigla}${groupLevel}`;
      const subSigla = sub.sigla;
      const nameInitial = prof.nombre.trim().charAt(0).toUpperCase();
      const surnameInitial = prof.apellidos.trim().charAt(0).toUpperCase();
      const profInitials = `${nameInitial}${surnameInitial}`;
      const generatedLabel = `${yearDigits}_${studyGroupLabel}_${subSigla}_${profInitials}`;

      const assignmentData = {
        iesId: activeIesId,
        label: generatedLabel,
        cursoAcademicoId: formData.cursoAcademicoId,
        cursoAcademicoLabel: year.nombre,
        iesEstudioId: formData.iesEstudioId,
        titulacionNombre: study.nombre,
        usuarioId: formData.usuarioId,
        profesorNombre: `${prof.nombre} ${prof.apellidos}`,
        asignaturaId: formData.asignaturaId,
        asignaturaNombre: sub.nombre,
        asignaturaSigla: sub.sigla,
        grupoId: formData.grupoId,
        grupoNombre: grp.nombre,
        departamento: userProfile.roles?.find(r => r.rol === activeRole)?.departamento,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'ies_imparticiones'), assignmentData);
      setIsFormOpen(false);
      setConflictModal({ isOpen: false, existingAssignment: null, hasItems: false, message: '' });
      fetchAssignments();
      setModal({ isOpen: true, title: 'Éxito', message: 'Impartición asignada correctamente.' });
    } catch (error) {
      console.error("Error completing assignment:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudo completar la asignación.' });
    }
  };

  const handleConfirmReassign = async () => {
    if (!conflictModal.existingAssignment) return;
    setIsProcessing(true);
    await completeAssignment(conflictModal.existingAssignment.id);
    setIsProcessing(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm.assignment) return;
    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, 'ies_imparticiones', deleteConfirm.assignment.id));
      setAssignments(assignments.filter(a => a.id !== deleteConfirm.assignment.id));
      setDeleteConfirm({ isOpen: false, assignment: null });
    } catch (error) {
      console.error("Error deleting assignment:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <div style={styles.loading}>Cargando panel de imparticiones...</div>;

  return (
    <div className="animate-fade-in" style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div>
            <h1 style={styles.title}>Imparticiones</h1>
            <p style={styles.subtitle}>Gestión de asignación de carga docente del departamento</p>
          </div>
          <button className="btn-primary" onClick={() => {
            setFormData({
              cursoAcademicoId: filterYear,
              iesEstudioId: filterStudy,
              asignaturaId: '',
              grupoId: '',
              usuarioId: ''
            });
            setIsFormOpen(true);
          }} style={styles.newButton}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Nueva Impartición
          </button>
        </div>
      </header>

      {/* Filters */}
      <section className="glass-panel" style={styles.filtersPanel}>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Curso Académico</label>
          <select className="input-field" value={filterYear} onChange={e => setFilterYear(e.target.value)} style={styles.select}>
            {academicYears.map(y => <option key={y.id} value={y.id}>{y.nombre}</option>)}
          </select>
        </div>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Titulación</label>
          <select className="input-field" value={filterStudy} onChange={e => setFilterStudy(e.target.value)} style={styles.select}>
            <option value="">TODOS LOS CICLOS</option>
            {studies.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      </section>

      {/* Assignments Grid */}
      <div style={styles.grid}>
        {assignments.length === 0 ? (
          <div style={styles.emptyState}>No hay imparticiones asignadas para este filtro.</div>
        ) : (
          assignments.map(a => (
            <div key={a.id} className="glass-panel" style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.profInfo}>
                  <div style={styles.avatarMini}>{a.profesorNombre.charAt(0)}</div>
                  <div>
                    <h3 style={styles.profName}>{a.profesorNombre}</h3>
                    <p style={styles.cardSubtitle}>{a.grupoNombre}</p>
                  </div>
                </div>
                <button onClick={() => setDeleteConfirm({ isOpen: true, assignment: a })} className="btn-delete" title="Eliminar">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
              <div style={styles.cardBody}>
                <div style={styles.badgeSub}>{a.asignaturaSigla}</div>
                <div style={styles.subName}>{a.asignaturaNombre}</div>
                <div style={styles.cardLabel}>{a.label}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <Modal 
          isOpen={isFormOpen} 
          onClose={() => setIsFormOpen(false)}
          title="Nueva Asignación de Impartición"
          footer={
            <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setIsFormOpen(false)}>
                Cancelar
              </button>
              <button 
                type="submit" 
                form="teachingForm"
                className="btn-primary" 
                style={{ flex: 1 }}
                disabled={isProcessing}
              >
                {isProcessing ? 'Asignando...' : 'Asignar Impartición'}
              </button>
            </div>
          }
        >
          <form id="teachingForm" onSubmit={handleSubmit} style={styles.form}>
            <div className="form-group">
              <label>Curso Académico</label>
              <select 
                className="input-field" 
                value={formData.cursoAcademicoId} 
                onChange={e => setFormData({...formData, cursoAcademicoId: e.target.value})}
              >
                {academicYears.map(y => <option key={y.id} value={y.id}>{y.nombre}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Titulación</label>
              <select 
                className="input-field" 
                value={formData.iesEstudioId} 
                onChange={e => setFormData({...formData, iesEstudioId: e.target.value, asignaturaId: '', grupoId: ''})}
              >
                <option value="">Selecciona titulación...</option>
                {studies.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Profesor (Departamento)</label>
              <select 
                className="input-field" 
                value={formData.usuarioId} 
                onChange={e => setFormData({...formData, usuarioId: e.target.value})}
              >
                <option value="">Selecciona profesor...</option>
                {professors.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Grupo</label>
                <select 
                  className="input-field" 
                  value={formData.grupoId} 
                  onChange={e => setFormData({...formData, grupoId: e.target.value, asignaturaId: ''})}
                  disabled={!formData.iesEstudioId}
                >
                  <option value="">Grupo...</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Asignatura</label>
                <select 
                  className="input-field" 
                  value={formData.asignaturaId} 
                  onChange={e => setFormData({...formData, asignaturaId: e.target.value})}
                  disabled={!formData.grupoId}
                >
                  <option value="">Asignatura...</option>
                  {subjects
                    .filter(s => {
                      // 1. Same department (case-insensitive)
                      const sDept = s.departamento?.toLowerCase().trim();
                      const uDept = userDept?.toLowerCase().trim();
                      if (sDept !== uDept) return false;
                      
                      // 2. Same course/level as group
                      const selectedGroup = groups.find(g => g.id === formData.grupoId);
                      return selectedGroup && Number(s.curso) === Number(selectedGroup.curso);
                    })
                    .map(s => <option key={s.id} value={s.id}>{s.sigla} - {s.nombre}</option>)}
                </select>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm.isOpen && (
        <Modal 
          isOpen={deleteConfirm.isOpen} 
          onClose={() => setDeleteConfirm({ isOpen: false, assignment: null })}
          title="Confirmar Eliminación"
        >
          <p>¿Estás seguro de que deseas eliminar esta asignación docente?</p>
          <div style={styles.confirmData}>
            <strong>{deleteConfirm.assignment.profesorNombre}</strong> → {deleteConfirm.assignment.asignaturaSigla} ({deleteConfirm.assignment.grupoNombre})
          </div>
          <div className="modal-footer">
            <button className="btn-secondary" onClick={() => setDeleteConfirm({ isOpen: false, assignment: null })}>Cancelar</button>
            <button className="btn-danger" onClick={handleDelete} disabled={isProcessing}>Eliminar</button>
          </div>
        </Modal>
      )}

      {/* Info Modal */}
      {modal.isOpen && (
        <Modal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} title={modal.title}>
          <p style={{ lineHeight: '1.6' }}>{modal.message}</p>
        </Modal>
      )}

      {/* Conflict Modal */}
      {conflictModal.isOpen && (
        <Modal 
          isOpen={conflictModal.isOpen} 
          onClose={() => setConflictModal({ ...conflictModal, isOpen: false })} 
          title="Conflicto de Asignación"
          footer={
            <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setConflictModal({ ...conflictModal, isOpen: false })}>
                Cancelar
              </button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleConfirmReassign} disabled={isProcessing}>
                {isProcessing ? '...' : 'Confirmar Reasignación'}
              </button>
            </div>
          }
        >
          <p style={{ lineHeight: '1.6' }}>{conflictModal.message}</p>
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
  filtersPanel: { padding: '1.5rem', display: 'flex', gap: '2rem', marginBottom: '2rem', borderRadius: '16px' },
  filterGroup: { flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  filterLabel: { fontSize: '0.875rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  select: { width: '100%', cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' },
  card: { padding: '1.5rem', borderRadius: '20px', transition: 'all 0.3s ease', cursor: 'default', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid rgba(255, 255, 255, 0.1)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  profInfo: { display: 'flex', gap: '1rem', alignItems: 'center' },
  avatarMini: { width: '40px', height: '40px', borderRadius: '12px', background: 'var(--active-role-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '1.2rem', color: '#fff' },
  profName: { fontSize: '1.1rem', fontWeight: '700', color: '#fff' },
  cardSubtitle: { color: '#94a3b8', fontSize: '0.875rem' },
  deleteBtn: { 
    background: 'rgba(239, 68, 68, 0.1)', 
    color: '#ef4444', 
    border: 'none', 
    padding: '0.5rem', 
    borderRadius: '8px', 
    cursor: 'pointer', 
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardBody: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  badgeSub: { alignSelf: 'flex-start', padding: '0.25rem 0.75rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700', color: 'var(--active-role-color)', border: '1px solid rgba(255, 255, 255, 0.1)' },
  subName: { color: '#e2e8f0', fontSize: '0.95rem', fontWeight: '500', lineHeight: '1.4' },
  cardLabel: { fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.5rem', borderRadius: '4px', alignSelf: 'flex-start' },
  emptyState: { gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: '#94a3b8', fontSize: '1.1rem', fontStyle: 'italic' },
  loading: { padding: '4rem', textAlign: 'center', color: '#94a3b8', fontSize: '1.2rem' },
  confirmData: { margin: '1.5rem 0', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', borderLeft: '4px solid #ef4444' }
};
