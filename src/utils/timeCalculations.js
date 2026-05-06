/**
 * Convierte un número de día (0-6) de Date.getDay() a la clave correspondiente del horario.
 * @param {number} dayNumber 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
 * @returns {string|null}
 */
const getDayKey = (dayNumber) => {
  const map = {
    1: 'lunes',
    2: 'martes',
    3: 'miercoles',
    4: 'jueves',
    5: 'viernes'
  };
  return map[dayNumber] || null;
};

/**
 * Cuenta el número de sesiones entre dos fechas, basándose en el patrón horario,
 * excluyendo festivos y ausencias.
 * 
 * @param {string} fechaInicio YYYY-MM-DD
 * @param {string} fechaFin YYYY-MM-DD
 * @param {object} horario { lunes: 2, martes: 0, ... }
 * @param {array} festivos Lista de festivos [{ startDate, endDate }]
 * @param {array} ausencias Lista de ausencias [{ startDate, endDate }]
 * @returns {number} Número total de sesiones
 */
/**
 * Normaliza una fecha desde varios formatos posibles (Timestamp, String, Date)
 * a un objeto Date de JS.
 * 
 * @param {any} d 
 * @returns {Date|null}
 */
export const normalizeDate = (d) => {
  if (!d) return null;
  
  // Handle Firestore Timestamps
  if (d && typeof d.toDate === 'function') return d.toDate();
  if (d && d.seconds) return new Date(d.seconds * 1000);
  
  if (d instanceof Date) return d;

  if (typeof d !== 'string') return new Date(d);

  // Try YYYY-MM-DD or DD-MM-YYYY
  if (d.includes('-')) {
    const parts = d.split('-');
    if (parts.length === 3) {
      const [p1, p2, p3] = parts;
      // Si el primer segmento es el año (4 dígitos)
      if (p1.length === 4) {
        return new Date(Number(p1), Number(p2) - 1, Number(p3));
      } else {
        // Asumimos DD-MM-YYYY
        return new Date(Number(p3), Number(p2) - 1, Number(p1));
      }
    }
  }

  // Try DD/MM/YYYY
  if (d.includes('/')) {
    const parts = d.split('/');
    if (parts.length === 3) {
      const [day, m, y] = parts;
      return new Date(Number(y), Number(m) - 1, Number(day));
    }
  }

  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
};

const isDateInRanges = (date, ranges) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const t = d.getTime();

  return ranges.some(range => {
    const s = normalizeDate(range.startDate);
    const e = range.endDate ? normalizeDate(range.endDate) : s;
    if (!s || !e) return false;
    s.setHours(0, 0, 0, 0);
    e.setHours(0, 0, 0, 0);
    return t >= s.getTime() && t <= e.getTime();
  });
};

/**
 * Cuenta el número de sesiones entre dos fechas, basándose en el patrón horario,
 * excluyendo festivos y ausencias.
 * 
 * @param {string} fechaInicio YYYY-MM-DD
 * @param {string} fechaFin YYYY-MM-DD
 * @param {object} horario { lunes: 2, martes: 0, ... }
 * @param {array} festivos Lista de festivos [{ startDate, endDate }]
 * @param {array} ausencias Lista de ausencias [{ startDate, endDate }]
 * @returns {number} Número total de sesiones
 */
