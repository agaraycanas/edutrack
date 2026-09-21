import { db } from '../config/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
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

    // 2. Carga de Temas y Programaciones del centro
    const [topicsSnap, progsSnap] = await Promise.all([
      getDocs(query(collection(db, 'ies_programacion_temas'), where('iesId', '==', iesId))),
      getDocs(query(collection(db, 'profesor_programaciones'), where('iesId', '==', iesId)))
    ]);
    const topicsMap = {};

    // A. Poblar desde profesor_programaciones
    progsSnap.docs.forEach(d => {
      const data = d.data();
      const impId = data.imparticionId || d.id;
      if (data.temas && Array.isArray(data.temas)) {
        topicsMap[impId] = data.temas.map(t => ({
          id: t.id,
          nombre: t.nombre || t.titulo || '',
          horasEstimadas: Number(t.horasEstimadas ?? t.horas ?? 0),
          fechaInicio: t.fechaInicio || '',
          fechaFin: t.fechaFin || '',
          ajuste: Number(t.ajuste) || 0,
          observaciones: t.observaciones || '',
          updatedAt: t.updatedAt || data.updatedAt || null
        }));
      }
    });

    // B. Añadir temas desde ies_programacion_temas si no estaban ya
    topicsSnap.docs.forEach(d => {
      const data = d.data();
      if (!data.imparticionId || data.n === undefined || data.n === null) return;
      if (!topicsMap[data.imparticionId]) topicsMap[data.imparticionId] = [];
      const idStr = String(data.n);
      if (!topicsMap[data.imparticionId].some(t => String(t.id) === idStr)) {
        topicsMap[data.imparticionId].push({
          id: data.n,
          nombre: data.titulo || data.nombre || '',
          horasEstimadas: Number(data.horas ?? 0),
          fechaInicio: data.fechaInicio || '',
          fechaFin: data.fechaFin || '',
          ajuste: Number(data.ajuste) || 0,
          observaciones: data.observaciones || '',
          updatedAt: data.updatedAt || null
        });
      }
    });

    // Sort topics for each imparticion
    Object.values(topicsMap).forEach(list => {
      list.sort((a, b) => Number(a.id) - Number(b.id));
    });

    // 3. Carga de Horarios del centro
    const schedulesMap = {};
    try {
      const schedulesSnap = await getDocs(query(collection(db, 'profesor_horarios'), where('iesId', '==', iesId)));
      schedulesSnap.docs.forEach(d => {
        const data = d.data();
        schedulesMap[d.id] = data;
        if (data.imparticionId) {
          schedulesMap[data.imparticionId] = data;
        }
      });
    } catch (e) {
      console.warn("Error querying profesor_horarios by iesId:", e);
    }

    // Fallback: Si para alguna impartición no se encontró horario en la búsqueda general, comprobamos por doc ID directo
    const missingScheduleIds = assignments.map(a => a.id).filter(id => !schedulesMap[id]);
    if (missingScheduleIds.length > 0) {
      const directSnaps = await Promise.all(
        missingScheduleIds.map(id => getDoc(doc(db, 'profesor_horarios', id)).catch(() => null))
      );
      directSnaps.forEach(snap => {
        if (snap && snap.exists && snap.exists()) {
          const data = snap.data();
          schedulesMap[snap.id] = data;
          if (data.imparticionId) {
            schedulesMap[data.imparticionId] = data;
          }
        }
      });
    }

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
        temas,
        horario: horario || null
      };
    });
  } catch (error) {
    console.error("Error loading metrics for assignments:", error);
    return assignments;
  }
};
