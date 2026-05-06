import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  limit,
  setDoc
} from 'firebase/firestore';
import Modal from '../../components/common/Modal';


const getFirstSurname = (apellidos) => {
  if (!apellidos) return '';
  const parts = apellidos.trim().split(/\s+/);
  const prefixes = ['de', 'del', 'la', 'las', 'lo', 'los'];
  let firstSurnameParts = [];
  
  for (let i = 0; i < parts.length; i++) {
    firstSurnameParts.push(parts[i]);
    if (!prefixes.includes(parts[i].toLowerCase())) {
      break;
    }
  }
  return firstSurnameParts.join(' ');
};

export default function TeachingAssignments() {

  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [userDept, setUserDept] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  
  // Data for selects
  const [academicYears, setAcademicYears] = useState([]);
  const [studies, setStudies] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [groups, setGroups] = useState([]);
  const [professors, setProfessors] = useState([]);

  // Filters (initialized from localStorage if available)
  const [filterYear, setFilterYear] = useState(() => {
    const saved = localStorage.getItem('teachingFilterYear');
    return (saved && saved !== 'undefined' && saved !== 'null') ? saved : '';
  });
  const [filterStudy, setFilterStudy] = useState(() => {
    const saved = localStorage.getItem('teachingFilterStudy');
    return (saved && saved !== 'undefined' && saved !== 'null') ? saved : '';
  });
  const [searchTerm, setSearchTerm] = useState(() => {
    const saved = localStorage.getItem('teachingSearchTerm');
    return (saved && saved !== 'undefined' && saved !== 'null') ? saved : '';
  });
  
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
    if (activeIesId && userDept && filterYear) {
      fetchAssignments();
      fetchLockState();
    }
  }, [filterYear, userDept, activeIesId]);

  useEffect(() => {
    localStorage.setItem('teachingFilterYear', filterYear);
    localStorage.setItem('teachingFilterStudy', filterStudy);
    localStorage.setItem('teachingSearchTerm', searchTerm);
  }, [filterYear, filterStudy, searchTerm]);

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
      if (yearsData.length > 0 && !filterYear) setFilterYear(yearsData[0].id);

      // 3. Fetch Studies of this Dept
      const qStudies = query(collection(db, 'ies_estudios'), where('iesId', '==', activeIesId));
      const snapStudies = await getDocs(qStudies);
      const studiesData = snapStudies.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.departamentos?.includes(myDept));
      setStudies(studiesData);
      
      // Default to "TODOS LOS CICLOS" if not already set by localStorage
      if (!filterStudy) setFilterStudy('');

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

  const fetchLockState = async () => {
    if (!activeIesId || !userDept) return;
    try {
      const configRef = doc(db, 'ies_departamento_config', `${activeIesId}_${userDept}`);
      const configSnap = await getDoc(configRef);
      if (configSnap.exists()) {
        setIsLocked(configSnap.data().isProgrammingLocked || false);
      }
    } catch (error) {
      console.error("Error fetching lock state:", error);
    }
  };

  const toggleLock = async () => {
    if (!activeIesId || !userDept) return;
    const newState = !isLocked;
    setIsProcessing(true);
    try {
      const configRef = doc(db, 'ies_departamento_config', `${activeIesId}_${userDept}`);
      await setDoc(configRef, {
        isProgrammingLocked: newState,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid
      }, { merge: true });
      setIsLocked(newState);
      setModal({ 
        isOpen: true, 
        title: newState ? 'Programación Bloqueada' : 'Programación Desbloqueada', 
        message: newState 
          ? 'Los profesores ya no podrán añadir, eliminar o renombrar temas en sus programaciones.' 
          : 'Los profesores ahora pueden volver a editar la estructura de sus programaciones.' 
      });
    } catch (error) {
      console.error("Error toggling lock:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudo cambiar el estado del bloqueo.' });
    } finally {
      setIsProcessing(false);
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
    if (!activeIesId || !filterYear || !userDept) return;
    setAssignments([]); // Clear to avoid showing stale data during fetch
    try {
      const q = query(
        collection(db, 'ies_imparticiones'),
        where('iesId', '==', activeIesId),
        where('cursoAcademicoId', '==', filterYear),
        where('departamento', '==', userDept)
      );

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

  useEffect(() => {
    if (studies.length > 0 && filterStudy && filterStudy !== '') {
      const exists = studies.some(s => String(s.id) === String(filterStudy));
      if (!exists) setFilterStudy('');
    }
  }, [studies, filterStudy]);

  const filteredAssignments = assignments
    .filter(a => {
      // 1. Titulación (Study) Filter
      if (filterStudy && filterStudy !== '' && filterStudy !== 'all') {
        const activeFilterId = String(filterStudy).trim();
        const selectedStudy = studies.find(s => String(s.id) === activeFilterId);
        
        // Double-check: If we have a selected study name (e.g. "DAW"), 
        // ensure the row doesn't explicitly belong to another one.
        if (selectedStudy) {
          const selectedPrefix = selectedStudy.nombre.split(' - ')[0].trim(); // e.g. "DAW"
          
          // If the group name has a different prefix (e.g. "DAM" vs "DAW"), hide it
          const rowGroupPrefix = a.grupoNombre?.match(/^[A-Z]+/)?.[0];
          if (selectedPrefix && rowGroupPrefix && rowGroupPrefix !== selectedPrefix) {
            return false;
          }

          // If the titration name is different, hide it
          if (a.titulacionNombre && a.titulacionNombre !== selectedStudy.nombre) {
            // Only hide if the names are strictly different and not substrings
            if (!a.titulacionNombre.includes(selectedPrefix)) return false;
          }
        }

        // Standard ID match as fallback/primary check
        const rowStudyId = String(a.iesEstudioId || '').trim();
        if (rowStudyId !== activeFilterId) return false;
      }

      // 2. Búsqueda rápida (Multi-term AND)
      const normalizedSearch = (searchTerm || '').trim().toLowerCase();
      if (normalizedSearch) {
        const terms = normalizedSearch.split(/\s+/).filter(t => t.length > 0);
        const searchableText = `${a.profesorNombre} ${a.asignaturaNombre} ${a.asignaturaSigla} ${a.grupoNombre} ${a.titulacionNombre}`.toLowerCase();
        if (!terms.every(term => searchableText.includes(term))) return false;
      }

      return true;
    })
    .sort((a, b) => {
      // Sort by group name first (e.g. DAW1D, DAW2D)
      const groupCompare = (a.grupoNombre || '').localeCompare(b.grupoNombre || '');
      if (groupCompare !== 0) return groupCompare;
      // Then by subject initials (e.g. LM, PROG)
      return (a.asignaturaSigla || '').localeCompare(b.asignaturaSigla || '');
    });

  if (loading) return <div style={styles.loading}>Cargando panel de imparticiones...</div>;

  return (
    <div className="animate-fade-in" style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div>
            <h1 style={styles.title}>Imparticiones</h1>
            <p style={styles.subtitle}>Gestión de asignación de carga docente del departamento</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div 
              onClick={toggleLock}
              style={{
                ...styles.lockToggle,
                background: isLocked ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                borderColor: isLocked ? '#ef4444' : '#10b981',
                color: isLocked ? '#ef4444' : '#10b981'
              }}
              title={isLocked ? "Desbloquear edición para profesores" : "Bloquear edición para profesores"}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}>
                {isLocked ? (
                  <path d="M7 11V7a5 5 0 0 1 10 0v4M12 11v4M8 11h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z" />
                ) : (
                  <path d="M7 11V7a5 5 0 0 1 9.9-1M12 11v4M8 11h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z" />
                )}
              </svg>
              {isLocked ? 'Edición Bloqueada' : 'Edición Habilitada'}
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
        </div>
      </header>

      {/* Filters */}
      <section className="glass-panel" style={styles.filtersPanel}>
        <div style={styles.filtersRow}>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Curso</label>
            <select className="input-field" value={filterYear} onChange={e => setFilterYear(e.target.value)} style={styles.select}>
              {academicYears.map(y => <option key={y.id} value={y.id}>{y.nombre}</option>)}
            </select>
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Titulación</label>
            <div style={{ position: 'relative' }}>
              <select className="input-field" value={filterStudy} onChange={e => setFilterStudy(e.target.value)} style={{ ...styles.select, paddingRight: filterStudy ? '2.5rem' : '1rem' }}>
                <option value="">TODOS LOS CICLOS</option>
                {studies.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              {filterStudy && (
                <button 
                  onClick={() => setFilterStudy('')}
                  style={styles.clearButton}
                  className="hover-bg-soft"
                  title="Limpiar filtro"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div style={{ ...styles.filterGroup, flex: 1.5 }}>
            <label style={styles.filterLabel}>Búsqueda rápida</label>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Profesor, asignatura, grupo..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                style={{ ...styles.select, paddingLeft: '2.5rem', paddingRight: searchTerm ? '2.5rem' : '1rem' }} 
              />
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#64748b" strokeWidth="2.5" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  style={styles.clearButton}
                  className="hover-bg-soft"
                  title="Limpiar búsqueda"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
        <div style={styles.counterRow}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'inline-flex', alignItems: 'center' }}>
            <strong style={{ fontSize: '1rem', marginRight: '6px', color: 'var(--accent-primary)' }}>{filteredAssignments.length}</strong>
            <span style={{ opacity: 0.8, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>seleccionadas</span>
          </div>
        </div>
      </section>

      {/* Assignments List */}
      <div className="glass-panel" style={styles.mainPanel}>
        {filteredAssignments.length === 0 ? (
          <div style={styles.emptyState}>No hay imparticiones que coincidan con la búsqueda.</div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh', width: '100%' }}>
            <table className="data-table" style={{ width: '100%', minWidth: '500px', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', width: '35%', fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PROFESOR</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.6rem', width: '15%', fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ASIG.</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.6rem', width: '20%', fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>GRUPO</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0.6rem', width: '30%', fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <div style={styles.profInfoCell}>
                        {professors.find(p => p.id === a.usuarioId)?.foto ? (
                          <img 
                            src={professors.find(p => p.id === a.usuarioId).foto} 
                            alt={a.profesorNombre} 
                            style={styles.avatarMini} 
                          />
                        ) : (
                          <div style={styles.avatarMini}>{a.profesorNombre.charAt(0)}</div>
                        )}
                        )}
                        <span style={{ fontWeight: '600', fontSize: '0.8rem' }}>
                          {a.profesorNombre}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                      <span 
                        className="badge badge-accent" 
                        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--active-role-color)', cursor: 'help', fontSize: '0.65rem', padding: '0.15rem 0.35rem' }}
                        title={a.asignaturaNombre}
                      >
                        {a.asignaturaSigla}
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <div style={{ fontWeight: '600', fontSize: '0.8rem', color: '#94a3b8' }}>{a.grupoNombre}</div>
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.4rem 0.6rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}>
                        <button 
                          onClick={() => navigate(`/profesor/programaciones/${a.id}/seguimiento?readOnly=true`)}
                          className="btn-secondary"
                          style={{ padding: '0.4rem', minWidth: 'auto' }}
                          title="Ver seguimiento"
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                        </button>
                        <button 
                          onClick={() => setDeleteConfirm({ isOpen: true, assignment: a })} 
                          className="btn-delete"
                          style={{ padding: '0.4rem', minWidth: 'auto', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '4px' }}
                          title="Eliminar"
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
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
  title: { fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.5rem', background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle: { color: '#94a3b8', fontSize: '1.1rem' },
  newButton: { padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', fontWeight: '600', borderRadius: '12px' },
  lockToggle: { 
    display: 'flex', 
    alignItems: 'center', 
    padding: '0.75rem 1.25rem', 
    borderRadius: '12px', 
    border: '1px solid',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '700',
    transition: 'all 0.2s ease',
    userSelect: 'none'
  },
  filtersPanel: { padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem', borderRadius: '16px' },
  filtersRow: { display: 'flex', gap: '1.5rem', width: '100%' },
  filterGroup: { flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  filterLabel: { fontSize: '0.8rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  select: { width: '100%', cursor: 'pointer', fontSize: '0.9rem' },
  mainPanel: { padding: '1.5rem', borderRadius: '20px' },
  profInfoCell: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  avatarMini: { width: '28px', height: '28px', borderRadius: '6px', background: 'var(--active-role-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.8rem', color: '#fff', objectFit: 'cover' },
  codeLabel: { fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.5rem', borderRadius: '4px' },
  emptyState: { textAlign: 'center', padding: '4rem', color: '#94a3b8', fontSize: '1.1rem', fontStyle: 'italic' },
  loading: { padding: '4rem', textAlign: 'center', color: '#94a3b8', fontSize: '1.2rem' },
  confirmData: { margin: '1.5rem 0', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', borderLeft: '4px solid #ef4444' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  clearButton: {
    position: 'absolute', 
    right: '10px', 
    top: '50%', 
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: '4px',
    borderRadius: '50%',
    transition: 'all 0.2s',
    zIndex: 2
  },
  resultBadge: {
    background: 'rgba(99, 102, 241, 0.3)',
    color: '#e0e7ff',
    padding: '0.5rem 1rem',
    borderRadius: '10px',
    fontSize: '0.85rem',
    fontWeight: '700',
    border: '1px solid rgba(99, 102, 241, 0.5)',
    display: 'inline-flex',
    alignItems: 'center',
    letterSpacing: '0.02em',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
  },
  counterRow: {
    display: 'flex',
    justifyContent: 'flex-start',
    width: '100%'
  }
};
