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
 * Calcula las horas reales invertidas entre dos fechas, basándose en el patrón horario.
 * 
 * @param {string} fechaInicio YYYY-MM-DD
 * @param {string} fechaFin YYYY-MM-DD
 * @param {object} horario { lunes: 2, martes: 0, ... }
 * @param {number} duracionSesion Minutos por sesión (default: 55)
 * @returns {number} Horas reales (redondeadas)
 */
export const calcularHorasReales = (fechaInicio, fechaFin, horario, duracionSesion = 55) => {
  if (!fechaInicio || !fechaFin || !horario) return 0;

  const start = new Date(fechaInicio);
  const end = new Date(fechaFin);

  // Asegurarnos de que no haya horas que interfieran
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (end < start) return 0; // Fechas inválidas

  let totalSesiones = 0;
  let current = new Date(start);

  while (current <= end) {
    const dayNumber = current.getDay();
    const dayKey = getDayKey(dayNumber);

    if (dayKey) {
      // Es de lunes a viernes
      // TODO: Comprobar aquí si es festivo (stub)
      const esFestivo = false; // logic goes here
      // TODO: Comprobar aquí si es ausencia del profesor (stub)
      const esAusencia = false; // logic goes here

      if (!esFestivo && !esAusencia) {
        const sesionesDelDia = horario[dayKey] || 0;
        totalSesiones += sesionesDelDia;
      }
    }

    // Sumar 1 día
    current.setDate(current.getDate() + 1);
  }

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
