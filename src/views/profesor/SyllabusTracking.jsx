import { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../config/firebase';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { calcularMetricasSeguimiento, normalizeDate } from '../../utils/timeCalculations';
import Modal from '../../components/common/Modal';

export default function SyllabusTracking() {
  const { id } = useParams(); // imparticionId
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReadOnly = searchParams.get('readOnly') === 'true';
  
  const [loading, setLoading] = useState(true);
  const [programacion, setProgramacion] = useState(null);
  const [horario, setHorario] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [academicYear, setAcademicYear] = useState(null);
  const [teacher, setTeacher] = useState(null);
  
  // Array of temas
  const [temas, setTemas] = useState([]);
  const [festivos, setFestivos] = useState([]);
  const [ausencias, setAusencias] = useState([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });

  const metrics = useMemo(() => {
    return calcularMetricasSeguimiento(temas, horario, academicYear, festivos, ausencias, undefined, assignment?.updatedAt);
  }, [temas, horario, academicYear, festivos, ausencias, assignment]);

  const totalDesviacion = metrics.desviacion;

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    const activeIesId = localStorage.getItem('activeIesId');
    
    try {
      // 1. Fetch Impartición (for labels)
      const aSnap = await getDoc(doc(db, 'ies_imparticiones', id));
      let assignmentData = null;
      if (aSnap.exists()) {
        assignmentData = aSnap.data();
        setAssignment(assignmentData);
        
        if (assignmentData.cursoAcademicoLabel) {
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

      // 2. Fetch temas from ies_programacion_temas (ordered by n)
      const qTemas = query(
        collection(db, 'ies_programacion_temas'),
        where('imparticionId', '==', id)
      );
      const snapTemas = await getDocs(qTemas);
      let temasData = snapTemas.docs
        .map(d => ({
          _docId: d.id,
          id: d.data().n,
          nombre: d.data().titulo || '',
          horasEstimadas: d.data().horas ?? 0,
          fechaInicio: d.data().fechaInicio || '',
          fechaFin: d.data().fechaFin || '',
          observaciones: d.data().observaciones || '',
          updatedAt: d.data().updatedAt || null,
        }))
        .sort((a, b) => a.id - b.id);
      
      setTemas(temasData);
      setProgramacion({ source: 'ies_programacion_temas' });

      // 3. Fetch Horario
      const hSnap = await getDoc(doc(db, 'profesor_horarios', id));
      if (hSnap.exists()) {
        setHorario(hSnap.data());
      } else {
        console.warn("No hay horario para la impartición:", id);
      }

      // 4. Fetch Festivos
      if (activeIesId) {
        const qFestivos = query(collection(db, 'festivos'), where('iesId', '==', activeIesId));
        const snapFestivos = await getDocs(qFestivos);
        setFestivos(snapFestivos.docs.map(d => d.data()));
      }

      // 5. Fetch Ausencias
      const targetUserId = assignmentData?.usuarioId || auth.currentUser?.uid;
      if (targetUserId) {
        const qAusencias = query(collection(db, 'profesor_ausencias'), where('userId', '==', targetUserId));
        const snapAusencias = await getDocs(qAusencias);
        setAusencias(snapAusencias.docs.map(d => d.data()));
      }

      // 6. Fetch Teacher Info (especially for readOnly display)
      if (assignmentData?.usuarioId) {
        const uSnap = await getDoc(doc(db, 'usuarios', assignmentData.usuarioId));
        if (uSnap.exists()) {
          setTeacher(uSnap.data());
        }
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
      if (programacion?.source === 'ies_programacion_temas') {
        // Guardar en cada documento individual de ies_programacion_temas
        const promises = temas.map(tema =>
          tema._docId
            ? updateDoc(doc(db, 'ies_programacion_temas', tema._docId), {
                fechaInicio: tema.fechaInicio || '',
                fechaFin: tema.fechaFin || '',
                observaciones: tema.observaciones || '',
                updatedAt: serverTimestamp()
              })
            : Promise.resolve()
        );
        await Promise.all(promises);
      } else {
        // Legado: guardar en profesor_programaciones
        await updateDoc(doc(db, 'profesor_programaciones', id), {
          temas: temas,
          updatedAt: serverTimestamp()
        });
      }
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
                onClick={() => navigate(-1)}
                style={{ padding: '0.4rem', display: 'flex', alignItems: 'center' }}
                title="Volver"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              </button>
              <h1 style={styles.title}>
                {assignment?.asignaturaNombre || 'Seguimiento de Programación'} 
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
              {assignment?.asignaturaSigla} - {assignment?.grupoNombre}
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', textTransform: 'uppercase', verticalAlign: 'middle' }}>
                {assignment?.departamento}
              </span>
              {isReadOnly && teacher && ` - ${teacher.nombre} ${teacher.apellidos || ''}`} ({assignment?.cursoAcademicoLabel})
              {metrics.lastUpdate && (
                <span style={{ marginLeft: '1.5rem', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem' }}>
                  Última actualización: {normalizeDate(metrics.lastUpdate)?.toLocaleDateString() || 'Formato inválido'}
                </span>
              )}
            </p>
          </div>
          {!isReadOnly && (
            <button className="btn-primary" onClick={saveChanges} disabled={isProcessing} style={styles.saveButton}>
              {isProcessing ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          )}
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
              <th style={{...styles.th, background: 'rgba(255,255,255,0.03)', width: isReadOnly ? '80px' : '100px'}}>Fecha Inicio</th>
              <th style={{...styles.th, background: 'rgba(255,255,255,0.03)', width: isReadOnly ? '80px' : '100px'}}>Fecha Fin</th>
              <th style={{...styles.th, textAlign: 'center', background: 'rgba(255,255,255,0.03)', width: '90px'}}>H. Estimadas</th>
              <th style={{...styles.th, textAlign: 'center', background: 'rgba(255,255,255,0.03)', width: '80px'}}>Sesiones</th>
              <th style={{...styles.th, textAlign: 'center', background: 'rgba(255,255,255,0.03)', width: '80px'}}>H. Reales</th>
              <th style={{...styles.th, textAlign: 'center', background: 'rgba(255,255,255,0.03)', width: '90px'}}>Desviación</th>
              <th style={{...styles.th, background: 'rgba(255,255,255,0.03)'}}>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {temas.length === 0 ? (
              <tr>
                <td colSpan="9" style={styles.emptyState}>No hay temas definidos.</td>
              </tr>
            ) : (
              temas.map((tema, index) => {
                if (!tema) return null;
                
                // Use metrics from the library (DRY)
                const temaMetrics = metrics.metricasPorTema?.find(m => m.id === tema.id) || {
                  hReal: 0,
                  nSesiones: 0,
                  desviacion: null
                };

                const hRealesDisplay = temaMetrics.hReal;
                const nSesiones = temaMetrics.nSesiones;
                const desviacion = temaMetrics.desviacion;

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
                    <td style={{...styles.td, width: isReadOnly ? '80px' : '100px'}}>
                      {isReadOnly ? (
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {tema.fechaInicio ? normalizeDate(tema.fechaInicio)?.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) || 'Error' : '-'}
                        </span>
                      ) : (
                        <input 
                          type="date" 
                          className="input-field" 
                          style={{ 
                            padding: '0.3rem', 
                            fontSize: '0.8rem', 
                            maxWidth: '95px'
                          }}
                          value={tema.fechaInicio || ''}
                          onChange={(e) => handleDateChange(index, 'fechaInicio', e.target.value)}
                        />
                      )}
                    </td>
                    <td style={{...styles.td, width: isReadOnly ? '80px' : '100px'}}>
                      {isReadOnly ? (
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {tema.fechaFin ? normalizeDate(tema.fechaFin)?.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) || 'Error' : '-'}
                        </span>
                      ) : (
                        <input 
                          type="date" 
                          className="input-field" 
                          style={{ 
                            padding: '0.3rem', 
                            fontSize: '0.8rem', 
                            maxWidth: '95px'
                          }}
                          value={tema.fechaFin || ''}
                          onChange={(e) => handleDateChange(index, 'fechaFin', e.target.value)}
                        />
                      )}
                    </td>
                    <td style={{...styles.td, textAlign: 'center'}}>
                      <span style={styles.badgeEstimadas}>{Math.round(tema.horasEstimadas)}h</span>
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
                        {tema.fechaInicio && tema.fechaFin ? `${hRealesDisplay}h` : '-'}
                      </span>
                    </td>
                    <td style={{...styles.td, textAlign: 'center'}}>
                      <span style={{ fontWeight: '800', fontSize: '1.1rem', color: devColor }}>
                        {desviacion !== null ? (desviacion > 0 ? `+${desviacion}h` : `${desviacion}h`) : '-'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {isReadOnly ? (
                        <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
                          {tema.observaciones || '-'}
                        </span>
                      ) : (
                        <input 
                          type="text" 
                          className="input-field" 
                          placeholder="Sin observaciones..."
                          style={{ 
                            padding: '0.4rem', 
                            fontSize: '0.85rem', 
                            minWidth: '200px'
                          }}
                          value={tema.observaciones || ''}
                          onChange={(e) => handleDateChange(index, 'observaciones', e.target.value)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            )
}
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
