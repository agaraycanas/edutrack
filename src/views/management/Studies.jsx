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
        cursos: study.cursos || study.niveles || [],
        tipo: study.tipo || 'General',
        departamentos: selectedDepartments,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'ies_estudios'), studyData);
      
      setAddModalOpen(false);
      setSearchTerm('');
      setSelectedDepartments([]);
      fetchData();
      setModal({
        isOpen: true,
        title: 'Éxito',
        message: 'Titulación añadida correctamente al centro.'
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

  const filteredGlobal = globalEstudios.filter(s => {
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

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>Oferta Educativa</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Titulaciones y niveles impartidos en el centro
          </p>
        </div>
        <button 
          id="btn-link-study"
          className="btn-primary" 
          onClick={() => setAddModalOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Vincular Titulación
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <p>Cargando oferta educativa...</p>
          </div>
                ) : iesEstudios.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center' }}>
            <div style={{ 
              width: '64px', 
              height: '64px', 
              borderRadius: '50%', 
              background: 'rgba(99, 102, 241, 0.1)', 
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem'
            }}>
              <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
            </div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No hay titulaciones vinculadas</h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 2rem' }}>
              Comienza vinculando las titulaciones que se imparten en tu centro para poder crear grupos y asignar profesores.
            </p>
            <button className="btn-primary" onClick={() => setAddModalOpen(true)}>
              Añadir mi primera titulación
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Titulación</th>
                  <th style={{ textAlign: 'left' }}>Tipo</th>
                  <th style={{ textAlign: 'left' }}>Departamentos</th>
                  <th style={{ textAlign: 'left' }}>Cursos</th>
                  <th style={{ textAlign: 'right', width: '80px' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {iesEstudios.map(study => (
                  <tr key={study.id}>
                    <td>
                      <div style={{ fontWeight: '600' }}>{study.nombre}</div>
                    </td>
                    <td>
                      <span style={{ 
                        padding: '4px 8px', 
                        borderRadius: '4px', 
                        background: 'rgba(255,255,255,0.05)', 
                        fontSize: '0.75rem',
                        border: '1px solid var(--border-color)'
                      }}>
                        {study.tipo}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {study.departamentos?.map(dept => (
                          <span key={dept} style={{ 
                            fontSize: '0.7rem', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            background: 'rgba(16, 185, 129, 0.1)', 
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.2)'
                          }}>
                            {dept}
                          </span>
                        )) || <em style={{ fontSize: '0.75rem', opacity: 0.5 }}>Sin asignar</em>}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {study.cursos?.map(curso => (
                          <span key={curso} className="badge badge-accent">
                            {curso}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {(activeRole === 'jefe_estudios' || (activeRole === 'jefe_departamento' && study.departamentos?.includes(userDept))) && (
                          <button 
                            onClick={() => requestDelete(study)}
                            className="btn-delete"
                            style={{ padding: '0.4rem', minWidth: 'auto', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '4px' }}
                            title="Desvincular titulación"
                          >
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                          </button>
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
        maxWidth="800px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {selectedDepartments.length} departamentos seleccionados
            </p>
            <button 
              className="btn-primary" 
              style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
              onClick={() => {
                setAddModalOpen(false);
                setSelectedDepartments([]);
              }}
            >
              Cerrar
            </button>
          </div>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 250px', gap: '1.5rem', alignItems: 'start' }}>
          <div style={{ padding: '0' }}>
            <div className="search-box" style={{ position: 'relative' }}>
              <svg 
                viewBox="0 0 24 24" 
                width="18" 
                height="18" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Buscar por nombre, tipo o familia..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
              {searchTerm && (
                <button 
                  className="btn-clear" 
                  onClick={() => setSearchTerm('')}
                  title="Borrar búsqueda"
                >
                  <svg 
                    viewBox="0 0 24 24" 
                    width="16" 
                    height="16" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Department Selection Sidebar */}
          <div style={{ 
            background: 'rgba(255,255,255,0.02)', 
            border: '1px solid var(--border-color)', 
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            height: '100%'
          }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--accent-primary)' }}>Asignar Departamentos</h3>
            <div style={{ maxHeight: '430px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {departments.map(dept => (
                <label key={dept} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  fontSize: '0.8rem', 
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  background: selectedDepartments.includes(dept) ? 'rgba(99, 102, 241, 0.1)' : 'transparent'
                }}>
                  <input 
                    type="checkbox" 
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
          </div>

          <div style={{ gridColumn: '1 / span 2' }}>
            <div style={{ 
              maxHeight: '350px', 
              overflowY: 'auto', 
              overflowX: 'auto',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0, 0, 0, 0.1)'
            }}>
              {filteredGlobal.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No se encontraron titulaciones.
                </div>
              ) : (
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface-color)' }}>
                    <tr>
                      <th>Nombre / Familia</th>
                      <th>Tipo</th>
                      <th style={{ textAlign: 'right' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGlobal.map(s => (
                      <tr key={s.id}>
                        <td>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{s.nombre}</div>
                          {s.familia && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.familia}</div>}
                        </td>
                        <td>
                          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{s.tipo}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            className="btn-primary" 
                            style={{ padding: '6px 16px', fontSize: '0.8rem' }}
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

            <div style={{ 
              padding: '1rem', 
              borderRadius: 'var(--radius-md)', 
              background: 'rgba(99, 102, 241, 0.05)',
              border: '1px solid rgba(99, 102, 241, 0.1)',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginTop: '1.25rem'
            }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              <p>Selecciona una titulación de la oferta oficial para incorporarla a tu centro.</p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal de Confirmación de Borrado */}
      <Modal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, study: null })}
        title="¿Desvincular Titulación?"
        footer={
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              className="btn-primary" 
              style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
              onClick={() => setDeleteConfirm({ isOpen: false, study: null })}
            >
              Cancelar
            </button>
            <button 
              className="btn-primary" 
              style={{ background: '#ef4444' }}
              onClick={handleDelete}
              disabled={isProcessing}
            >
              {isProcessing ? 'Eliminando...' : 'Sí, desvincular'}
            </button>
          </div>
        }
      >
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            background: 'rgba(239, 68, 68, 0.1)', 
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem'
          }}>
            <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </div>
          <p style={{ marginBottom: '1rem' }}>
            Estás a punto de desvincular <strong>{deleteConfirm.study?.nombre}</strong> de este centro.
          </p>
          <p style={{ fontSize: '0.9rem', color: '#ef4444' }}>
            Esta acción no se puede deshacer. Se perderá el acceso a esta titulación para crear nuevos grupos.
          </p>
        </div>
      </Modal>

      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
      >
        <p style={{ lineHeight: '1.6' }}>{modal.message}</p>
      </Modal>
    </div>
  );
}
