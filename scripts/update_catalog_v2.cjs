const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const catalogUpdates = [
  {
    id: 'DAW_GS',
    nombre: 'DAW - Desarrollo de Aplicaciones Web',
    tipo: 'FP Grado Superior',
    familia: 'Informática y Comunicaciones',
    cursos: [1, 2],
    asignaturas: [
      { nombre: 'Sistemas informáticos', sigla: 'SI', curso: 1 },
      { nombre: 'Bases de Datos', sigla: 'BD', curso: 1 },
      { nombre: 'Programación', sigla: 'PROG', curso: 1 },
      { nombre: 'Lenguajes de marcas y sistemas de gestión de información', sigla: 'LM', curso: 1 },
      { nombre: 'Entornos de desarrollo', sigla: 'ED', curso: 1 },
      { nombre: 'IPE I - Itinerario Personal para la Empleabilidad', sigla: 'IPE1', curso: 1 },
      { nombre: 'Módulo Optativo I', sigla: 'OPT1', curso: 1 },
      { nombre: 'Desarrollo web en entorno cliente', sigla: 'DWEC', curso: 2 },
      { nombre: 'Desarrollo web en entorno servidor', sigla: 'DWES', curso: 2 },
      { nombre: 'Despliegue de aplicaciones web', sigla: 'DAW', curso: 2 },
      { nombre: 'Diseño de interfaces web', sigla: 'DIW', curso: 2 },
      { nombre: 'IPE II - Itinerario Personal para la Empleabilidad', sigla: 'IPE2', curso: 2 },
      { nombre: 'Proyecto de desarrollo de aplicaciones web', sigla: 'PROY', curso: 2 },
      { nombre: 'Formación en centros de trabajo', sigla: 'FCT', curso: 2 },
      { nombre: 'Módulo Optativo II', sigla: 'OPT2', curso: 2 }
    ]
  },
  {
    id: 'IFC_BASICA',
    nombre: 'IFC - Informática de Oficina',
    tipo: 'FP Grado Básico',
    familia: 'Informática y Comunicaciones',
    cursos: [1, 2],
    asignaturas: [
      { nombre: 'Montaje y mantenimiento de sistemas y componentes informáticos', sigla: 'MMS', curso: 1 },
      { nombre: 'Operaciones auxiliares para la configuración y explotación', sigla: 'OACE', curso: 1 },
      { nombre: 'Ciencias aplicadas I', sigla: 'CA1', curso: 1 },
      { nombre: 'Comunicación y sociedad I', sigla: 'CS1', curso: 1 },
      { nombre: 'Ofimática y archivo de documentos', sigla: 'OAD', curso: 2 },
      { nombre: 'Instalación y mantenimiento de redes para transmisión de datos', sigla: 'IMR', curso: 2 },
      { nombre: 'Ciencias aplicadas II', sigla: 'CA2', curso: 2 },
      { nombre: 'Comunicación y sociedad II', sigla: 'CS2', curso: 2 },
      { nombre: 'Formación en centros de trabajo', sigla: 'FCT', curso: 2 }
    ]
  },
  {
    id: 'SMR_GM',
    nombre: 'SMR - Sistemas Microinformáticos y Redes',
    tipo: 'FP Grado Medio',
    familia: 'Informática y Comunicaciones',
    cursos: [1, 2],
    asignaturas: [
      { nombre: 'Montaje y mantenimiento de equipos', sigla: 'MME', curso: 1 },
      { nombre: 'Sistemas operativos monopuesto', sigla: 'SOM', curso: 1 },
      { nombre: 'Aplicaciones ofimáticas', sigla: 'AO', curso: 1 },
      { nombre: 'Redes locales', sigla: 'RL', curso: 1 },
      { nombre: 'IPE I - Itinerario Personal para la Empleabilidad', sigla: 'IPE1', curso: 1 },
      { nombre: 'Módulo Optativo I', sigla: 'OPT1', curso: 1 },
      { nombre: 'Sistemas operativos en red', sigla: 'SOR', curso: 2 },
      { nombre: 'Seguridad informática', sigla: 'SI', curso: 2 },
      { nombre: 'Servicios en red', sigla: 'SR', curso: 2 },
      { nombre: 'Aplicaciones web', sigla: 'AW', curso: 2 },
      { nombre: 'IPE II - Itinerario Personal para la Empleabilidad', sigla: 'IPE2', curso: 2 },
      { nombre: 'Formación en centros de trabajo', sigla: 'FCT', curso: 2 },
      { nombre: 'Módulo Optativo II', sigla: 'OPT2', curso: 2 }
    ]
  }
];

async function updateCatalog() {
  console.log("--- Actualizando Catálogo Global ---");
  for (const item of catalogUpdates) {
    await db.collection('oferta_educativa').doc(item.id).set(item, { merge: true });
    console.log(`- Actualizado: ${item.nombre}`);
  }
  process.exit(0);
}

updateCatalog().catch(console.error);
