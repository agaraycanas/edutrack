import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { calcularHorasReales, calcularDesviacion } from '../../utils/timeCalculations';
import Modal from '../../components/common/Modal';

export default function SyllabusTracking() {
  const { id } = useParams(); // imparticionId
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [programacion, setProgramacion] = useState(null);
  const [horario, setHorario] = useState(null);
  const [assignment, setAssignment] = useState(null);
  
  // Array of temas
  const [temas, setTemas] = useState([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Impartición (for labels)
      const aSnap = await getDoc(doc(db, 'ies_imparticiones', id));
      if (aSnap.exists()) setAssignment(aSnap.data());

      // 2. Fetch Programación
      const pSnap = await getDoc(doc(db, 'profesor_programaciones', id));
      if (pSnap.exists()) {
        const pData = pSnap.data();
        setProgramacion(pData);
        setTemas(pData.temas || []);
      } else {
        setModal({ isOpen: true, title: 'Error', message: 'No se encontró la programación.' });
      }

      // 3. Fetch Horario
      const hSnap = await getDoc(doc(db, 'profesor_horarios', id));
      if (hSnap.exists()) {
        setHorario(hSnap.data());
      } else {
        setModal({ isOpen: true, title: 'Aviso', message: 'No hay horario definido para esta impartición. Las horas reales no se podrán calcular.' });
      }

    } catch (error) {
      console.error("Error fetching tracking data:", error);
      setModal({ isOpen: true, title: 'Error', message: 'Ocurrió un error al cargar los datos.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (index, field, value) => {
    const newTemas = [...temas];
    newTemas[index][field] = value;
    setTemas(newTemas);
  };

  const saveChanges = async () => {
    setIsProcessing(true);
    try {
      const progRef = doc(db, 'profesor_programaciones', id);
      await updateDoc(progRef, {
        temas: temas,
        updatedAt: serverTimestamp()
      });
      setModal({ isOpen: true, title: 'Éxito', message: 'Seguimiento guardado correctamente.' });
    } catch (error) {
      console.error("Error saving tracking:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudo guardar el seguimiento.' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <div style={styles.loading}>Cargando seguimiento...</div>;

  return (
    <div className="animate-fade-in" style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              <button 
                className="btn-secondary" 
                onClick={() => navigate('/profesor/programaciones')}
                style={{ padding: '0.4rem', display: 'flex', alignItems: 'center' }}
                title="Volver"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              </button>
              <h1 style={styles.title}>Seguimiento de Programación</h1>
            </div>
            <p style={styles.subtitle}>
              {assignment?.asignaturaSigla} - {assignment?.grupoNombre} ({assignment?.cursoAcademicoLabel})
            </p>
          </div>
          <button className="btn-primary" onClick={saveChanges} disabled={isProcessing} style={styles.saveButton}>
            {isProcessing ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </header>

      <div className="glass-panel" style={{ overflowX: 'auto', borderRadius: '16px' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Tema</th>
              <th style={styles.th}>Nombre</th>
              <th style={{...styles.th, textAlign: 'center'}}>H. Estimadas</th>
              <th style={styles.th}>Fecha Inicio</th>
              <th style={styles.th}>Fecha Fin</th>
              <th style={{...styles.th, textAlign: 'center'}}>H. Reales</th>
              <th style={{...styles.th, textAlign: 'center'}}>Desviación</th>
            </tr>
          </thead>
          <tbody>
            {temas.length === 0 ? (
              <tr>
                <td colSpan="7" style={styles.emptyState}>No hay temas definidos.</td>
              </tr>
            ) : (
              temas.map((tema, index) => {
                const hReales = (tema.fechaInicio && tema.fechaFin && horario) 
                  ? calcularHorasReales(tema.fechaInicio, tema.fechaFin, horario) 
                  : 0;
                
                const desviacion = (tema.fechaInicio && tema.fechaFin && horario)
                  ? calcularDesviacion(hReales, tema.horasEstimadas)
                  : null;

                let devColor = 'inherit';
                if (desviacion !== null) {
                  devColor = desviacion < 0 ? '#10b981' : (desviacion > 0 ? '#ef4444' : '#94a3b8');
                }

                return (
                  <tr key={index} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={{ fontWeight: 'bold', color: '#94a3b8' }}>{tema.id}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ fontWeight: '500' }}>{tema.nombre}</span>
                    </td>
                    <td style={{...styles.td, textAlign: 'center'}}>
                      <span style={styles.badgeEstimadas}>{tema.horasEstimadas}h</span>
                    </td>
                    <td style={styles.td}>
                      <input 
                        type="date" 
                        className="input-field" 
                        style={{ padding: '0.4rem', fontSize: '0.85rem', maxWidth: '140px' }}
                        value={tema.fechaInicio || ''}
                        onChange={(e) => handleDateChange(index, 'fechaInicio', e.target.value)}
                      />
                    </td>
                    <td style={styles.td}>
                      <input 
                        type="date" 
                        className="input-field" 
                        style={{ padding: '0.4rem', fontSize: '0.85rem', maxWidth: '140px' }}
                        value={tema.fechaFin || ''}
                        onChange={(e) => handleDateChange(index, 'fechaFin', e.target.value)}
                      />
                    </td>
                    <td style={{...styles.td, textAlign: 'center'}}>
                      <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                        {tema.fechaInicio && tema.fechaFin ? `${hReales}h` : '-'}
                      </span>
                    </td>
                    <td style={{...styles.td, textAlign: 'center'}}>
                      <span style={{ fontWeight: '800', fontSize: '1.1rem', color: devColor }}>
                        {desviacion !== null ? (desviacion > 0 ? `+${desviacion}h` : `${desviacion}h`) : '-'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modal.isOpen && (
        <Modal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} title={modal.title}>
          <p>{modal.message}</p>
        </Modal>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '2rem', maxWidth: '1200px', margin: '0 auto' },
  header: { marginBottom: '2.5rem' },
  headerContent: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: '2rem', fontWeight: '800', margin: 0, background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle: { color: '#94a3b8', fontSize: '1.1rem', marginTop: '0.5rem', marginLeft: '3.2rem' },
  saveButton: { padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', fontWeight: '600', borderRadius: '12px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tr: { borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' },
  td: { padding: '1rem', verticalAlign: 'middle', color: '#e2e8f0' },
  badgeEstimadas: { padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 'bold' },
  emptyState: { padding: '3rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' },
  loading: { padding: '4rem', textAlign: 'center', color: '#94a3b8', fontSize: '1.2rem' }
};
