import { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../config/firebase';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { calcularHorasReales, calcularDesviacion, contarSesiones } from '../../utils/timeCalculations';
import Modal from '../../components/common/Modal';

export default function SyllabusTracking() {
  const { id } = useParams(); // imparticionId
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [programacion, setProgramacion] = useState(null);
  const [horario, setHorario] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [academicYear, setAcademicYear] = useState(null);
  
  // Array of temas
  const [temas, setTemas] = useState([]);
  const [festivos, setFestivos] = useState([]);
  const [ausencias, setAusencias] = useState([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });

  const totalDesviacion = useMemo(() => {
    return temas.reduce((acc, tema) => {
      if (tema && tema.fechaInicio && tema.fechaFin && horario) {
        const duracionSesion = academicYear?.duracionSesion || 55;
        const hReales = calcularHorasReales(tema.fechaInicio, tema.fechaFin, horario, duracionSesion, festivos, ausencias);
        const estimadas = Number(tema.horasEstimadas) || 0;
        return acc + (hReales - estimadas);
      }
      return acc;
    }, 0);
  }, [temas, horario, academicYear, festivos, ausencias]);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Impartición (for labels)
      const aSnap = await getDoc(doc(db, 'ies_imparticiones', id));
      let assignmentData = null;
      if (aSnap.exists()) {
        assignmentData = aSnap.data();
        setAssignment(assignmentData);
        
        if (assignmentData.cursoAcademicoLabel) {
          // 1.1 Fetch Academic Year details
          const qYear = query(
            collection(db, 'cursos_academicos'),
            where('iesId', '==', assignmentData.iesId || activeIesId),
            where('nombre', '==', assignmentData.cursoAcademicoLabel)
          );
          const snapYear = await getDocs(qYear);
          if (!snapYear.empty) {
            setAcademicYear(snapYear.docs[0].data());
          }
        }
      }

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

      // 4. Fetch Festivos (del centro)
      const activeIesId = localStorage.getItem('activeIesId');
      if (activeIesId) {
        const qFestivos = query(collection(db, 'festivos'), where('iesId', '==', activeIesId));
        const snapFestivos = await getDocs(qFestivos);
        setFestivos(snapFestivos.docs.map(doc => doc.data()));
      }

      // 5. Fetch Ausencias (del profesor)
      if (auth.currentUser) {
        const qAusencias = query(collection(db, 'profesor_ausencias'), where('userId', '==', auth.currentUser.uid));
        const snapAusencias = await getDocs(qAusencias);
        setAusencias(snapAusencias.docs.map(doc => doc.data()));
      }

    } catch (error) {
      console.error("Error fetching tracking data:", error);
      setModal({ isOpen: true, title: 'Error', message: 'Ocurrió un error al cargar los datos.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (index, field, value) => {
    if (!temas[index]) return;
    const newTemas = [...temas];
    newTemas[index] = { ...newTemas[index], [field]: value };
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
              <h1 style={styles.title}>
                Seguimiento de Programación 
                <span style={{ 
                  marginLeft: '1rem', 
                  fontSize: '1.2rem', 
                  fontWeight: '900',
                  color: totalDesviacion < 0 ? '#10b981' : (totalDesviacion > 0 ? '#ef4444' : '#94a3b8'),
                  WebkitTextFillColor: totalDesviacion < 0 ? '#10b981' : (totalDesviacion > 0 ? '#ef4444' : '#94a3b8'),
                  textShadow: totalDesviacion !== 0 ? `0 0 15px ${totalDesviacion < 0 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}` : 'none'
                }}>
                  ({totalDesviacion > 0 ? `+${totalDesviacion}` : totalDesviacion}h)
                </span>
              </h1>
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

      <div className="glass-panel" style={{ 
        overflowX: 'auto', 
        overflowY: 'auto', 
        borderRadius: '16px',
        maxHeight: 'calc(100vh - 14rem)',
        position: 'relative'
      }}>
        <table style={styles.table}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-color)' }}>
            <tr>
              <th style={{...styles.th, background: 'rgba(255,255,255,0.03)'}}>Tema</th>
              <th style={{...styles.th, background: 'rgba(255,255,255,0.03)'}}>Nombre</th>
              <th style={{...styles.th, textAlign: 'center', background: 'rgba(255,255,255,0.03)'}}>H. Estimadas</th>
              <th style={{...styles.th, background: 'rgba(255,255,255,0.03)'}}>Fecha Inicio</th>
              <th style={{...styles.th, background: 'rgba(255,255,255,0.03)'}}>Fecha Fin</th>
              <th style={{...styles.th, textAlign: 'center', background: 'rgba(255,255,255,0.03)'}}>Sesiones</th>
              <th style={{...styles.th, textAlign: 'center', background: 'rgba(255,255,255,0.03)'}}>H. Reales</th>
              <th style={{...styles.th, textAlign: 'center', background: 'rgba(255,255,255,0.03)'}}>Desviación</th>
            </tr>
          </thead>
          <tbody>
            {temas.length === 0 ? (
              <tr>
                <td colSpan="7" style={styles.emptyState}>No hay temas definidos.</td>
              </tr>
            ) : (
              temas.map((tema, index) => {
                if (!tema) return null;
                
                const duracionSesion = academicYear?.duracionSesion || 55;
                const hReales = (tema.fechaInicio && tema.fechaFin && horario) 
                  ? calcularHorasReales(tema.fechaInicio, tema.fechaFin, horario, duracionSesion, festivos, ausencias) 
                  : 0;
                
                const nSesiones = (tema.fechaInicio && tema.fechaFin && horario)
                  ? contarSesiones(tema.fechaInicio, tema.fechaFin, horario, festivos, ausencias)
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
                      <span 
                        title="Número de clases impartidas para este tema" 
                        style={{ fontWeight: '600', color: '#a5b4fc', cursor: 'help' }}
                      >
                        {tema.fechaInicio && tema.fechaFin ? nSesiones : '-'}
                      </span>
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
  container: { padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' },
  header: { marginBottom: '1.5rem' },
  headerContent: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: '1.5rem', fontWeight: '800', margin: 0, background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle: { color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.25rem', marginLeft: '2.8rem' },
  saveButton: { padding: '0.5rem 1.25rem', display: 'flex', alignItems: 'center', fontWeight: '600', borderRadius: '10px', fontSize: '0.9rem' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tr: { borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' },
  td: { padding: '0.75rem', verticalAlign: 'middle', color: '#e2e8f0' },
  badgeEstimadas: { padding: '0.2rem 0.4rem', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 'bold' },
  emptyState: { padding: '3rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' },
  loading: { padding: '4rem', textAlign: 'center', color: '#94a3b8', fontSize: '1.2rem' }
};
