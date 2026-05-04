import { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
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
  getDoc
} from 'firebase/firestore';
import { auth } from '../../config/firebase';
import Modal from '../../components/common/Modal';

export default function Studies() {
  const [iesEstudios, setIesEstudios] = useState([]);
  const [globalEstudios, setGlobalEstudios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, study: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [userDept, setUserDept] = useState(null);
  const [editingIesStudy, setEditingIesStudy] = useState(null);
  const [customStudyModal, setCustomStudyModal] = useState(false);
  const [customStudyData, setCustomStudyData] = useState({
    nombre: '',
    tipo: 'FP Grado Superior',
    cursos: 2
  });
  const [courseSubjectsModal, setCourseSubjectsModal] = useState({ isOpen: false, study: null, curso: null, subjects: [] });

  const activeIesId = localStorage.getItem('activeIesId');
  const activeRole = localStorage.getItem('activeRole');
  
  // Helper to normalize text (remove accents/diacritics)
  const normalizeText = (text) => {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

  useEffect(() => {
    fetchData();
  }, [activeIesId, activeRole]);

  const fetchData = async () => {
    if (!activeIesId) return;
    setLoading(true);
    try {
      // Get User Profile
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, 'usuarios', auth.currentUser.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data();
          setUserProfile(profile);
          const myRoleData = profile.roles?.find(r => r.rol === activeRole && r.iesId === activeIesId);
          setUserDept(myRoleData?.departamento);
        }
      }

      const qIes = query(
        collection(db, 'ies_estudios'),
        where('iesId', '==', activeIesId)
      );
      const snapshotIes = await getDocs(qIes);
      const iesData = snapshotIes.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      iesData.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setIesEstudios(iesData);

      const qGlobal = collection(db, 'oferta_educativa');
      const snapshotGlobal = await getDocs(qGlobal);
      const globalData = snapshotGlobal.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      globalData.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setGlobalEstudios(globalData);

      // Fetch Departments
      const qDepts = query(
        collection(db, 'departamentos'),
        where('iesId', '==', activeIesId)
      );
      const snapshotDepts = await getDocs(qDepts);
      const deptsData = snapshotDepts.docs.map(doc => doc.data().nombre);
      deptsData.sort();
      setDepartments(deptsData);

    } catch (error) {
      console.error("Error fetching studies data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudyById = async (study) => {
    if (iesEstudios.some(s => s.titulacionId === study.id)) {
      setModal({
        isOpen: true,
        title: 'Estudio Duplicado',
        message: `La titulación "${study.nombre}" ya está vinculada a este centro.`
      });
      return;
    }

    if (selectedDepartments.length === 0) {
      setModal({
        isOpen: true,
        title: 'Departamento Requerido',
        message: 'Debes asignar al menos un departamento a esta titulación.'
      });
      return;
    }

    setIsProcessing(true);
    try {
      const studyData = {
        iesId: activeIesId,
        titulacionId: study.id,
        nombre: study.nombre,
        cursos: study.cursos || study.niveles || [1, 2],
        tipo: study.tipo || 'General',
        departamentos: selectedDepartments,
        createdAt: serverTimestamp()
      };

      const newStudyRef = await addDoc(collection(db, 'ies_estudios'), studyData);
      
      // Auto-create subjects if they exist in the master catalog
      if (study.asignaturas && study.asignaturas.length > 0) {
        console.log(`Auto-creando ${study.asignaturas.length} asignaturas para ${study.nombre}...`);
        
        // Fetch existing subjects for this IES and Study to avoid duplicates
        const qExisting = query(
          collection(db, 'ies_asignaturas'),
          where('iesId', '==', activeIesId),
          where('iesEstudioId', '==', newStudyRef.id)
        );
        const existingSnap = await getDocs(qExisting);
        const existingNames = new Set(existingSnap.docs.map(doc => doc.data().nombre.toLowerCase().trim()));

        for (const asig of study.asignaturas) {
          if (!existingNames.has(asig.nombre.toLowerCase().trim())) {
            await addDoc(collection(db, 'ies_asignaturas'), {
              iesId: activeIesId,
              iesEstudioId: newStudyRef.id,
              titulacionId: study.id,
              titulacionNombre: study.nombre,
              nombre: asig.nombre,
              sigla: asig.sigla || '',
              curso: asig.curso,
              // Default to the first selected department
              departamento: selectedDepartments[0] || 'General',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
        }
      }
      
      setAddModalOpen(false);
      setSearchTerm('');
      setSelectedDepartments([]);
      fetchData();
      setModal({
        isOpen: true,
        title: 'Éxito',
        message: 'Titulación vinculada y asignaturas oficiales creadas correctamente.'
      });
    } catch (error) {
      console.error("Error adding study:", error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo vincular la titulación.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateDepartments = async () => {
    if (!editingIesStudy) return;
    if (selectedDepartments.length === 0) {
      setModal({ isOpen: true, title: 'Error', message: 'Debes seleccionar al menos un departamento.' });
      return;
    }

    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'ies_estudios', editingIesStudy.id), {
        departamentos: selectedDepartments,
        updatedAt: serverTimestamp()
      });
      setEditingIesStudy(null);
      setSelectedDepartments([]);
      fetchData();
    } catch (error) {
      console.error("Error updating departments:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateCustomStudy = async (e) => {
    e.preventDefault();
    if (!customStudyData.nombre) return;
    if (selectedDepartments.length === 0) {
      setModal({ isOpen: true, title: 'Error', message: 'Asigna al menos un departamento.' });
      return;
    }

    setIsProcessing(true);
    try {
      const cursosArr = Array.from({ length: parseInt(customStudyData.cursos) }, (_, i) => i + 1);
      const studyData = {
        iesId: activeIesId,
        titulacionId: `custom_${Date.now()}`,
        nombre: customStudyData.nombre,
        cursos: cursosArr,
        tipo: customStudyData.tipo,
        departamentos: selectedDepartments,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'ies_estudios'), studyData);
      setCustomStudyModal(false);
      setAddModalOpen(false);
      setSelectedDepartments([]);
      fetchData();
    } catch (error) {
      console.error("Error creating custom study:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCourseClick = async (study, curso) => {
    setCourseSubjectsModal({ isOpen: true, study, curso, subjects: [], loading: true });
    try {
      const q = query(
        collection(db, 'ies_asignaturas'),
        where('iesId', '==', activeIesId),
        where('iesEstudioId', '==', study.id),
        where('curso', '==', parseInt(curso))
      );
      const snap = await getDocs(q);
      const subjects = snap.docs.map(doc => doc.data());
      subjects.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setCourseSubjectsModal(prev => ({ ...prev, subjects, loading: false }));
    } catch (error) {
      console.error("Error fetching course subjects:", error);
      setCourseSubjectsModal(prev => ({ ...prev, loading: false }));
    }
  };

  const filteredGlobal = globalEstudios.filter(s => {
    if (!searchTerm) return true;
    const term = normalizeText(searchTerm);
    return (
      normalizeText(s.nombre).includes(term) ||
      normalizeText(s.tipo).includes(term) ||
      (s.familia && normalizeText(s.familia).includes(term))
    );
  });

  const requestDelete = async (study) => {
    // Check for dependent groups
    try {
      const qGroups = query(
        collection(db, 'ies_grupos'),
        where('titulacionId', '==', study.titulacionId),
        where('iesId', '==', activeIesId)
      );
      const snapshotGroups = await getDocs(qGroups);
      
      if (!snapshotGroups.empty) {
        setModal({
          isOpen: true,
          title: 'No se puede eliminar',
          message: `La titulación "${study.nombre}" tiene grupos asignados. Debes eliminar primero todos los grupos asociados.`
        });
        return;
      }

      setDeleteConfirm({ isOpen: true, study });
    } catch (error) {
      console.error("Error checking groups:", error);
      setDeleteConfirm({ isOpen: true, study }); // Fallback if check fails
    }
  };

  const handleDelete = async () => {
    const studyId = deleteConfirm.study.id;
    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, 'ies_estudios', studyId));
      setIesEstudios(iesEstudios.filter(s => s.id !== studyId));
      setDeleteConfirm({ isOpen: false, study: null });
    } catch (error) {
      console.error("Error deleting study:", error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo eliminar la titulación.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const openEditDepartments = (study) => {
    setEditingIesStudy(study);
    setSelectedDepartments(study.departamentos || []);
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Oferta Educativa</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '1.1rem' }}>
            Titulaciones y niveles impartidos en el centro
          </p>
        </div>
        <button 
          id="btn-link-study"
          className="btn-primary" 
          onClick={() => {
            setSearchTerm('');
            setSelectedDepartments([]);
            setAddModalOpen(true);
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.85rem 1.5rem', borderRadius: '12px' }}
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Vincular Titulación
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center' }}>
            <div className="loader" style={{ margin: '0 auto mb-4' }}></div>
            <p style={{ color: 'var(--text-secondary)' }}>Cargando oferta educativa...</p>
          </div>
        ) : iesEstudios.length === 0 ? (
          <div style={{ padding: '5rem', textAlign: 'center' }}>
            <div style={{ 
              width: '80px', 
              height: '80px', 
              borderRadius: '50%', 
              background: 'rgba(99, 102, 241, 0.1)', 
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 2rem'
            }}>
              <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
            </div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: '700' }}>No hay titulaciones vinculadas</h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto 2.5rem', fontSize: '1.1rem', lineHeight: '1.6' }}>
              Comienza vinculando las titulaciones que se imparten en tu centro para poder crear grupos y asignar profesores.
            </p>
            <button className="btn-primary" onClick={() => setAddModalOpen(true)} style={{ padding: '1rem 2rem' }}>
              Vincular mi primera titulación
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '1.25rem 1.5rem' }}>Titulación</th>
                  <th style={{ textAlign: 'left' }}>Tipo</th>
                  <th style={{ textAlign: 'left' }}>Departamentos</th>
                  <th style={{ textAlign: 'left' }}>Cursos</th>
                  <th style={{ textAlign: 'right', width: '120px', paddingRight: '1.5rem' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {iesEstudios.map(study => (
                  <tr key={study.id}>
                    <td style={{ padding: '1.25rem 1.5rem' }}>
                      <div style={{ fontWeight: '700', fontSize: '1.05rem', color: '#fff' }}>{study.nombre}</div>
                    </td>
                    <td>
                      <span style={{ 
                        padding: '4px 10px', 
                        borderRadius: '6px', 
                        background: 'rgba(255,255,255,0.05)', 
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: 'var(--text-secondary)',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}>
                        {study.tipo}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {study.departamentos?.map(dept => (
                          <span key={dept} style={{ 
                            fontSize: '0.75rem', 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            background: 'rgba(16, 185, 129, 0.1)', 
                            color: '#10b981',
                            fontWeight: '600',
                            border: '1px solid rgba(16, 185, 129, 0.2)'
                          }}>
                            {dept}
                          </span>
                        )) || <em style={{ fontSize: '0.8rem', opacity: 0.5 }}>Sin asignar</em>}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {study.cursos?.map(curso => (
                          <button 
                            key={curso} 
                            onClick={() => handleCourseClick(study, curso)}
                            className="badge-interactive"
                            style={{ 
                              width: '32px', 
                              height: '32px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              borderRadius: '10px',
                              background: 'rgba(99, 102, 241, 0.15)',
                              color: 'var(--accent-primary)',
                              border: '1px solid rgba(99, 102, 241, 0.3)',
                              fontWeight: '700',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {curso}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', verticalAlign: 'middle', paddingRight: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem' }}>
                        {(activeRole === 'jefe_estudios' || activeRole === 'superadmin') && (
                          <>
                            <button 
                              onClick={() => openEditDepartments(study)}
                              className="btn-secondary"
                              style={{ padding: '0.5rem', minWidth: 'auto', borderRadius: '8px' }}
                              title="Editar departamentos"
                            >
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button 
                              onClick={() => requestDelete(study)}
                              className="btn-delete"
                              style={{ padding: '0.5rem', minWidth: 'auto', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '8px' }}
                              title="Desvincular titulación"
                            >
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Vincular Titulación */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Vincular Nueva Titulación"
        maxWidth="900px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="search-box" style={{ position: 'relative' }}>
                <svg 
                  viewBox="0 0 24 24" 
                  width="18" 
                  height="18" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2.5" 
                  style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }}
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input 
                  type="text" 
                  className="input-field" 
                  style={{ paddingLeft: '2.75rem' }}
                  placeholder="Buscar por nombre, tipo o familia..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ 
                height: '400px', 
                overflowY: 'auto', 
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                background: 'rgba(0, 0, 0, 0.2)'
              }}>
                {filteredGlobal.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>No se encontraron titulaciones oficiales.</p>
                    <button className="btn-secondary" onClick={() => setCustomStudyModal(true)}>
                      + Crear titulación personalizada
                    </button>
                  </div>
                ) : (
                  <table className="data-table" style={{ fontSize: '0.9rem' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#1a1b23' }}>
                      <tr>
                        <th style={{ padding: '1rem' }}>Nombre / Familia</th>
                        <th>Tipo</th>
                        <th style={{ textAlign: 'right', paddingRight: '1rem' }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGlobal.map(s => (
                        <tr key={s.id}>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: '600', color: '#fff' }}>{s.nombre}</div>
                            {s.familia && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.familia}</div>}
                          </td>
                          <td>
                            <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{s.tipo}</span>
                          </td>
                          <td style={{ textAlign: 'right', paddingRight: '1rem' }}>
                            <button 
                              className="btn-primary" 
                              style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '8px' }}
                              onClick={() => handleAddStudyById(s)}
                              disabled={isProcessing}
                            >
                              Vincular
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div style={{ 
              background: 'rgba(255,255,255,0.02)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: '16px',
              padding: '1.5rem',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: '1.25rem', color: 'var(--accent-primary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Asignar Departamentos</h3>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.5rem' }}>
                {departments.map(dept => (
                  <label key={dept} className="checkbox-container" style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    fontSize: '0.85rem', 
                    cursor: 'pointer',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: selectedDepartments.includes(dept) ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid',
                    borderColor: selectedDepartments.includes(dept) ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                    transition: 'all 0.2s'
                  }}>
                    <input 
                      type="checkbox" 
                      style={{ width: '16px', height: '16px' }}
                      checked={selectedDepartments.includes(dept)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDepartments([...selectedDepartments, dept]);
                        } else {
                          setSelectedDepartments(selectedDepartments.filter(d => d !== dept));
                        }
                      }}
                    />
                    {dept}
                  </label>
                ))}
              </div>
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {selectedDepartments.length} departamentos seleccionados
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button className="btn-secondary" onClick={() => setAddModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={() => setCustomStudyModal(true)}>+ Titulación Personalizada</button>
          </div>
        </div>
      </Modal>

      {/* Modal Editar Departamentos */}
      <Modal
        isOpen={!!editingIesStudy}
        onClose={() => setEditingIesStudy(null)}
        title={`Departamentos: ${editingIesStudy?.nombre}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Selecciona los departamentos que imparten docencia en esta titulación:</p>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '0.75rem', 
            maxHeight: '400px', 
            overflowY: 'auto',
            padding: '0.5rem'
          }}>
            {departments.map(dept => (
              <label key={dept} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px', 
                fontSize: '0.85rem', 
                padding: '10px',
                borderRadius: '8px',
                background: selectedDepartments.includes(dept) ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.03)',
                border: '1px solid',
                borderColor: selectedDepartments.includes(dept) ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                cursor: 'pointer'
              }}>
                <input 
                  type="checkbox" 
                  checked={selectedDepartments.includes(dept)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedDepartments([...selectedDepartments, dept]);
                    else setSelectedDepartments(selectedDepartments.filter(d => d !== dept));
                  }}
                />
                {dept}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setEditingIesStudy(null)}>Cancelar</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={handleUpdateDepartments} disabled={isProcessing}>
              {isProcessing ? 'Guardando...' : 'Actualizar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Crear Titulación Personalizada */}
      <Modal
        isOpen={customStudyModal}
        onClose={() => setCustomStudyModal(false)}
        title="Nueva Titulación Personalizada"
      >
        <form onSubmit={handleCreateCustomStudy} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Nombre de la titulación</label>
            <input 
              type="text" 
              className="input-field"
              placeholder="Ej: Curso de Especialización en IA..."
              value={customStudyData.nombre}
              onChange={e => setCustomStudyData({...customStudyData, nombre: e.target.value})}
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Tipo</label>
              <select 
                className="input-field"
                value={customStudyData.tipo}
                onChange={e => setCustomStudyData({...customStudyData, tipo: e.target.value})}
              >
                <option value="FP Grado Superior">FP Grado Superior</option>
                <option value="FP Grado Medio">FP Grado Medio</option>
                <option value="FP Grado Básico">FP Grado Básico</option>
                <option value="Bachillerato">Bachillerato</option>
                <option value="Secundaria">Secundaria</option>
                <option value="Especialización">Especialización</option>
                <option value="Otros">Otros</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Cursos</label>
              <select 
                className="input-field"
                value={customStudyData.cursos}
                onChange={e => setCustomStudyData({...customStudyData, cursos: e.target.value})}
              >
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div style={{ background: 'rgba(99, 102, 241, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>Nota:</strong> Al ser personalizada, se utilizarán los departamentos que tengas seleccionados en el panel anterior ({selectedDepartments.length}).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setCustomStudyModal(false)}>Atrás</button>
            <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isProcessing}>
              {isProcessing ? 'Creando...' : 'Crear y Vincular'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Detalle de Asignaturas por Curso */}
      <Modal
        isOpen={courseSubjectsModal.isOpen}
        onClose={() => setCourseSubjectsModal({ ...courseSubjectsModal, isOpen: false })}
        title={`${courseSubjectsModal.curso}º Curso - ${courseSubjectsModal.study?.nombre}`}
        maxWidth="600px"
      >
        <div style={{ minHeight: '200px' }}>
          {courseSubjectsModal.loading ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <div className="loader" style={{ margin: '0 auto' }}></div>
              <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Cargando asignaturas...</p>
            </div>
          ) : courseSubjectsModal.subjects.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No hay asignaturas creadas para este curso todavía.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {courseSubjectsModal.subjects.map((sub, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '1rem', 
                  background: 'rgba(255,255,255,0.03)', 
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <div>
                    <div style={{ fontWeight: '600', color: '#fff' }}>{sub.nombre}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: '700' }}>{sub.sigla}</div>
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    padding: '4px 10px', 
                    borderRadius: '6px', 
                    background: 'rgba(16, 185, 129, 0.1)', 
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.2)'
                  }}>
                    {sub.departamento}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: '2rem', textAlign: 'right' }}>
            <button className="btn-primary" onClick={() => setCourseSubjectsModal({ ...courseSubjectsModal, isOpen: false })}>
              Cerrar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirmación Borrado y Mensajes */}
      <Modal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, study: null })}
        title="¿Desvincular Titulación?"
        footer={
          <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setDeleteConfirm({ isOpen: false, study: null })}>Cancelar</button>
            <button className="btn-primary" style={{ flex: 1, background: '#ef4444' }} onClick={handleDelete} disabled={isProcessing}>
              {isProcessing ? '...' : 'Sí, desvincular'}
            </button>
          </div>
        }
      >
        <p>¿Estás seguro de que quieres desvincular <strong>{deleteConfirm.study?.nombre}</strong>? No se borrará del catálogo global, pero desaparecerá de la oferta de tu centro.</p>
      </Modal>

      <Modal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} title={modal.title}>
        <p>{modal.message}</p>
      </Modal>
    </div>
  );
}
