import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../../config/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import Modal from '../../components/common/Modal';

function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function addDays(date, days) {
  const res = new Date(date);
  res.setUTCDate(res.getUTCDate() + days);
  return res;
}
function toIsoDate(d) {
  return fmtDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
function getDayOfWeek(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
}

function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function getNthFriday(year, month, n) {
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCMonth() !== month - 1) break;
    if (d.getUTCDay() === 5) {
      count++;
      if (count === n) return day;
    }
  }
  return 15;
}

function generateHolidays(yearStart, comunidad, localidad) {
  const Y = Number(yearStart);
  const Y1 = Y + 1;
  const list = [];
  const easter = getEasterSunday(Y1);

  // 1. Fiesta Nacional (12 oct)
  const dow12Oct = getDayOfWeek(Y, 10, 12);
  if (dow12Oct === 0) {
    list.push({ nombre: 'Fiesta Nacional (Trasladada)', startDate: fmtDate(Y, 10, 13), endDate: null });
  } else {
    list.push({ nombre: 'Fiesta Nacional de España', startDate: fmtDate(Y, 10, 12), endDate: null });
  }

  // 2. Todos los Santos (1 nov)
  const dow1Nov = getDayOfWeek(Y, 11, 1);
  if (comunidad === 'Madrid') {
    if (dow1Nov === 0) {
      list.push({ nombre: 'Día no lectivo (Puente)', startDate: fmtDate(Y, 10, 31), endDate: null });
      list.push({ nombre: 'Día de Todos los Santos (Trasladado)', startDate: fmtDate(Y, 11, 2), endDate: null });
      list.push({ nombre: 'Día no lectivo', startDate: fmtDate(Y, 11, 3), endDate: null });
    } else if (dow1Nov === 1) {
      list.push({ nombre: 'Día de Todos los Santos', startDate: fmtDate(Y, 11, 1), endDate: null });
    } else {
      list.push({ nombre: 'Día no lectivo', startDate: fmtDate(Y, 10, 31), endDate: null });
      list.push({ nombre: 'Día de Todos los Santos', startDate: fmtDate(Y, 11, 1), endDate: null });
      if (dow1Nov === 6) {
        list.push({ nombre: 'Día no lectivo', startDate: fmtDate(Y, 11, 3), endDate: null });
      }
    }
  } else if (comunidad === 'Castilla-La Mancha') {
    if (dow1Nov === 0) {
      list.push({ nombre: 'Día no lectivo (Puente)', startDate: fmtDate(Y, 10, 31), endDate: null });
      list.push({ nombre: 'Todos los Santos (Trasladado)', startDate: fmtDate(Y, 11, 2), endDate: null });
    } else {
      list.push({ nombre: 'Día no lectivo (Puente)', startDate: fmtDate(Y, 10, 31), endDate: null });
      list.push({ nombre: 'Todos los Santos', startDate: fmtDate(Y, 11, 1), endDate: null });
    }
    const ensDay = getNthFriday(Y, 11, 2);
    list.push({ nombre: 'Día de la Enseñanza', startDate: fmtDate(Y, 11, ensDay), endDate: null });
  } else {
    if (dow1Nov === 0) {
      list.push({ nombre: 'Todos los Santos (Trasladado)', startDate: fmtDate(Y, 11, 2), endDate: null });
    } else {
      list.push({ nombre: 'Todos los Santos', startDate: fmtDate(Y, 11, 1), endDate: null });
    }
  }

  // 3. Constitución e Inmaculada (6 y 8 dic)
  const dow6Dec = getDayOfWeek(Y, 12, 6);
  if (dow6Dec === 0) {
    list.push({ nombre: 'Día de la Constitución (Trasladado)', startDate: fmtDate(Y, 12, 7), endDate: null });
  } else {
    list.push({ nombre: 'Día de la Constitución', startDate: fmtDate(Y, 12, 6), endDate: null });
  }
  const dow8Dec = getDayOfWeek(Y, 12, 8);
  if (dow8Dec === 0) {
    list.push({ nombre: 'Inmaculada Concepción (Trasladada)', startDate: fmtDate(Y, 12, 9), endDate: null });
  } else {
    list.push({ nombre: 'Inmaculada Concepción', startDate: fmtDate(Y, 12, 8), endDate: null });
  }

  // 4. Vacaciones de Navidad
  const navStartDay = getDayOfWeek(Y, 12, 22) === 1 ? 20 : 22;
  list.push({ nombre: 'Vacaciones de Navidad', startDate: fmtDate(Y, 12, navStartDay), endDate: fmtDate(Y1, 1, 7) });

  // 5. Febrero no lectivos / Carnaval
  const febFri = getNthFriday(Y1, 2, 2);
  const febMon = febFri + 3;
  if (comunidad === 'Castilla-La Mancha') {
    list.push({ nombre: 'Carnaval / Libre disposición', startDate: fmtDate(Y1, 2, febMon), endDate: fmtDate(Y1, 2, febMon + 1) });
  } else {
    list.push({ nombre: 'Día no lectivo', startDate: fmtDate(Y1, 2, febFri), endDate: null });
    list.push({ nombre: 'Día no lectivo', startDate: fmtDate(Y1, 2, febMon), endDate: null });
  }

  // 6. Semana Santa
  const ssStart = toIsoDate(addDays(easter, -9));
  const ssEnd = toIsoDate(addDays(easter, 1));
  list.push({ nombre: 'Vacaciones de Semana Santa', startDate: ssStart, endDate: ssEnd });

  // 7. Fiesta del Trabajo (1 mayo)
  const dow1May = getDayOfWeek(Y1, 5, 1);
  if (dow1May === 0) {
    list.push({ nombre: 'Fiesta del Trabajo (Trasladada)', startDate: fmtDate(Y1, 5, 2), endDate: null });
  } else {
    list.push({ nombre: 'Fiesta del Trabajo', startDate: fmtDate(Y1, 5, 1), endDate: null });
  }

  // 8. Regionales y Locales
  if (comunidad === 'Madrid') {
    const dow2May = getDayOfWeek(Y1, 5, 2);
    if (dow2May === 0) {
      list.push({ nombre: 'Día de la Comunidad (Trasladado)', startDate: fmtDate(Y1, 5, 3), endDate: null });
    } else {
      list.push({ nombre: 'Día de la Comunidad (No lectivo)', startDate: fmtDate(Y1, 5, 2), endDate: null });
    }

    if (localidad && localidad.toLowerCase().includes('fernando')) {
      const dow15May = getDayOfWeek(Y1, 5, 15);
      const is15Sun = dow15May === 0;
      list.push({ nombre: 'Festivo Local (San Isidro)', startDate: is15Sun ? fmtDate(Y1, 5, 16) : fmtDate(Y1, 5, 15), endDate: null });
      
      const dow30May = getDayOfWeek(Y1, 5, 30);
      let localDay = 30;
      if (dow30May === 6) localDay = 29;
      else if (dow30May === 0) localDay = 28;
      list.push({ nombre: 'Festivo Local (San Fernando)', startDate: fmtDate(Y1, 5, localDay), endDate: null });
    }
  } else if (comunidad === 'Castilla-La Mancha') {
    list.push({ nombre: 'Día de Castilla-La Mancha', startDate: fmtDate(Y1, 5, 31), endDate: null });
    const corpusDate = addDays(easter, 60);
    list.push({ nombre: 'Corpus Christi', startDate: toIsoDate(corpusDate), endDate: null });
    list.push({ nombre: 'Día no lectivo', startDate: toIsoDate(addDays(corpusDate, 1)), endDate: null });
  }

  return list;
}