export const contarSesiones = (fechaInicio, fechaFin, horario, festivos = [], ausencias = []) => {
  if (!horario) return 0;
  
  // Soporte para objetos de horario que vienen con la propiedad 'patron' (Firestore doc)
  const actualPatron = horario.patron || horario;

  const start = normalizeDate(fechaInicio);
  const end = normalizeDate(fechaFin);

  if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) return 0;

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (end < start) return 0;

  let totalSesiones = 0;
  let current = new Date(start);
  let safetyCounter = 0;

  while (current <= end && safetyCounter < 1000) {
    safetyCounter++;

    const dayNumber = current.getDay();
    const dayKey = getDayKey(dayNumber);

    if (dayKey) {
      const esFestivo = isDateInRanges(current, festivos);
      const esAusencia = isDateInRanges(current, ausencias);

      if (!esFestivo && !esAusencia) {
        const sesionesDelDia = actualPatron[dayKey] || 0;
        totalSesiones += sesionesDelDia;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return totalSesiones;
};


/**
 * Calcula las horas reales invertidas entre dos fechas, basándose en el patrón horario,
 * excluyendo festivos y ausencias. Devuelve el valor con decimales para cálculos internos.
 */
export const calcularHorasRealesRaw = (fechaInicio, fechaFin, horario, duracionSesion = 55, festivos = [], ausencias = []) => {
  const totalSesiones = contarSesiones(fechaInicio, fechaFin, horario, festivos, ausencias);
  return (totalSesiones * duracionSesion) / 60;
};

/**
 * Calcula las horas reales redondeadas para visualización.
 */
export const calcularHorasReales = (fechaInicio, fechaFin, horario, duracionSesion = 55, festivos = [], ausencias = []) => {
  return Math.round(calcularHorasRealesRaw(fechaInicio, fechaFin, horario, duracionSesion, festivos, ausencias));
};

/**
 * Calcula la desviación entre horas reales y estimadas.
 * Si es negativo, hemos ganado tiempo (verde).
 * Si es positivo, hemos perdido tiempo (rojo).
 */
export const calcularDesviacion = (horasReales, horasEstimadas) => {
  return Math.round(horasReales - horasEstimadas);
};

/**
 * Calcula todas las métricas de una programación de forma centralizada.
 * 
 * @param {Array} temas Lista de temas [{ fechaInicio, fechaFin, horasEstimadas, nombre, updatedAt }]
 * @param {Object} horario Patrón horario
 * @param {Object} academicYear Configuración del curso { fechaInicioClases, duracionSesion }
 * @param {Array} festivos Lista de festivos
 * @param {Array} ausencias Lista de ausencias
 * @param {String} todayIso Fecha de referencia (hoy) en formato YYYY-MM-DD
 * @param {any} baseUpdatedAt Fecha base de actualización (ej. del documento de impartición)
 * @returns {Object} { desviacion, progreso, temaActual, lastUpdate }
 */
export const calcularMetricasSeguimiento = (temas, horario, academicYear, festivos = [], ausencias = [], todayIso = new Date().toISOString().split('T')[0], baseUpdatedAt = null) => {
  if (!academicYear || !horario) {
    return { desviacion: 0, progreso: 0, temaActual: 'Sin configuración', lastUpdate: null };
  }

  const duracionSesion = academicYear.duracionSesion || 55;
  const fechaInicioClases = academicYear.fechaInicioClases;
  
  // 1. Horas lectivas que deberían haber transcurrido hasta hoy según el horario
  let horasTranscurridasHoy = 0;
  try {
    horasTranscurridasHoy = calcularHorasRealesRaw(fechaInicioClases, todayIso, horario, duracionSesion, festivos, ausencias);
  } catch (e) {}

  // 2. Cálculo de desviación acumulada y progreso
  let totalDevRaw = 0;
  let totalHours = 0;
  let currentThemeName = 'No iniciado';
  let cumulativeEstimadas = 0;
  
  // La fecha de última actualización SOLO se basa en las fechas de los temas (calendario)
  let lastUpdate = null;

  temas.forEach(t => {
    const hEst = Number(t.horasEstimadas) || 0;
    totalHours += hEst;

    if (t.fechaInicio && t.fechaFin) {
      try {
        const hRealTemaRaw = calcularHorasRealesRaw(t.fechaInicio, t.fechaFin, horario, duracionSesion, festivos, ausencias);
        totalDevRaw += (hRealTemaRaw - hEst);
      } catch (err) {}
    }

    // La fecha de última actualización es la fecha más reciente registrada en el calendario (Inicio o Fin)
    const dIni = normalizeDate(t.fechaInicio);
    const dFin = normalizeDate(t.fechaFin);
    
    if (dIni && (!lastUpdate || dIni > lastUpdate)) lastUpdate = dIni;
    if (dFin && (!lastUpdate || dFin > lastUpdate)) lastUpdate = dFin;

    // Identificar tema actual basado en horas lectivas transcurridas vs acumulado de estimadas
    if (currentThemeName === 'No iniciado' && cumulativeEstimadas + hEst > horasTranscurridasHoy) {
      currentThemeName = t.nombre || t.titulo || 'Tema ' + (t.id || t.n);
    }
    cumulativeEstimadas += hEst;
  });

  // Si todas las horas lectivas han pasado el total, el tema actual es el último
  if (currentThemeName === 'No iniciado' && totalHours > 0 && horasTranscurridasHoy >= totalHours) {
    currentThemeName = 'Temario completado';
  }

  const progreso = totalHours > 0 ? Math.min(100, Math.round((horasTranscurridasHoy / totalHours) * 100)) : 0;

  return { 
    desviacion: Math.round(totalDevRaw), 
    progreso, 
    temaActual: currentThemeName, 
    lastUpdate 
  };
};
