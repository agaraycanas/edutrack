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
  serverTimestamp 
} from 'firebase/firestore';
import Modal from '../../components/common/Modal';

export default function Studies() {
  const [iesEstudios, setIesEstudios] = useState([]);
  const [globalEstudios, setGlobalEstudios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedGlobalId, setSelectedGlobalId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const activeIesId = localStorage.getItem('activeIesId');

  useEffect(() => {
    fetchData();
  }, [activeIesId]);

  const fetchData = async () => {
    if (!activeIesId) return;
    setLoading(true);
    try {
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

    } catch (error) {
      console.error("Error fetching studies data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudyById = async (study) => {
    // Check if already linked
    if (iesEstudios.some(s => s.titulacionId === study.id)) {
      setModal({
        isOpen: true,
        title: 'Estudio Duplicado',
        message: `La titulación "${study.nombre}" ya está vinculada a este centro.`
      });
      return;
    }

    try {
      await addDoc(collection(db, 'ies_estudios'), {
        iesId: activeIesId,
        titulacionId: study.id,
        nombre: study.nombre,
        cursos: study.cursos,
        tipo: study.tipo,
        createdAt: serverTimestamp()
      });
      
      setAddModalOpen(false);
      setSearchTerm('');
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
    }
  };

  const filteredGlobal = globalEstudios.filter(s => 
    s.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.tipo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.familia && s.familia.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDelete = async (studyId) => {
     try {
      await deleteDoc(doc(db, 'ies_estudios', studyId));
      setIesEstudios(iesEstudios.filter(s => s.id !== studyId));
    } catch (error) {
      console.error("Error deleting study:", error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo eliminar la titulación.'
      });
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
          <table className="data-table">
            <thead>
              <tr>
                <th>Titulación</th>
                <th>Tipo</th>
                <th>Cursos</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
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
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {study.cursos?.map(curso => (
                        <span key={curso} style={{
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px',
                          background: 'var(--accent-primary)',
                          color: 'white',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>
                          {curso}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      className="btn-icon" 
                      onClick={() => handleDelete(study.id)}
                      style={{ color: '#ef4444' }}
                      title="Desvincular titulación"
                    >
                      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Vincular Titulación */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Vincular Nueva Titulación"
        footer={
          <button 
            className="btn-primary" 
            style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
            onClick={() => setAddModalOpen(false)}
          >
            Cancelar
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="search-box" style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Buscar por nombre, tipo o familia profesional..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>

          <div style={{ 
            maxHeight: '400px', 
            overflowY: 'auto', 
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255,255,255,0.02)'
          }}>
            {filteredGlobal.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No se encontraron titulaciones que coincidan con la búsqueda.
              </div>
            ) : (
              <table className="data-table" style={{ fontSize: '0.85rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-card)' }}>
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
                        <div style={{ fontWeight: '600' }}>{s.nombre}</div>
                        {s.familia && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{s.familia}</div>}
                      </td>
                      <td>{s.tipo}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="btn-primary" 
                          style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                          onClick={() => handleAddStudyById(s)}
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
            border: '1px solid rgba(99, 102, 241, 0.2)',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)'
          }}>
            <p>Selecciona una titulación de la lista oficial de la Comunidad de Madrid para incorporarla a tu centro.</p>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
        footer={
          <button className="btn-primary" onClick={() => setModal({ ...modal, isOpen: false })}>
            Cerrar
          </button>
        }
      >
        <p>{modal.message}</p>
      </Modal>
    </div>
  );
}