export default function Holidays() {
  const [holidays, setHolidays] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [currentAcademicYear, setCurrentAcademicYear] = useState(null);
  const [filterYear, setFilterYear] = useState('all'); // 'all' | <academicYearId>
  const [loading, setLoading] = useState(true);
  
  // Create / Edit states
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [holidayCursoId, setHolidayCursoId] = useState('');
  
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, holiday: null });
  
  // AI Import States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState('location'); // 'location', 'searching', 'proposal'
  const [importYearId, setImportYearId] = useState('');
  const [comunidad, setComunidad] = useState(() => localStorage.getItem('holiday_comunidad') || 'Madrid');
  const [localidad, setLocalidad] = useState(() => localStorage.getItem('holiday_localidad') || 'San Fernando de Henares');
  const [proposedHolidays, setProposedHolidays] = useState([]);
  const [selectedProposed, setSelectedProposed] = useState([]);
  
  const activeIesId = localStorage.getItem('activeIesId');

  // Guardar ubicación en localStorage
  useEffect(() => {
    if (comunidad) localStorage.setItem('holiday_comunidad', comunidad);
  }, [comunidad]);

  useEffect(() => {
    if (localidad) localStorage.setItem('holiday_localidad', localidad);
  }, [localidad]);

  // Cargar festivos del centro
  const fetchHolidays = useCallback(async () => {
    if (!activeIesId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'festivos'),
        where('iesId', '==', activeIesId),
        orderBy('startDate', 'desc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHolidays(data);
    } catch (error) {
      console.error("Error fetching holidays:", error);
      setModal({ 
        isOpen: true, 
        title: 'Error', 
        message: "Error al cargar los festivos. Verifique la conexión o los índices de Firestore." 
      });
    } finally {
      setLoading(false);
    }
  }, [activeIesId]);

  useEffect(() => {
    let isSubscribed = true;

    const loadInitialData = async () => {
      if (!activeIesId) return;
      setLoading(true);
      try {
        const [qYearsSnap, qHolidaysSnap] = await Promise.all([
          getDocs(query(collection(db, 'cursos_academicos'), where('iesId', '==', activeIesId))),
          getDocs(query(collection(db, 'festivos'), where('iesId', '==', activeIesId), orderBy('startDate', 'desc')))
        ]);

        if (!isSubscribed) return;

        const yearsData = qYearsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        yearsData.sort((a, b) => (Number(b.añoInicio) || 0) - (Number(a.añoInicio) || 0));
        setAcademicYears(yearsData);

        const now = new Date();
        const currentYearStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
        const currentDoc = yearsData.find(y => Number(y.añoInicio) === currentYearStart) || yearsData[0] || null;
        setCurrentAcademicYear(currentDoc);

        if (currentDoc) {
          setImportYearId(currentDoc.id);
          setFilterYear(currentDoc.id);
        }

        const holidaysData = qHolidaysSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setHolidays(holidaysData);
      } catch (error) {
        console.error("Error loading holidays initial data:", error);
        if (isSubscribed) {
          setModal({ 
            isOpen: true, 
            title: 'Error', 
            message: "Error al cargar los datos de festivos." 
          });
        }
      } finally {
        if (isSubscribed) setLoading(false);
      }
    };

    loadInitialData();

    return () => {
      isSubscribed = false;
    };
  }, [activeIesId]);

  // Helper para asociar un festivo a un curso académico
  const getHolidayAcademicYear = useCallback((holiday) => {
    if (holiday.cursoAcademicoId) {
      const found = academicYears.find(y => y.id === holiday.cursoAcademicoId);
      if (found) return found;
    }
    if (!holiday.startDate) return null;
    const start = new Date(holiday.startDate);
    const y = start.getFullYear();
    const m = start.getMonth() + 1; // 1-12
    const startYear = m >= 9 ? y : y - 1;
    return academicYears.find(year => Number(year.añoInicio) === startYear || year.nombre === `${startYear}-${startYear + 1}`) || null;
  }, [academicYears]);

  // Filtrado de festivos para la vista principal
  const filteredHolidays = useMemo(() => {
    if (!filterYear || filterYear === 'all') return holidays;
    return holidays.filter(h => {
      const yearObj = getHolidayAcademicYear(h);
      return yearObj?.id === filterYear;
    });
  }, [holidays, filterYear, getHolidayAcademicYear]);

  const handleStartDateChange = (val) => {
    setStartDate(val);
    setEndDate(val);
  };

  const checkOverlap = (start, end, idToExclude = null) => {
    const s = new Date(start);
    const e = end ? new Date(end) : s;
    
    return holidays.find(h => {
      if (idToExclude && h.id === idToExclude) return false;
      const hStart = new Date(h.startDate);
      const hEnd = h.endDate ? new Date(h.endDate) : hStart;
      return s <= hEnd && hStart <= e;
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!activeIesId) return;

    const targetCursoId = holidayCursoId || (filterYear !== 'all' ? filterYear : currentAcademicYear?.id || null);

    const payload = {
      nombre: name,
      startDate,
      endDate: endDate === startDate ? null : endDate,
      iesId: activeIesId,
      cursoAcademicoId: targetCursoId,
      updatedAt: serverTimestamp()
    };

    const overlap = checkOverlap(payload.startDate, payload.endDate, isEditing ? editingId : null);
    if (overlap) {
      setModal({
        isOpen: true,
        title: 'Conflicto de Fechas',
        message: `Festivo ya presente en el sistema o solapado con "${overlap.nombre}".`
      });
      return;
    }

    try {
      if (isEditing) {
        await updateDoc(doc(db, 'festivos', editingId), payload);
        setModal({
          isOpen: true,
          title: 'Festivo Actualizado',
          message: `Se ha actualizado correctamente el festivo "${name}".`
        });
      } else {
        await addDoc(collection(db, 'festivos'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        setModal({
          isOpen: true,
          title: 'Festivo Creado',
          message: `Se ha registrado correctamente el festivo "${name}".`
        });
      }
      fetchHolidays();
      setIsFormOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving holiday:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudo guardar el festivo.' });
    }
  };

  const resetForm = () => {
    setName('');
    setStartDate('');
    setEndDate('');
    setHolidayCursoId(filterYear !== 'all' ? filterYear : (currentAcademicYear?.id || ''));
    setIsEditing(false);
    setEditingId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditModal = (holiday) => {
    setIsEditing(true);
    setEditingId(holiday.id);
    setName(holiday.nombre || '');
    setStartDate(holiday.startDate || '');
    setEndDate(holiday.endDate || '');
    const matchedYear = getHolidayAcademicYear(holiday);
    setHolidayCursoId(matchedYear?.id || holiday.cursoAcademicoId || '');
    setIsFormOpen(true);
  };

  const requestDelete = (holiday) => {
    setConfirmDelete({ isOpen: true, holiday });
  };

  const executeDelete = async () => {
    const holiday = confirmDelete.holiday;
    if (!holiday) return;

    try {
      await deleteDoc(doc(db, 'festivos', holiday.id));
      setHolidays(holidays.filter(h => h.id !== holiday.id));
      setConfirmDelete({ isOpen: false, holiday: null });
      
      setModal({
        isOpen: true,
        title: 'Festivo Eliminado',
        message: `El festivo "${holiday.nombre}" ha sido eliminado.`
      });
    } catch (error) {
      console.error("Error deleting holiday:", error);
      setConfirmDelete({ isOpen: false, holiday: null });
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Hubo un problema al eliminar el festivo.'
      });
    }
  };

  const handleAIImport = () => {
    // Si hay un curso filtrado en la vista, inicializar el wizard con ese curso
    if (filterYear && filterYear !== 'all') {
      setImportYearId(filterYear);
    } else if (currentAcademicYear) {
      setImportYearId(currentAcademicYear.id);
    } else if (academicYears.length > 0) {
      setImportYearId(academicYears[0].id);
    }
    setImportStep('location');
    setIsImportModalOpen(true);
  };

  const getTargetYearObj = () => {
    return academicYears.find(y => y.id === importYearId) || currentAcademicYear || academicYears[0] || null;
  };

  const startSearch = async () => {
    setImportStep('searching');
    
    const targetYearObj = getTargetYearObj();
    const now = new Date();
    const fallbackStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const yearStart = targetYearObj ? Number(targetYearObj.añoInicio) : fallbackStart;

    setTimeout(() => {
      const generated = generateHolidays(yearStart, comunidad, localidad);

      // Marcar los que ya existen en el sistema (solapamiento)
      const withOverlapInfo = generated.map(p => ({
        ...p,
        alreadyPresent: !!checkOverlap(p.startDate, p.endDate)
      }));
      
      setProposedHolidays(withOverlapInfo);
      
      // Pre-seleccionar únicamente los festivos nuevos que no existan
      setSelectedProposed(
        withOverlapInfo
          .map((p, index) => p.alreadyPresent ? null : index)
          .filter(i => i !== null)
      );
      
      setImportStep('proposal');
    }, 1500);
  };

  const executeImport = async () => {
    if (!activeIesId) return;
    
    setLoading(true);
    const targetYearObj = getTargetYearObj();
    const targetYearId = targetYearObj?.id || null;
    const targetYearLabel = targetYearObj?.nombre || 'curso seleccionado';

    try {
      const toImport = proposedHolidays.filter((_, index) => selectedProposed.includes(index));
      
      for (const holiday of toImport) {
        await addDoc(collection(db, 'festivos'), {
          nombre: holiday.nombre,
          startDate: holiday.startDate,
          endDate: holiday.endDate,
          iesId: activeIesId,
          cursoAcademicoId: targetYearId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      
      setModal({
        isOpen: true,
        title: 'Importación Completada',
        message: `Se han importado correctamente ${toImport.length} festivos para ${localidad || comunidad} en el curso ${targetYearLabel}.`
      });
      
      if (targetYearId && filterYear !== targetYearId && filterYear !== 'all') {
        setFilterYear(targetYearId);
      }

      fetchHolidays();
      setIsImportModalOpen(false);
    } catch (error) {
      console.error("Error importing holidays:", error);
      setModal({ isOpen: true, title: 'Error', message: 'Hubo un error durante la importación.' });
    } finally {
      setLoading(false);
    }
  };

  const toggleProposed = (index) => {
    if (selectedProposed.includes(index)) {
      setSelectedProposed(selectedProposed.filter(i => i !== index));
    } else {
      setSelectedProposed([...selectedProposed, index]);
    }
  };

  const targetYearForDisplay = getTargetYearObj();
  const targetYearLabel = targetYearForDisplay?.nombre || (
    new Date().getMonth() >= 8 
      ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` 
      : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`
  );

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>Días Festivos</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Gestión de días no lectivos y periodos vacacionales del centro escolar.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button 
            className="btn-secondary" 
            onClick={handleAIImport}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              border: '1px solid var(--accent-primary)',
              color: 'var(--accent-primary)',
              background: 'rgba(99, 102, 241, 0.05)'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10 10 10 0 0 1-10-10 10 10 0 0 1 10-10z"></path><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.8 }}><path d="M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z"/></svg>
              (AI) Importar Festivos
            </span>
          </button>
          <button className="btn-primary" onClick={openCreateModal}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Nuevo Festivo
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ 
          padding: '1.25rem 2rem', 
          borderBottom: '1px solid var(--border-color)', 
          background: 'rgba(255,255,255,0.02)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Listado de Festivos</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              {filteredHolidays.length} {filteredHolidays.length === 1 ? 'festivo' : 'festivos'}
              {filterYear !== 'all' && ` para el curso seleccionado`}
            </p>
          </div>

          {/* Filtro por Curso Académico */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
              Curso:
            </label>
            <select
              className="input-field"
              style={{ minWidth: '200px', padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
            >
              <option value="all">Todos los cursos ({holidays.length})</option>
              {academicYears.map(year => (
                <option key={year.id} value={year.id}>
                  Curso {year.nombre} {currentAcademicYear?.id === year.id ? '(Actual)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="table-scroll-wrapper">
          {loading ? (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
              <div className="spinner-small" style={{ margin: '0 auto 1rem' }}></div>
              <p>Cargando festivos...</p>
            </div>
          ) : filteredHolidays.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem', opacity: 0.5 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              {holidays.length === 0 ? (
                <>
                  <p>No hay días festivos registrados en el centro.</p>
                  <button className="btn-secondary" onClick={handleAIImport} style={{ marginTop: '1rem', display: 'inline-flex', gap: '0.5rem' }}>
                    Importar festivos con IA
                  </button>
                </>
              ) : (
                <>
                  <p>No hay festivos registrados para el curso seleccionado.</p>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
                    <button className="btn-secondary" onClick={() => setFilterYear('all')}>
                      Ver todos los cursos
                    </button>
                    <button className="btn-primary" onClick={handleAIImport}>
                      (AI) Importar para este curso
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr>
                  <th>Nombre</th>
                  <th>Curso</th>
                  <th>Fecha Inicio</th>
                  <th>Fecha Fin</th>
                  <th>Duración</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredHolidays.map(holiday => {
                  const start = new Date(holiday.startDate);
                  const end = holiday.endDate ? new Date(holiday.endDate) : start;
                  const diffTime = Math.abs(end - start);
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                  const yearObj = getHolidayAcademicYear(holiday);
                  
                  return (
                    <tr key={holiday.id}>
                      <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{holiday.nombre}</td>
                      <td>
                        <span className="badge" style={{ 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          color: yearObj ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontSize: '0.75rem'
                        }}>
                          {yearObj ? yearObj.nombre : 'General'}
                        </span>
                      </td>
                      <td>{start.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td>{holiday.endDate ? end.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                      <td>
                        <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', border: 'none' }}>
                          {diffDays} {diffDays === 1 ? 'día' : 'días'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button 
                            onClick={() => openEditModal(holiday)} 
                            className="btn-icon" 
                            title="Editar"
                            style={{ borderRadius: '8px' }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                          </button>
                          <button 
                            onClick={() => requestDelete(holiday)} 
                            className="btn-icon btn-danger" 
                            title="Eliminar"
                            style={{ borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none' }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Form Modal (Nuevo / Editar Festivo) */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={isEditing ? "Editar Festivo" : "Nuevo Festivo"}
      >
        <form onSubmit={handleSave} style={styles.form}>
          <div className="form-group">
            <label className="form-label">Nombre del festivo</label>
            <input 
              type="text" 
              className="input-field"
              placeholder="Ej: Día del Pilar, Navidad..."
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          {academicYears.length > 0 && (
            <div className="form-group">
              <label className="form-label">Curso Académico Asociado</label>
              <select 
                className="input-field"
                value={holidayCursoId}
                onChange={e => setHolidayCursoId(e.target.value)}
              >
                <option value="">Detectar automáticamente por fechas</option>
                {academicYears.map(y => (
                  <option key={y.id} value={y.id}>Curso {y.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Fecha Inicio</label>
              <input 
                type="date" 
                className="input-field"
                value={startDate}
                onChange={e => handleStartDateChange(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Fecha Fin</label>
              <input 
                type="date" 
                className="input-field"
                value={endDate}
                min={startDate}
                onChange={e => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--accent-primary)' }}>
             <p style={{ fontSize: '0.9rem', color: 'var(--accent-primary)', textAlign: 'center' }}>
               {startDate ? (
                 <>
                   Intervalo seleccionado: <b>{new Date(startDate).toLocaleDateString()}</b>
                   {endDate && endDate !== startDate && <> al <b>{new Date(endDate).toLocaleDateString()}</b></>}
                 </>
               ) : 'Selecciona las fechas para el festivo'}
             </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn-secondary" onClick={() => setIsFormOpen(false)} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }}>
              {isEditing ? 'Guardar Cambios' : 'Crear Festivo'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Message Modal */}
      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
      >
        <p>{modal.message}</p>
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={() => setModal({ ...modal, isOpen: false })}>Aceptar</button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={confirmDelete.isOpen}
        onClose={() => setConfirmDelete({ isOpen: false, holiday: null })}
        title="Confirmar Eliminación"
      >
        <p>¿Estás seguro de que quieres eliminar el festivo <b>{confirmDelete.holiday?.nombre}</b>?</p>
        <p style={{ marginTop: '0.5rem', color: '#ef4444', fontSize: '0.9rem' }}>Esta acción no se puede deshacer.</p>
        
        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
          <button 
            className="btn-secondary" 
            onClick={() => setConfirmDelete({ isOpen: false, holiday: null })}
          >
            Cancelar
          </button>
          <button 
            className="btn-primary" 
            style={{ background: '#ef4444' }}
            onClick={executeDelete}
          >
            Eliminar Definitivamente
          </button>
        </div>
      </Modal>

      {/* AI Import Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title={
          importStep === 'location' ? "(AI) Configurar Ubicación y Curso" : 
          importStep === 'searching' ? "Investigando..." : "(AI) Propuesta de Festivos"
        }
      >
        <div style={{ minHeight: '300px' }}>
          {importStep === 'location' ? (
            <div style={styles.form}>
              <p style={{ marginBottom: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Selecciona el curso académico y la ubicación geográfica del centro para calcular el calendario escolar oficial correspondiente.
              </p>

              {/* Selector de Curso Académico */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontWeight: '600' }}>Curso Académico</label>
                <select 
                  className="input-field" 
                  value={importYearId}
                  onChange={e => setImportYearId(e.target.value)}
                >
                  {academicYears.map(year => (
                    <option key={year.id} value={year.id}>
                      Curso {year.nombre} {currentAcademicYear?.id === year.id ? '(Curso Actual)' : ''}
                    </option>
                  ))}
                  {academicYears.length === 0 && (
                    <option value="">
                      Curso {targetYearLabel} (Por defecto)
                    </option>
                  )}
                </select>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                  Los festivos se generarán y adaptarán a este curso académico.
                </p>
              </div>
              
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontWeight: '600' }}>Comunidad Autónoma</label>
                <select 
                  className="input-field" 
                  value={comunidad}
                  onChange={e => setComunidad(e.target.value)}
                >
                  <option value="Andalucía">Andalucía</option>
                  <option value="Aragón">Aragón</option>
                  <option value="Asturias">Asturias</option>
                  <option value="Baleares">Baleares</option>
                  <option value="Canarias">Canarias</option>
                  <option value="Cantabria">Cantabria</option>
                  <option value="Castilla y León">Castilla y León</option>
                  <option value="Castilla-La Mancha">Castilla-La Mancha</option>
                  <option value="Cataluña">Cataluña</option>
                  <option value="Comunidad Valenciana">Comunidad Valenciana</option>
                  <option value="Extremadura">Extremadura</option>
                  <option value="Galicia">Galicia</option>
                  <option value="Madrid">Madrid</option>
                  <option value="Murcia">Murcia</option>
                  <option value="Navarra">Navarra</option>
                  <option value="País Vasco">País Vasco</option>
                  <option value="La Rioja">La Rioja</option>
                  <option value="Ceuta">Ceuta</option>
                  <option value="Melilla">Melilla</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '600' }}>Localidad / Municipio</label>
                <input 
                  type="text" 
                  className="input-field"
                  placeholder="Ej: San Fernando de Henares, Madrid, Toledo..."
                  value={localidad}
                  onChange={e => setLocalidad(e.target.value)}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                  Usaremos esto para buscar los festivos locales y patronales específicos.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button className="btn-secondary" onClick={() => setIsImportModalOpen(false)} style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button className="btn-primary" onClick={startSearch} style={{ flex: 2 }}>
                  Investigar Calendario
                </button>
              </div>
            </div>
          ) : importStep === 'searching' ? (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
              <div className="spinner-small" style={{ margin: '0 auto 1rem' }}></div>
              <p>Investigando calendario escolar oficial para <b>{localidad ? `${localidad}, ` : ''}{comunidad}</b>...</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Buscando festivos regionales, nacionales y locales para el curso <b>{targetYearLabel}</b>.
              </p>
            </div>
          ) : proposedHolidays.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p>No se han encontrado nuevos festivos para proponer en {comunidad} para el curso {targetYearLabel}.</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Todos los festivos detectados ya están en el sistema.</p>
              <button className="btn-secondary" onClick={() => setIsImportModalOpen(false)} style={{ marginTop: '1.5rem' }}>Cerrar</button>
            </div>
          ) : (
            <>
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                Resultados encontrados para <b>{localidad ? `${localidad} (${comunidad})` : comunidad}</b> en el curso <b>{targetYearLabel}</b>:
              </p>
              <div className="scrollable" style={{ maxHeight: '40vh', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }}>
                {proposedHolidays.map((holiday, index) => (
                  <div 
                    key={index} 
                    onClick={() => !holiday.alreadyPresent && toggleProposed(index)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '1rem', 
                      padding: '0.75rem', 
                      borderBottom: index < proposedHolidays.length - 1 ? '1px solid var(--border-color)' : 'none',
                      cursor: holiday.alreadyPresent ? 'default' : 'pointer',
                      background: selectedProposed.includes(index) ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                      opacity: holiday.alreadyPresent ? 0.6 : 1,
                      transition: 'background 0.2s',
                      borderRadius: '4px'
                    }}
                  >
                    <input 
                      type="checkbox" 
                      checked={selectedProposed.includes(index)} 
                      disabled={holiday.alreadyPresent}
                      onChange={() => {}} 
                      style={{ width: '18px', height: '18px', cursor: holiday.alreadyPresent ? 'default' : 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: '600', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {holiday.nombre}
                        {holiday.alreadyPresent && (
                          <span className="badge" style={{ fontSize: '0.7rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none' }}>
                            Ya presente
                          </span>
                        )}
                      </p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {new Date(holiday.startDate).toLocaleDateString()}
                        {holiday.endDate && <> al {new Date(holiday.endDate).toLocaleDateString()}</>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button className="btn-secondary" onClick={() => setImportStep('location')} style={{ flex: 1 }}>
                  Atrás
                </button>
                <button 
                  className="btn-primary" 
                  onClick={executeImport} 
                  disabled={selectedProposed.length === 0}
                  style={{ flex: 2 }}
                >
                  Importar {selectedProposed.length} festivos
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

const styles = {
  form: {
    display: 'flex', flexDirection: 'column', gap: '0.5rem'
  }
};
