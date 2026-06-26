import { db } from '../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { calcularMetricasSeguimiento } from './timeCalculations';

/**
 * Carga métricas de seguimiento (desviación, progreso, última actualización) 
 * para una lista de imparticiones de forma eficiente y centralizada.
 * 
 * @param {string} iesId ID del centro
 * @param {Array} assignments Lista de imparticiones [{id, usuarioId, ...}]
 * @param {Object} academicYear Objeto del curso académico {fechaInicioClases, duracionSesion}
 * @returns {Promise<Array>} Lista de imparticiones con métricas inyectadas
 */
export const loadMetricsForAssignments = async (iesId, assignments, academicYear) => {
  if (!assignments || assignments.length === 0 || !academicYear) return assignments || [];

  try {
    // 1. Carga de datos comunes (Festivos y Ausencias del centro)
    const [festivosSnap, ausenciasSnap] = await Promise.all([
      getDocs(query(collection(db, 'festivos'), where('iesId', '==', iesId))),
      getDocs(query(collection(db, 'profesor_ausencias'), where('iesId', '==', iesId)))
    ]);
    const allFestivos = festivosSnap.docs.map(d => d.data());
    const allAusencias = ausenciasSnap.docs.map(d => d.data());

    // 2. Carga de Temas en bloque para todas las imparticiones del centro (optimizado)
    // Nota: En centros muy grandes se podría filtrar por imparticionId si es necesario
    const topicsSnap = await getDocs(query(collection(db, 'ies_programacion_temas'), where('iesId', '==', iesId)));
    const topicsMap = {};
    topicsSnap.docs.forEach(d => {
      const data = d.data();
      if (!data.imparticionId || data.n === undefined || data.n === null) return; // Filter phantoms
      
      if (!topicsMap[data.imparticionId]) topicsMap[data.imparticionId] = [];
      topicsMap[data.imparticionId].push({
        id: data.n,
        nombre: data.titulo || data.nombre || '',
        horasEstimadas: data.horas ?? 0,
        fechaInicio: data.fechaInicio || '',
        fechaFin: data.fechaFin || '',
        observaciones: data.observaciones || '',
        updatedAt: data.updatedAt || null
      });
    });

    // Sort topics for each imparticion
    Object.values(topicsMap).forEach(list => {
      list.sort((a, b) => Number(a.id) - Number(b.id));
    });

    // 3. Carga de Horarios en lotes (Firestore limit 30 para 'in')
    const ids = assignments.map(a => a.id);
    const schedulesMap = {};
    const batchSize = 30;
    
    const schedulePromises = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      schedulePromises.push(
        getDocs(query(collection(db, 'profesor_horarios'), where('imparticionId', 'in', chunk)))
      );
    }
    
    const scheduleSnaps = await Promise.all(schedulePromises);
    scheduleSnaps.forEach(snap => {
      snap.docs.forEach(d => {
        const data = d.data();
        schedulesMap[data.imparticionId] = data;
      });
    });

    // 4. Cálculo de métricas e inyección en los objetos originales
    return assignments.map(imp => {
      const temas = topicsMap[imp.id] || [];
      const horario = schedulesMap[imp.id];
      const profAusencias = allAusencias.filter(a => a.userId === imp.usuarioId);
      
      const metrics = calcularMetricasSeguimiento(
        temas, 
        horario, 
        academicYear, 
        allFestivos, 
        profAusencias
      );
      
      return { 
        ...imp, 
        ...metrics,
        temas
      };
    });
  } catch (error) {
    console.error("Error loading metrics for assignments:", error);
    return assignments;
  }
};
