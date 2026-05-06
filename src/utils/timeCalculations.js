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
export const contarSesiones = (fechaInicio, fechaFin, horario, festivos = [], ausencias = []) => {
  if (!horario) return 0;
  
  // Soporte para objetos de horario que vienen con la propiedad 'patron' (Firestore doc)
  const actualPatron = horario.patron || horario;

  const normalizeDate = (d) => {
    if (!d) return null;
    
    // Handle Firestore Timestamps
    if (d && typeof d.toDate === 'function') return d.toDate();
    if (d && d.seconds) return new Date(d.seconds * 1000);
    
    if (typeof d !== 'string') return new Date(d);

    // Try YYYY-MM-DD
    if (d.includes('-')) {
      const parts = d.split('-');
      if (parts.length === 3) {
        const [y, m, day] = parts;
        // Si el primer segmento es el año (4 dígitos)
        if (y.length === 4) {
          return new Date(Number(y), Number(m) - 1, Number(day));
        } else {
          // Asumimos DD-MM-YYYY
          return new Date(Number(day), Number(m) - 1, Number(y));
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

    return new Date(d);
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
 * excluyendo festivos y ausencias.
 */
export const calcularHorasReales = (fechaInicio, fechaFin, horario, duracionSesion = 55, festivos = [], ausencias = []) => {
  const totalSesiones = contarSesiones(fechaInicio, fechaFin, horario, festivos, ausencias);
  const minutosTotales = totalSesiones * duracionSesion;
  return Math.round(minutosTotales / 60);
};

/**
 * Calcula la desviación entre horas reales y estimadas.
 * Si es negativo, hemos ganado tiempo (verde).
 * Si es positivo, hemos perdido tiempo (rojo).
 */
export const calcularDesviacion = (horasReales, horasEstimadas) => {
  return horasReales - horasEstimadas;
};

/**
 * Calcula todas las métricas de una programación de forma centralizada.
 * 
 * @param {Array} temas Lista de temas [{ fechaInicio, fechaFin, horasEstimadas, nombre }]
 * @param {Object} horario Patrón horario
 * @param {Object} academicYear Configuración del curso { fechaInicioClases, duracionSesion }
 * @param {Array} festivos Lista de festivos
 * @param {Array} ausencias Lista de ausencias
 * @param {String} todayIso Fecha de referencia (hoy) en formato YYYY-MM-DD
 * @returns {Object} { desviacion, progreso, temaActual, lastUpdate }
 */
export const calcularMetricasSeguimiento = (temas, horario, academicYear, festivos = [], ausencias = [], todayIso = new Date().toISOString().split('T')[0]) => {
  if (!academicYear || !horario) {
    return { desviacion: 0, progreso: 0, temaActual: 'Sin configuración', lastUpdate: null };
  }

  const duracionSesion = academicYear.duracionSesion || 55;
  const fechaInicioClases = academicYear.fechaInicioClases;
  
  // 1. Horas lectivas que deberían haber transcurrido hasta hoy según el horario
  let horasTranscurridasHoy = 0;
  try {
    horasTranscurridasHoy = calcularHorasReales(fechaInicioClases, todayIso, horario, duracionSesion, festivos, ausencias);
  } catch (e) {}

  // 2. Cálculo de desviación acumulada y progreso
  let totalDev = 0;
  let totalHours = 0;
  let currentThemeName = 'No iniciado';
  let cumulativeEstimadas = 0;
  let lastUpdate = null;

  temas.forEach(t => {
    const hEst = Number(t.horasEstimadas) || 0;
    totalHours += hEst;

    if (t.fechaInicio && t.fechaFin) {
      try {
        const hRealTema = calcularHorasReales(t.fechaInicio, t.fechaFin, horario, duracionSesion, festivos, ausencias);
        totalDev += (hRealTema - hEst);
        
        // Seguimiento de la última actualización
        const dFin = new Date(t.fechaFin);
        if (!lastUpdate || dFin > lastUpdate) lastUpdate = dFin;
        if (t.updatedAt) {
           const dUpd = t.updatedAt.seconds ? new Date(t.updatedAt.seconds * 1000) : new Date(t.updatedAt);
           if (!lastUpdate || dUpd > lastUpdate) lastUpdate = dUpd;
        }
      } catch (err) {}
    }

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
    desviacion: totalDev, 
    progreso, 
    temaActual: currentThemeName, 
    lastUpdate 
  };
};
