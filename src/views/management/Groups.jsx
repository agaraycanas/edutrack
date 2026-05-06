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

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [studies, setStudies] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  
  // Filters
  const [filterYear, setFilterYear] = useState('');
  const [filterStudy, setFilterStudy] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    iesEstudioId: '',
    curso: '',
    cursoAcademicoId: ''
  });
  
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, group: null, inUse: false });

  const activeIesId = localStorage.getItem('activeIesId');
  const activeRole = localStorage.getItem('activeRole');

  useEffect(() => {
    fetchInitialData();
  }, [activeIesId, activeRole]);

  useEffect(() => {
    if (activeIesId) {
      fetchGroups();
    }
  }, [filterYear, filterStudy]);

  const fetchInitialData = async () => {
    if (!activeIesId) return;
    setLoading(true);
    try {
      // 1. Fetch User Profile
      const userDoc = await getDoc(doc(db, 'usuarios', auth.currentUser.uid));
      const profile = userDoc.data();
      setUserProfile(profile);

      // 2. Fetch Studies
      const qStudies = query(
        collection(db, 'ies_estudios'),
        where('iesId', '==', activeIesId)
      );
      const snapshotStudies = await getDocs(qStudies);
      const studiesData = snapshotStudies.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      studiesData.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setStudies(studiesData);

      // 3. Fetch Academic Years
      const qYears = query(
        collection(db, 'cursos_academicos'),
        where('iesId', '==', activeIesId)
      );
      const snapshotYears = await getDocs(qYears);
      const yearsData = snapshotYears.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      yearsData.sort((a, b) => b.añoInicio - a.añoInicio);
      setAcademicYears(yearsData);

      // Set default filters/form
      const currentYear = calculateCurrentAcademicYear();
      const defaultYear = yearsData.find(y => y.añoInicio === currentYear);
      if (defaultYear) {
        setFilterYear(defaultYear.id);
        setFormData(prev => ({ ...prev, cursoAcademicoId: defaultYear.id }));
      }

    } catch (error) {
      console.error("Error fetching initial groups data:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateCurrentAcademicYear = () => {
    const now = new Date();
    const month = now.getMonth();
    return month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  };

  const fetchGroups = async () => {
    if (!activeIesId) return;
    
    try {
      let q = query(
        collection(db, 'ies_grupos'),
        where('iesId', '==', activeIesId)
      );

      if (filterYear) q = query(q, where('cursoAcademicoId', '==', filterYear));
      if (filterStudy) q = query(q, where('iesEstudioId', '==', filterStudy));

      const snapshot = await getDocs(q);
      let groupsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Role based filtering for Department Head
      if (activeRole === 'jefe_departamento') {
        const myDept = userProfile?.roles?.find(r => r.rol === activeRole && r.iesId === activeIesId)?.departamento;
        const myDeptNorm = myDept?.toLowerCase().trim();
        
        groupsData = groupsData.filter(group => {
          const study = studies.find(s => s.id === group.iesEstudioId);
          return study?.departamentos?.some(d => d.toLowerCase().trim() === myDeptNorm);
        });
      }

      // Sorting logic: Study -> Course -> Name
      groupsData.sort((a, b) => {
        // First by study name
        const studyA = a.titulacionNombre || '';
        const studyB = b.titulacionNombre || '';
        const studyComp = studyA.localeCompare(studyB);
        if (studyComp !== 0) return studyComp;

        // Then by course (numeric)
        const cursoA = parseInt(a.curso) || 0;
        const cursoB = parseInt(b.curso) || 0;
        if (cursoA !== cursoB) return cursoA - cursoB;

        // Finally by group name
        return a.nombre.localeCompare(b.nombre, undefined, { numeric: true });
      });
      setGroups(groupsData);
    } catch (error) {
      console.error("Error fetching groups:", error);
    }
  };

  const filteredGroups = groups.filter(g => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      g.nombre.toLowerCase().includes(search) ||
      g.titulacionNombre.toLowerCase().includes(search)
    );
  });

  const handleOpenForm = (group = null) => {
    if (group) {
      setEditingGroup(group);
      setFormData({
        nombre: group.nombre,
        iesEstudioId: group.iesEstudioId,
        curso: group.curso,
        cursoAcademicoId: group.cursoAcademicoId
      });
    } else {
      setEditingGroup(null);
      setFormData({
        nombre: '',
        iesEstudioId: filterStudy || '',
        curso: '',
        cursoAcademicoId: filterYear || academicYears[0]?.id || ''
      });
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeIesId) return;

    if (!formData.nombre || !formData.iesEstudioId || !formData.curso || !formData.cursoAcademicoId) {
      setModal({
        isOpen: true,
        title: 'Campos incompletos',
        message: 'Por favor, rellena todos los campos obligatorios.'
      });
      return;
    }

    setIsProcessing(true);
    try {
      const selectedStudy = studies.find(s => s.id === formData.iesEstudioId);
      const selectedYear = academicYears.find(y => y.id === formData.cursoAcademicoId);
      const myRoleData = userProfile.roles?.find(r => r.rol === activeRole && r.iesId === activeIesId);
      const myDept = myRoleData?.departamento;

      const groupData = {
        iesId: activeIesId,
        nombre: formData.nombre.toUpperCase(),
        iesEstudioId: formData.iesEstudioId,
        titulacionNombre: selectedStudy.nombre,
        titulacionId: selectedStudy.titulacionId || formData.iesEstudioId,
        curso: parseInt(formData.curso),
        cursoAcademicoId: formData.cursoAcademicoId,
        cursoAcademicoNombre: selectedYear.nombre,
        departamento: activeRole === 'jefe_departamento' ? myDept : (selectedStudy.departamentos?.[0] || 'General'),
        updatedAt: serverTimestamp()
      };

      if (editingGroup) {
        await updateDoc(doc(db, 'ies_grupos', editingGroup.id), groupData);
      } else {
        groupData.createdAt = serverTimestamp();
        groupData.createdBy = auth.currentUser.uid;
        await addDoc(collection(db, 'ies_grupos'), groupData);
      }

      setIsFormOpen(false);
      fetchGroups();
      setModal({
        isOpen: true,
        title: editingGroup ? 'Grupo Actualizado' : 'Grupo Creado',
        message: 'Los cambios se han guardado correctamente.'
      });
    } catch (error) {
      console.error("Error saving group:", error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo guardar el grupo.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const checkIfInUse = async (groupId) => {
    try {
      // Check for students in this group
      const qStudents = query(collection(db, 'usuarios'), where('iesGrupoId', '==', groupId), limit(1));
      const snapStudents = await getDocs(qStudents);
      if (!snapStudents.empty) return true;

      // Check for subjects assigned to this group
      const qSubj = query(collection(db, 'ies_grupos_asignaturas'), where('iesGrupoId', '==', groupId), limit(1));
      const snapSubj = await getDocs(qSubj);
      if (!snapSubj.empty) return true;

      return false;
    } catch (e) {
      console.error("Error checking group usage:", e);
      return false;
    }
  };

  const handleConfirmDelete = async (group) => {
    setIsProcessing(true);
    const inUse = await checkIfInUse(group.id);
    setIsProcessing(false);
    setDeleteConfirm({ isOpen: true, group, inUse });
  };

  const handleDelete = async () => {
    if (!deleteConfirm.group || deleteConfirm.inUse) return;
    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, 'ies_grupos', deleteConfirm.group.id));
      setGroups(groups.filter(g => g.id !== deleteConfirm.group.id));
      setDeleteConfirm({ isOpen: false, group: null, inUse: false });
    } catch (error) {
      console.error("Error deleting group:", error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo eliminar el grupo.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedStudyForForm = studies.find(s => s.id === formData.iesEstudioId);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '2rem' }}>

      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.headerText}>
            <h1 style={styles.title}>Grupos</h1>
            <p style={styles.subtitle}>
              {activeRole === 'jefe_departamento' 
                ? `Gestión de grupos del departamento`
                : 'Organización de grupos y titulaciones'}
            </p>
          </div>
          <button className="btn-primary" onClick={() => handleOpenForm()} style={styles.newButton}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Nuevo Grupo
          </button>
        </div>
      </header>

      {/* Filters Section */}
      <section className="glass-panel" style={styles.filtersPanel}>
        <div style={styles.filtersRow}>
          <div style={{ ...styles.filterGroup, width: '180px' }}>
            <div style={styles.selectWrapper}>
              <select 
                className="input-field"
                value={filterYear}
                onChange={e => setFilterYear(e.target.value)}
                style={styles.select}
              >
                <option value="">AÑO ACADÉMICO</option>
                {academicYears.map(y => (
                  <option key={y.id} value={y.id}>{y.nombre}</option>
                ))}
              </select>
              {filterYear && (
                <button 
                  onClick={() => setFilterYear('')}
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

          <div style={{ ...styles.filterGroup, width: '220px' }}>
            <div style={styles.selectWrapper}>
              <select 
                className="input-field"
                value={filterStudy}
                onChange={e => setFilterStudy(e.target.value)}
                style={styles.select}
              >
                <option value="">TODAS LAS TITULACIONES</option>
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

          <div style={{ ...styles.filterGroup, flex: 1 }}>
            <div style={styles.searchWrapper}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Buscar grupo por nombre o titulación..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                style={styles.searchInput} 
              />
              <svg style={styles.searchIcon} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              
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
      </section>

      {/* Main Content Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'baseline', 
        marginBottom: '0.75rem', 
        padding: '0 0.5rem' 
      }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
          Listado de Grupos
        </h2>
        <div style={styles.resultBadge}>
          <span style={{ fontSize: '1.2rem', fontWeight: '800', marginRight: '6px' }}>{filteredGroups.length}</span>
          <span style={{ opacity: 0.8, fontSize: '0.85rem', fontWeight: '500' }}>grupos seleccionados</span>
        </div>
      </div>

      <div className="glass-panel" style={{ 
        padding: '0', 
        border: '1px solid rgba(255,255,255,0.08)', 
        overflow: 'hidden',
        borderRadius: '20px',
        background: 'rgba(255, 255, 255, 0.01)',
        boxShadow: '0 4px 24px -1px rgba(0, 0, 0, 0.2)',
        width: '100%'
      }}>

        {loading ? (
          <div style={styles.centered}>
            <div className="loader"></div>
          </div>
        ) : groups.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
            </div>
            <h3>No hay grupos para mostrar</h3>
            <p>Prueba a cambiar los filtros o crea uno nuevo.</p>
          </div>
        ) : (
          <div className="table-scroll-wrapper">
            <table className="data-table" style={{ minWidth: 'auto', width: 'max-content', tableLayout: 'fixed' }}>
              <thead>
                  <tr>
                    <th style={{ textAlign: 'left', width: '80px', padding: '0.5rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>GRUPO</th>
                    <th style={{ textAlign: 'left', width: '90px', padding: '0.5rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TITULACIÓN</th>
                    <th style={{ textAlign: 'center', width: '60px', padding: '0.5rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CURSO</th>
                    <th style={{ textAlign: 'left', width: '110px', padding: '0.5rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AÑO</th>
                    <th style={{ textAlign: 'right', width: '80px', padding: '0.5rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((group, index) => {
                    const study = studies.find(s => s.id === group.iesEstudioId);
                    const isEven = index % 2 === 0;
                    const cursoNum = parseInt(group.curso);
                    
                    // Colors for different levels
                    const levelColors = {
                      1: { bg: 'rgba(99, 102, 241, 0.15)', text: '#a5b4fc', border: 'rgba(99, 102, 241, 0.3)' },
                      2: { bg: 'rgba(16, 185, 129, 0.15)', text: '#6ee7b7', border: 'rgba(16, 185, 129, 0.3)' },
                      3: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fcd34d', border: 'rgba(245, 158, 11, 0.3)' },
                      default: { bg: 'rgba(255, 255, 255, 0.1)', text: '#ccc', border: 'rgba(255, 255, 255, 0.2)' }
                    };
                    const color = levelColors[cursoNum] || levelColors.default;

                    return (
                      <tr key={group.id} style={{ 
                        background: isEven ? 'transparent' : 'rgba(255,255,255,0.015)',
                        borderLeft: `2px solid ${color.border.replace('0.3', '0.5')}`
                      }}>
                        <td style={{ padding: '0.4rem 0.5rem' }}>
                          <div style={{ 
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px', 
                            background: color.bg, 
                            color: color.text, 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            fontWeight: '700',
                            fontSize: '0.85rem',
                            border: `1px solid ${color.border}`
                          }}>
                            {group.nombre}
                          </div>
                        </td>
                        <td style={{ padding: '0.4rem 0.5rem' }}>
                          <div 
                            style={{ 
                              fontWeight: '700', 
                              cursor: 'help',
                              fontSize: '0.8rem',
                              color: 'var(--text-primary)',
                              letterSpacing: '0.01em'
                            }} 
                            title={group.titulacionNombre}
                          >
                            {group.titulacionNombre?.split(' - ')[0] || group.nombre.replace(/[0-9].*$/, '') || '---'}
                          </div>
                        </td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                          <span style={{ 
                            fontSize: '0.85rem', 
                            fontWeight: '800',
                            color: color.text,
                            background: color.bg,
                            padding: '0.05rem 0.35rem',
                            borderRadius: '4px',
                            border: `1px solid ${color.border}`
                          }}>
                            {group.curso}º
                          </span>
                        </td>
                        <td style={{ padding: '0.4rem 0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                            {group.cursoAcademicoNombre.split(' ')[0]}
                          </span>
                        </td>
                    <td style={{ textAlign: 'right', verticalAlign: 'middle', padding: '0.4rem 0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem' }}>
                        <button 
                          onClick={() => handleOpenForm(group)}
                          className="btn-secondary"
                          style={{ padding: '0.2rem', minWidth: 'auto', borderRadius: '4px' }}
                          title="Editar grupo"
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button 
                          onClick={() => handleConfirmDelete(group)}
                          className="btn-delete"
                          style={{ padding: '0.2rem', minWidth: 'auto', width: '22px', height: '22px', borderRadius: '4px' }}
                          title="Eliminar grupo"
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                  ); })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingGroup ? "Editar Grupo" : "Nuevo Grupo"}
        footer={
          <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setIsFormOpen(false)}>
              Cancelar
            </button>
            <button 
              type="submit" 
              form="groupForm"
              className="btn-primary" 
              style={{ flex: 1 }}
              disabled={isProcessing}
            >
              {isProcessing ? 'Procesando...' : editingGroup ? 'Guardar Cambios' : 'Crear Grupo'}
            </button>
          </div>
        }
      >
        <form id="groupForm" onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formRow}>
            <div style={{ ...styles.formField, width: '120px' }}>
              <label style={styles.label}>Siglas</label>
              <input 
                type="text" 
                className="input-field"
                placeholder="DAW1"
                value={formData.nombre}
                onChange={e => setFormData({...formData, nombre: e.target.value.toUpperCase()})}
                required
              />
            </div>
            <div style={{ ...styles.formField, flex: 1 }}>
              <label style={styles.label}>Año Académico</label>
              <select 
                className="input-field"
                value={formData.cursoAcademicoId}
                onChange={e => setFormData({...formData, cursoAcademicoId: e.target.value})}
                required
              >
                <option value="">Selecciona año...</option>
                {academicYears.map(y => (
                  <option key={y.id} value={y.id}>{y.nombre}</option>
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

          <div style={styles.formField}>
            <label style={styles.label}>Curso</label>
            <select 
              className="input-field"
              value={formData.curso}
              onChange={e => setFormData({...formData, curso: e.target.value})}
              disabled={!formData.iesEstudioId}
              required
            >
              <option value="">Selecciona curso...</option>
              {selectedStudyForForm?.cursos?.map(c => (
                <option key={c} value={c}>{c}º Curso</option>
              ))}
            </select>
          </div>
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
        onClose={() => setDeleteConfirm({ isOpen: false, group: null, inUse: false })}
        title="Confirmar Eliminación"
        footer={
          <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setDeleteConfirm({ isOpen: false, group: null, inUse: false })}>
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
            <strong>No se puede eliminar</strong>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Este grupo tiene registros vinculados o asignaturas asignadas.</p>
          </div>
        ) : (
          <p>¿Estás seguro de que deseas eliminar el grupo <b>{deleteConfirm.group?.nombre}</b>?</p>
        )}
      </Modal>
    </div>
  );
}

const styles = {
  container: { maxWidth: '1200px', margin: '0 auto' },
  header: { marginBottom: '2.5rem' },
  headerContent: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' },
  headerText: {},
  title: { fontSize: '2.5rem', fontWeight: '800', background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem' },
  subtitle: { color: 'var(--text-secondary)', fontSize: '1.1rem' },
  newButton: { display: 'flex', alignItems: 'center', padding: '0.85rem 1.5rem', borderRadius: '12px', fontSize: '1rem', fontWeight: '600', boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)' },
  alertDanger: { background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', padding: '1rem', color: '#ef4444' },
  filtersPanel: { padding: '0.6rem 0.75rem', marginBottom: '1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.02)' },
  filtersRow: { display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  selectWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  select: { width: '100%', height: '36px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 1.5rem 0 0.5rem', color: 'var(--text-primary)', borderRadius: '8px' },
  searchWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  searchInput: { width: '100%', height: '36px', paddingLeft: '2.5rem', paddingRight: '2rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.85rem', color: 'var(--text-primary)', borderRadius: '8px' },
  searchIcon: { position: 'absolute', left: '1rem', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' },
  selectionCounterRow: { display: 'none' },
  resultBadge: { background: 'rgba(99, 102, 241, 0.1)', padding: '0.4rem 1rem', borderRadius: '10px', border: '1px solid rgba(99, 102, 241, 0.2)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'baseline', fontWeight: '600' },
  clearButton: { position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', width: '24px', height: '24px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s', zIndex: 2 },
  centered: { display: 'flex', justifyContent: 'center', padding: '4rem' },
  emptyState: { textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' },
  emptyIcon: { marginBottom: '1.5rem', opacity: 0.2 },
  form: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  formRow: { display: 'flex', gap: '1.5rem' },
  formField: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  label: { fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)' },
};
