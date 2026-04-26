const admin = require('firebase-admin');
const serviceAccount = require('../.gemini/edutrack-803e0-firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const catalog = [
  // SECUNDARIA Y BACHILLERATO
  { sigla: 'ESO', nombre: 'Educación Secundaria Obligatoria', tipo: 'Secundaria', cursos: [1, 2, 3, 4] },
  { sigla: 'BACH-CT', nombre: 'Ciencias y Tecnología', tipo: 'Bachillerato', cursos: [1, 2] },
  { sigla: 'BACH-HCS', nombre: 'Humanidades y Ciencias Sociales', tipo: 'Bachillerato', cursos: [1, 2] },
  { sigla: 'BACH-ART', nombre: 'Artes', tipo: 'Bachillerato', cursos: [1, 2] },
  { sigla: 'BACH-GEN', nombre: 'General', tipo: 'Bachillerato', cursos: [1, 2] },

  // FP INFORMATICA Y COMUNICACIONES
  { sigla: 'SMR', nombre: 'Sistemas Microinformáticos y Redes', tipo: 'FP Grado Medio', familia: 'Informática y Comunicaciones', cursos: [1, 2] },
  { sigla: 'DAM', nombre: 'Desarrollo de Aplicaciones Multiplataforma', tipo: 'FP Grado Superior', familia: 'Informática y Comunicaciones', cursos: [1, 2] },
  { sigla: 'DAW', nombre: 'Desarrollo de Aplicaciones Web', tipo: 'FP Grado Superior', familia: 'Informática y Comunicaciones', cursos: [1, 2] },
  { sigla: 'ASIR', nombre: 'Administración de Sistemas Informáticos en Red', tipo: 'FP Grado Superior', familia: 'Informática y Comunicaciones', cursos: [1, 2] },

  // FP ADMINISTRACIÓN Y GESTIÓN
  { sigla: 'GA', nombre: 'Gestión Administrativa', tipo: 'FP Grado Medio', familia: 'Administración y Gestión', cursos: [1, 2] },
  { sigla: 'AF', nombre: 'Administración y Finanzas', tipo: 'FP Grado Superior', familia: 'Administración y Gestión', cursos: [1, 2] },
  { sigla: 'AD', nombre: 'Asistencia a la Dirección', tipo: 'FP Grado Superior', familia: 'Administración y Gestión', cursos: [1, 2] },

  // FP SANIDAD
  { sigla: 'CAE', nombre: 'Cuidados Auxiliares de Enfermería', tipo: 'FP Grado Medio', familia: 'Sanidad', cursos: [1] },
  { sigla: 'TES', nombre: 'Emergencias Sanitarias', tipo: 'FP Grado Medio', familia: 'Sanidad', cursos: [1, 2] },
  { sigla: 'PF', nombre: 'Farmacia y Parafarmacia', tipo: 'FP Grado Medio', familia: 'Sanidad', cursos: [1, 2] },
  { sigla: 'DL', nombre: 'Documentación y Administración Sanitarias', tipo: 'FP Grado Superior', familia: 'Sanidad', cursos: [1, 2] },
  { sigla: 'LDC', nombre: 'Laboratorio Clínico y Biomédico', tipo: 'FP Grado Superior', familia: 'Sanidad', cursos: [1, 2] },
  { sigla: 'IPD', nombre: 'Imagen para el Diagnóstico y Medicina Nuclear', tipo: 'FP Grado Superior', familia: 'Sanidad', cursos: [1, 2] },

  // FP IMAGEN PERSONAL (Estética)
  { sigla: 'EB', nombre: 'Estética y Belleza', tipo: 'FP Grado Medio', familia: 'Imagen Personal', cursos: [1, 2] },
  { sigla: 'PEC', nombre: 'Peluquería y Cosmética Capilar', tipo: 'FP Grado Medio', familia: 'Imagen Personal', cursos: [1, 2] },
  { sigla: 'EIA', nombre: 'Estética Integral y Bienestar', tipo: 'FP Grado Superior', familia: 'Imagen Personal', cursos: [1, 2] },
  { sigla: 'EPD', nombre: 'Estilismo y Dirección de Peluquería', tipo: 'FP Grado Superior', familia: 'Imagen Personal', cursos: [1, 2] },

  // FP SERVICIOS SOCIOCULTURALES
  { sigla: 'EI', nombre: 'Educación Infantil', tipo: 'FP Grado Superior', familia: 'Servicios Socioculturales', cursos: [1, 2] },
  { sigla: 'IS', nombre: 'Integración Social', tipo: 'FP Grado Superior', familia: 'Servicios Socioculturales', cursos: [1, 2] },
  { sigla: 'APSD', nombre: 'Atención a Personas en Situación de Dependencia', tipo: 'FP Grado Medio', familia: 'Servicios Socioculturales', cursos: [1, 2] },

  // FP COMERCIO Y MARKETING
  { sigla: 'ACT', nombre: 'Actividades Comerciales', tipo: 'FP Grado Medio', familia: 'Comercio y Marketing', cursos: [1, 2] },
  { sigla: 'GV', nombre: 'Gestión de Ventas y Espacios Comerciales', tipo: 'FP Grado Superior', familia: 'Comercio y Marketing', cursos: [1, 2] },
  { sigla: 'MK', nombre: 'Marketing y Publicidad', tipo: 'FP Grado Superior', familia: 'Comercio y Marketing', cursos: [1, 2] },
  { sigla: 'TLYL', nombre: 'Transporte y Logística', tipo: 'FP Grado Superior', familia: 'Comercio y Marketing', cursos: [1, 2] },

  // FP HOSTELERÍA Y TURISMO
  { sigla: 'Cyg', nombre: 'Cocina y Gastronomía', tipo: 'FP Grado Medio', familia: 'Hostelería y Turismo', cursos: [1, 2] },
  { sigla: 'SR', nombre: 'Servicios en Restauración', tipo: 'FP Grado Medio', familia: 'Hostelería y Turismo', cursos: [1, 2] },
  { sigla: 'GIAT', nombre: 'Guía, Información y Asistencias Turísticas', tipo: 'FP Grado Superior', familia: 'Hostelería y Turismo', cursos: [1, 2] },
  { sigla: 'AV', nombre: 'Agencias de Viajes y Gestión de Eventos', tipo: 'FP Grado Superior', familia: 'Hostelería y Turismo', cursos: [1, 2] }
];

async function populate() {
  console.log('Cleaning up old catalog...');
  const snapshot = await db.collection('oferta_educativa').get();
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  console.log('Inserting new catalog...');
  for (const item of catalog) {
    const fullDisplayName = `${item.sigla} - ${item.nombre}`;
    await db.collection('oferta_educativa').add({
      nombre: fullDisplayName,
      sigla: item.sigla,
      nombreLargo: item.nombre,
      tipo: item.tipo,
      familia: item.familia || '',
      cursos: item.cursos,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  console.log('Done!');
  process.exit();
}

populate();
