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
  const normalizeDate = (d) => {
    if (!d) return null;
    const parts = d.split('-');
    if (parts.length !== 3) return new Date(d);
    const [y, m, d_] = parts;
    return new Date(`${y}-${m.padStart(2, '0')}-${d_.padStart(2, '0')}`);
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
        const sesionesDelDia = horario[dayKey] || 0;
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
