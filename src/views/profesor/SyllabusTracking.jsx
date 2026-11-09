import { useState, useEffect, useMemo, useRef } from 'react';
import { db, auth } from '../../config/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { calcularMetricasSeguimiento, normalizeDate } from '../../utils/timeCalculations';
import Modal from '../../components/common/Modal';

const toIsoDateStr = (d) => {
  const date = normalizeDate(d);
  if (!date || isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDaysIso = (isoStr, days) => {
  const date = normalizeDate(isoStr);
  if (!date || isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return toIsoDateStr(date);
};

const formatDateEs = (d) => {
  const date = normalizeDate(d);
  if (!date || isNaN(date.getTime())) return d || '';
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

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
  const focusedDateRef = useRef({ identifier: null, field: null, value: '' });

  const courseBounds = useMemo(() => {
    const startYear = academicYear?.añoInicio || (assignment?.cursoAcademicoLabel ? parseInt(assignment.cursoAcademicoLabel.split('-')[0], 10) : null);
    const endYear = academicYear?.añoFin || (startYear ? startYear + 1 : null);
    const min = toIsoDateStr(academicYear?.fechaInicioClases) || (startYear ? `${startYear}-09-01` : '');
    const max = toIsoDateStr(academicYear?.fechaFinClases) || (endYear ? `${endYear}-06-30` : '');
    return { min, max };
  }, [academicYear, assignment]);

  const openTema = useMemo(() => {
    return temas.find(t => Boolean(t?.fechaInicio && !t?.fechaFin)) || null;
  }, [temas]);

  const validateTemaInList = (targetTema, allTemas) => {
    if (!targetTema) return null;
    const targetIdx = allTemas.findIndex(
      t => (t._docId && t._docId === targetTema._docId) || String(t.id) === String(targetTema.id)
    );
    const ini = toIsoDateStr(targetTema.fechaInicio);
    const fin = toIsoDateStr(targetTema.fechaFin);

    if (!ini && fin) {
      return `En el Tema ${targetTema.id}, no puedes fijar una fecha de fin sin haber fijado antes su fecha de inicio.`;
    }

    // 1) Fechas fuera del curso actual
    if (ini && ((courseBounds.min && ini < courseBounds.min) || (courseBounds.max && ini > courseBounds.max))) {
      return `La fecha de inicio del Tema ${targetTema.id} (${formatDateEs(ini)}) está fuera del curso académico actual (${formatDateEs(courseBounds.min)} al ${formatDateEs(courseBounds.max)}).`;
    }
    if (fin && ((courseBounds.min && fin < courseBounds.min) || (courseBounds.max && fin > courseBounds.max))) {
      return `La fecha de fin del Tema ${targetTema.id} (${formatDateEs(fin)}) está fuera del curso académico actual (${formatDateEs(courseBounds.min)} al ${formatDateEs(courseBounds.max)}).`;
    }

    // 2) Fechas de fin anteriores a la fecha de inicio de un tema
    if (ini && fin && fin < ini) {
      return `En el Tema ${targetTema.id}, la fecha de fin (${formatDateEs(fin)}) no puede ser anterior a la fecha de inicio (${formatDateEs(ini)}).`;
    }

    // 3) Solo puede haber un tema abierto (con fechaInicio y sin fechaFin) a la vez,
    //    y no pueden solaparse los intervalos de fechas entre temas (sin importar el orden numérico de los temas)
    if (ini) {
      const effectiveFin = fin || ini;

      for (let i = 0; i < allTemas.length; i++) {
        if (i === targetIdx) continue;
        const other = allTemas[i];
        if (!other || !other.fechaInicio) continue;
        const oIni = toIsoDateStr(other.fechaInicio);
        const oFin = toIsoDateStr(other.fechaFin);
        if (!oIni) continue;

        // Si el otro tema está abierto (sin fecha de fin)
        if (!oFin) {
          if (!fin) {
            return `Ya hay un tema abierto sin fecha de fin: Tema ${other.id} (${other.nombre}). Debes fijar su fecha de fin antes de dejar abierto otro tema.`;
          }
          if (ini >= oIni || effectiveFin >= oIni) {
            return `No puedes fijar fechas en el Tema ${targetTema.id} posteriores o iguales al inicio del Tema ${other.id} (${other.nombre}), que sigue abierto sin fecha de fin.`;
          }
          continue;
        }

        if (oFin < oIni) continue;

        const hasAjuste = (Number(targetTema.ajuste) || 0) !== 0 || (Number(other.ajuste) || 0) !== 0;

        // Comprobar solapamiento entre [ini, effectiveFin] y [oIni, oFin] independientemente del orden de tema
        if (ini <= oFin && effectiveFin >= oIni) {
          const touchesAtStart = ini === oFin && effectiveFin >= oFin;
          const touchesAtEnd = effectiveFin === oIni && ini <= oIni && ini < effectiveFin;
          const isSameSingleDay = ini === oIni && effectiveFin === oFin && ini === effectiveFin;

          if ((touchesAtStart || touchesAtEnd || isSameSingleDay) && ! (ini < oFin && effectiveFin > oIni)) {
            if (!hasAjuste) {
              return `Las fechas del Tema ${targetTema.id} coinciden en el día de cambio con el Tema ${other.id} (${other.nombre}: ${formatDateEs(oIni)} - ${formatDateEs(oFin)}). Solo pueden compartir día si alguno tiene ajuste de sesiones.`;
            }
          } else {
            return `Las fechas del Tema ${targetTema.id} se solapan con el intervalo del Tema ${other.id} (${other.nombre}: ${formatDateEs(oIni)} - ${formatDateEs(oFin)}).`;
          }
        }
      }
    }

    return null;
  };

  const getDateInputBounds = (tema, idx) => {
    const iniIso = toIsoDateStr(tema.fechaInicio);
    const finIso = toIsoDateStr(tema.fechaFin);

    let minFromCompletedBeforeFin = '';
    let maxFromCompletedAfterIni = '';

    for (let i = 0; i < temas.length; i++) {
      if (i === idx) continue;
      const other = temas[i];
      if (!other || !other.fechaInicio || !other.fechaFin) continue;
      const oIni = toIsoDateStr(other.fechaInicio);
      const oFin = toIsoDateStr(other.fechaFin);
      if (!oIni || !oFin || oFin < oIni) continue;

      const hasAjuste = (Number(tema.ajuste) || 0) !== 0 || (Number(other.ajuste) || 0) !== 0;

      // Si este tema ya tiene fechaInicio y el otro tema empieza después, la fechaFin no puede pisar al otro tema
      if (iniIso && oIni >= iniIso) {
        const candidateMaxFin = hasAjuste ? oIni : addDaysIso(oIni, -1);
        if (candidateMaxFin && (!maxFromCompletedAfterIni || candidateMaxFin < maxFromCompletedAfterIni)) {
          maxFromCompletedAfterIni = candidateMaxFin;
        }
      }

      // Si este tema ya tiene fechaFin y el otro tema termina antes, la fechaInicio no puede pisar al otro tema
      if (finIso && oFin <= finIso) {
        const candidateMinIni = hasAjuste ? oFin : addDaysIso(oFin, 1);
        if (candidateMinIni && (!minFromCompletedBeforeFin || candidateMinIni > minFromCompletedBeforeFin)) {
          minFromCompletedBeforeFin = candidateMinIni;
        }
      }
    }

    const minInicioCandidates = [courseBounds.min, minFromCompletedBeforeFin].filter(Boolean);
    const maxInicioCandidates = [courseBounds.max, finIso].filter(Boolean);
    const minFinCandidates = [courseBounds.min, iniIso].filter(Boolean);
    const maxFinCandidates = [courseBounds.max, maxFromCompletedAfterIni].filter(Boolean);

    return {
      minInicio: minInicioCandidates.length ? minInicioCandidates.reduce((a, b) => (a > b ? a : b)) : undefined,
      maxInicio: maxInicioCandidates.length ? maxInicioCandidates.reduce((a, b) => (a < b ? a : b)) : undefined,
      minFin: minFinCandidates.length ? minFinCandidates.reduce((a, b) => (a > b ? a : b)) : undefined,
      maxFin: maxFinCandidates.length ? maxFinCandidates.reduce((a, b) => (a < b ? a : b)) : undefined
    };
  };

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
        
        if (assignmentData.cursoAcademicoId || assignmentData.cursoAcademicoLabel) {
          const qYear = query(
            collection(db, 'cursos_academicos'),
            where('iesId', '==', assignmentData.iesId || activeIesId)
          );
          const snapYear = await getDocs(qYear);
          const foundYear = snapYear.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .find(y => y.id === assignmentData.cursoAcademicoId || y.nombre === assignmentData.cursoAcademicoLabel);
          if (foundYear) {
            setAcademicYear(foundYear);
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
        .map(d => {
          const data = d.data();
          return {
            _docId: d.id,
            id: data.n,
            nombre: data.titulo || data.nombre || '',
            horasEstimadas: data.horas ?? 0,
            fechaInicio: data.fechaInicio || '',
            fechaFin: data.fechaFin || '',
            ajuste: Number(data.ajuste) || 0,
            observaciones: data.observaciones || '',
            updatedAt: data.updatedAt || null,
          };
        })
        // Filtrar temas que no tengan número (fantasmales)
        .filter(t => t.id !== undefined && t.id !== null)
        .sort((a, b) => Number(a.id) - Number(b.id));

      if (temasData.length > 0) {
        setTemas(temasData);
        setProgramacion({ source: 'ies_programacion_temas' });
      } else {
        // Fallback a profesor_programaciones si no están en ies_programacion_temas
        const progSnap = await getDoc(doc(db, 'profesor_programaciones', id));
        if (progSnap.exists()) {
          const progData = progSnap.data();
          if (progData.temas && Array.isArray(progData.temas)) {
            const mapped = progData.temas.map((t, idx) => ({
              id: t.id !== undefined && t.id !== null ? t.id : idx + 1,
              nombre: t.nombre || t.titulo || '',
              horasEstimadas: Number(t.horasEstimadas ?? t.horas ?? 0),
              fechaInicio: t.fechaInicio || '',
              fechaFin: t.fechaFin || '',
              ajuste: Number(t.ajuste) || 0,
              observaciones: t.observaciones || '',
              updatedAt: t.updatedAt || progData.updatedAt || null
            })).sort((a, b) => Number(a.id) - Number(b.id));
            setTemas(mapped);
            setProgramacion({ source: 'profesor_programaciones', ...progData });
          } else {
            setTemas([]);
            setProgramacion({ source: 'profesor_programaciones', ...progData });
          }
        } else {
          setTemas([]);
          setProgramacion(null);
        }
      }

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

  const handleDateFocus = (identifier, field, currentValue) => {
    focusedDateRef.current = { identifier, field, value: currentValue || '' };
  };

  const handleDateChange = (identifier, field, value) => {
    const prevTema = temas.find(
      t => (t._docId && t._docId === identifier) || String(t.id) === String(identifier)
    );
    const prevVal = prevTema ? prevTema[field] : '';

    const newTemas = temas.map(t => {
      if ((t._docId && t._docId === identifier) || String(t.id) === String(identifier)) {
        if (field === 'fechaInicio' && !value) {
          return { ...t, fechaInicio: '', fechaFin: '' };
        }
        return { ...t, [field]: value };
      }
      return t;
    });

    if (field === 'fechaFin' && !value) {
      const updatedTema = newTemas.find(
        t => (t._docId && t._docId === identifier) || String(t.id) === String(identifier)
      );
      const err = validateTemaInList(updatedTema, newTemas);
      if (err) {
        setModal({ isOpen: true, title: 'Tema abierto', message: err });
        return;
      }
    }

    if (field === 'ajuste') {
      const updatedTema = newTemas.find(
        t => (t._docId && t._docId === identifier) || String(t.id) === String(identifier)
      );
      const err = validateTemaInList(updatedTema, newTemas);
      if (err) {
        setModal({ isOpen: true, title: 'Fecha incongruente', message: err });
        return;
      }
      setTemas(newTemas);
      return;
    }

    if ((field === 'fechaInicio' || field === 'fechaFin') && value) {
      const yearPart = parseInt(String(value).split('-')[0], 10);
      // Si el campo estaba vacío y ya tiene un año de 4 dígitos (>= 1900), validamos al instante
      if (!prevVal && yearPart >= 1900) {
        const updatedTema = newTemas.find(
          t => (t._docId && t._docId === identifier) || String(t.id) === String(identifier)
        );
        const err = validateTemaInList(updatedTema, newTemas);
        if (err) {
          setModal({ isOpen: true, title: 'Fecha incongruente', message: err });
          return;
        }
      }
    }

    setTemas(newTemas);
  };

  const handleDateBlur = (identifier, field) => {
    const currentTema = temas.find(
      t => (t._docId && t._docId === identifier) || String(t.id) === String(identifier)
    );
    if (!currentTema || !currentTema[field]) return;

    const err = validateTemaInList(currentTema, temas);
    if (err) {
      const prevValue =
        focusedDateRef.current.identifier === identifier && focusedDateRef.current.field === field
          ? focusedDateRef.current.value
          : '';
      // Solo restaurar el valor previo si era válido; si no, limpiar
      const candidateTemas = temas.map(t =>
        ((t._docId && t._docId === identifier) || String(t.id) === String(identifier))
          ? { ...t, [field]: prevValue }
          : t
      );
      const prevTemaCandidate = candidateTemas.find(
        t => (t._docId && t._docId === identifier) || String(t.id) === String(identifier)
      );
      const fallbackVal = validateTemaInList(prevTemaCandidate, candidateTemas) ? '' : prevValue;

      setTemas(temas.map(t =>
        ((t._docId && t._docId === identifier) || String(t.id) === String(identifier))
          ? { ...t, [field]: fallbackVal }
          : t
      ));
      setModal({ isOpen: true, title: 'Fecha incongruente', message: err });
    }
  };

  const saveChanges = async () => {
    for (const t of temas) {
      const err = validateTemaInList(t, temas);
      if (err) {
        setModal({ isOpen: true, title: 'Fechas incongruentes', message: err });
        return;
      }
    }
    setIsProcessing(true);
    try {
      if (programacion?.source === 'ies_programacion_temas') {
        // Guardar en cada documento individual de ies_programacion_temas
        const promises = temas.map(tema =>
          tema._docId
            ? updateDoc(doc(db, 'ies_programacion_temas', tema._docId), {
                fechaInicio: tema.fechaInicio || '',
                fechaFin: tema.fechaFin || '',
                ajuste: Number(tema.ajuste) || 0,
                observaciones: tema.observaciones || '',
                updatedAt: serverTimestamp()
              })
            : Promise.resolve()
        );
        await Promise.all(promises);
      } else {
        // Guardar en profesor_programaciones
        const cleanTemas = temas.map(t => {
          const item = {
            id: t.id,
            nombre: t.nombre || '',
            horasEstimadas: Number(t.horasEstimadas || 0)
          };
          if (t.fechaInicio) item.fechaInicio = t.fechaInicio;
          if (t.fechaFin) item.fechaFin = t.fechaFin;
          item.ajuste = Number(t.ajuste) || 0;
          if (t.observaciones) item.observaciones = t.observaciones;
          return item;
        });

        await setDoc(doc(db, 'profesor_programaciones', id), {
          imparticionId: id,
          temas: cleanTemas,
          updatedAt: serverTimestamp()
        }, { merge: true });
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
              <th style={{...styles.th, textAlign: 'center', background: 'rgba(255,255,255,0.03)', width: isReadOnly ? '60px' : '75px'}} title="Ajuste de sesiones computadas">Ajuste</th>
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
                <td colSpan="10" style={styles.emptyState}>No hay temas definidos.</td>
              </tr>
            ) : (
              temas.map((tema, idx) => {
                if (!tema) return null;
                
                // Use metrics from the library (DRY)
                const temaMetrics = metrics.metricasPorTema?.find(m => Number(m.id) === Number(tema.id)) || {

                  hReal: 0,
                  nSesiones: 0,
                  desviacion: null
                };

                const hRealesDisplay = temaMetrics.hReal;
                const nSesiones = temaMetrics.nSesiones;
                const desviacion = temaMetrics.desviacion;
                const dateBounds = getDateInputBounds(tema, idx);
                const dateError = validateTemaInList(tema, temas);
                const isOtherOpen = Boolean(
                  openTema &&
                  ((openTema._docId && openTema._docId !== tema._docId) || String(openTema.id) !== String(tema.id))
                );
                const disableInicio = isOtherOpen && !tema.fechaInicio;
                const disableFin = !tema.fechaInicio;

                let devColor = 'inherit';
                if (desviacion !== null) {
                  devColor = desviacion < 0 ? '#10b981' : (desviacion > 0 ? '#ef4444' : '#94a3b8');
                }

                return (
                  <tr key={tema._docId || tema.id} style={styles.tr}>

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
                          disabled={disableInicio}
                          style={{ 
                            padding: '0.3rem', 
                            fontSize: '0.8rem', 
                            maxWidth: '95px',
                            borderColor: dateError && tema.fechaInicio ? '#ef4444' : undefined,
                            opacity: disableInicio ? 0.45 : 1,
                            cursor: disableInicio ? 'not-allowed' : undefined
                          }}
                          min={dateBounds.minInicio}
                          max={dateBounds.maxInicio}
                          title={
                            disableInicio
                              ? `Debes fijar una fecha de fin para el Tema ${openTema.id} (${openTema.nombre}) antes de iniciar otro tema.`
                              : (dateError || '')
                          }
                          value={tema.fechaInicio || ''}
                          onFocus={() => handleDateFocus(tema._docId || tema.id, 'fechaInicio', tema.fechaInicio)}
                          onChange={(e) => handleDateChange(tema._docId || tema.id, 'fechaInicio', e.target.value)}
                          onBlur={() => handleDateBlur(tema._docId || tema.id, 'fechaInicio')}
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
                          disabled={disableFin}
                          style={{ 
                            padding: '0.3rem', 
                            fontSize: '0.8rem', 
                            maxWidth: '95px',
                            borderColor: dateError && tema.fechaFin ? '#ef4444' : undefined,
                            opacity: disableFin ? 0.45 : 1,
                            cursor: disableFin ? 'not-allowed' : undefined
                          }}
                          min={dateBounds.minFin}
                          max={dateBounds.maxFin}
                          title={
                            disableFin
                              ? 'Debes fijar primero la fecha de inicio de este tema.'
                              : (dateError || '')
                          }
                          value={tema.fechaFin || ''}
                          onFocus={() => handleDateFocus(tema._docId || tema.id, 'fechaFin', tema.fechaFin)}
                          onChange={(e) => handleDateChange(tema._docId || tema.id, 'fechaFin', e.target.value)}
                          onBlur={() => handleDateBlur(tema._docId || tema.id, 'fechaFin')}
                        />
                      )}
                    </td>
                    <td style={{...styles.td, textAlign: 'center', width: isReadOnly ? '60px' : '75px'}}>
                      {isReadOnly ? (
                        <span style={{ 
                          fontSize: '0.85rem', 
                          color: (tema.ajuste || 0) < 0 ? '#f59e0b' : '#94a3b8', 
                          fontWeight: (tema.ajuste || 0) !== 0 ? '600' : 'normal' 
                        }}>
                          {tema.ajuste || 0}
                        </span>
                      ) : (
                        <select 
                          className="input-field" 
                          style={{ 
                            padding: '0.3rem 0.4rem', 
                            fontSize: '0.85rem', 
                            width: '65px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            color: (tema.ajuste || 0) < 0 ? '#f59e0b' : 'inherit',
                            fontWeight: (tema.ajuste || 0) !== 0 ? '600' : 'normal',
                            paddingRight: '1rem',
                            backgroundPosition: 'right 0.25rem center',
                            backgroundSize: '0.9em'
                          }}
                          value={tema.ajuste ?? 0}
                          onChange={(e) => handleDateChange(tema._docId || tema.id, 'ajuste', parseInt(e.target.value, 10) || 0)}
                        >
                          {[0, -1, -2, -3, -4, -5, -6].map(val => (
                            <option key={val} value={val} style={{ background: '#1e293b', color: '#f8fafc' }}>
                              {val}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={{...styles.td, textAlign: 'center'}}>
                      <span style={styles.badgeEstimadas}>{Math.round(tema.horasEstimadas)}h</span>
                    </td>
                    <td style={{...styles.td, textAlign: 'center'}}>
                      <span 
                        title={`Número de clases impartidas para este tema${(tema.ajuste || 0) !== 0 ? ` (Ajuste: ${tema.ajuste})` : ''}`}
                        style={{ fontWeight: '600', color: '#a5b4fc', cursor: 'help' }}
                      >
                        {tema.fechaInicio ? nSesiones : '-'}
                      </span>
                    </td>
                    <td style={{...styles.td, textAlign: 'center'}}>
                      <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                        {tema.fechaInicio ? `${hRealesDisplay}h` : '-'}
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
                          onChange={(e) => handleDateChange(tema._docId || tema.id, 'observaciones', e.target.value)}
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
