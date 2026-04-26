const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, serverTimestamp } = require('firebase/firestore');

const firebaseConfig = {
  projectId: 'edutrack-803e0'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const studies = [
  {
    id: '0JKS51nEBzvL05ZkEqdP',
    nombre: 'DAW - Desarrollo de Aplicaciones Web',
    dept: 'Informática y Comunicaciones',
    subjects: [
      { n: 'Sistemas Informáticos', s: 'SI', c: 1 },
      { n: 'Bases de Datos', s: 'BD', c: 1 },
      { n: 'Programación', s: 'PROG', c: 1 },
      { n: 'Lenguajes de Marcas y Sistemas de Gestión de Información', s: 'LMSG', c: 1 },
      { n: 'Entornos de Desarrollo', s: 'ED', c: 1 },
      { n: 'Formación y Orientación Laboral', s: 'FOL', c: 1 },
      { n: 'Desarrollo Web en Entorno Cliente', s: 'DWEC', c: 2 },
      { n: 'Desarrollo Web en Entorno Servidor', s: 'DWES', c: 2 },
      { n: 'Despliegue de Aplicaciones Web', s: 'DAW', c: 2 },
      { n: 'Diseño de Interfaces Web', s: 'DIW', c: 2 },
      { n: 'Empresa e Iniciativa Emprendedora', s: 'EIE', c: 2 }
    ]
  },
  {
    id: 'aiSkVWbNBLK6PPhWKdEh',
    nombre: 'DAM - Desarrollo de Aplicaciones Multiplataforma',
    dept: 'Informática y Comunicaciones',
    subjects: [
      { n: 'Sistemas Informáticos', s: 'SI', c: 1 },
      { n: 'Bases de Datos', s: 'BD', c: 1 },
      { n: 'Programación', s: 'PROG', c: 1 },
      { n: 'Lenguajes de Marcas y Sistemas de Gestión de Información', s: 'LMSG', c: 1 },
      { n: 'Entornos de Desarrollo', s: 'ED', c: 1 },
      { n: 'Formación y Orientación Laboral', s: 'FOL', c: 1 },
      { n: 'Acceso a Datos', s: 'AD', c: 2 },
      { n: 'Desarrollo de Interfaces', s: 'DI', c: 2 },
      { n: 'Programación Multimedia y Dispositivos Móviles', s: 'PMDM', c: 2 },
      { n: 'Programación de Servicios y Procesos', s: 'PSP', c: 2 },
      { n: 'Sistemas de Gestión Empresarial', s: 'SGE', c: 2 },
      { n: 'Empresa e Iniciativa Emprendedora', s: 'EIE', c: 2 }
    ]
  },
  {
    id: 'oDDucwALpyjP39H2BEmE',
    nombre: 'ASIR - Administración de Sistemas Informáticos en Red',
    dept: 'Informática y Comunicaciones',
    subjects: [
      { n: 'Implantación de Sistemas Operativos', s: 'ISO', c: 1 },
      { n: 'Planificación y Administración de Redes', s: 'PAR', c: 1 },
      { n: 'Fundamentos de Hardware', s: 'FH', c: 1 },
      { n: 'Gestión de Bases de Datos', s: 'GBD', c: 1 },
      { n: 'Lenguajes de Marcas y Sistemas de Gestión de Información', s: 'LMSG', c: 1 },
      { n: 'Formación y Orientación Laboral', s: 'FOL', c: 1 },
      { n: 'Administración de Sistemas Operativos', s: 'ASO', c: 2 },
      { n: 'Servicios de Red e Internet', s: 'SRI', c: 2 },
      { n: 'Implantación de Aplicaciones Web', s: 'IAW', c: 2 },
      { n: 'Administración de Sistemas Gestores de Bases de Datos', s: 'ASGBD', c: 2 },
      { n: 'Seguridad y Alta Disponibilidad', s: 'SAD', c: 2 },
      { n: 'Empresa e Iniciativa Emprendedora', s: 'EIE', c: 2 }
    ]
  },
  {
    id: 'IRCwWmikBP6CKKipMQUl',
    nombre: 'SMR - Sistemas Microinformáticos y Redes',
    dept: 'Informática y Comunicaciones',
    subjects: [
      { n: 'Montaje y Mantenimiento de Equipos', s: 'MME', c: 1 },
      { n: 'Sistemas Operativos Monopuesto', s: 'SOM', c: 1 },
      { n: 'Aplicaciones Ofimáticas', s: 'AO', c: 1 },
      { n: 'Redes Locales', s: 'RL', c: 1 },
      { n: 'Formación y Orientación Laboral', s: 'FOL', c: 1 },
      { n: 'Sistemas Operativos en Red', s: 'SOR', c: 2 },
      { n: 'Servicios en Red', s: 'SR', c: 2 },
      { n: 'Aplicaciones Web', s: 'AW', c: 2 },
      { n: 'Seguridad Informática', s: 'SI', c: 2 },
      { n: 'Empresa e Iniciativa Emprendedora', s: 'EIE', c: 2 }
    ]
  },
  {
    id: 'gIdmyMMgviW7WXgcYNLo',
    nombre: 'BACH - Bachillerato General',
    dept: 'General',
    subjects: [
      { n: 'Lengua Castellana y Literatura I', s: 'LCL1', c: 1 },
      { n: 'Primera Lengua Extranjera I (Inglés)', s: 'ING1', c: 1 },
      { n: 'Filosofía', s: 'FIL', c: 1 },
      { n: 'Educación Física', s: 'EF', c: 1 },
      { n: 'Matemáticas I', s: 'MAT1', c: 1 },
      { n: 'Lengua Castellana y Literatura II', s: 'LCL2', c: 2 },
      { n: 'Primera Lengua Extranjera II (Inglés)', s: 'ING2', c: 2 },
      { n: 'Historia de España', s: 'HIS', c: 2 },
      { n: 'Historia de la Filosofía', s: 'HFIL', c: 2 },
      { n: 'Matemáticas II', s: 'MAT2', c: 2 }
    ]
  }
];

async function populate() {
  const colRef = collection(db, 'ies_asignaturas');
  let count = 0;

  for (const study of studies) {
    console.log(`Populating ${study.nombre}...`);
    for (const sub of study.subjects) {
      await addDoc(colRef, {
        iesId: 'ies_rey_fernando',
        iesEstudioId: study.id,
        nombre: sub.n,
        sigla: sub.s,
        curso: sub.c,
        departamento: study.dept,
        titulacionNombre: study.nombre,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      count++;
    }
  }

  console.log(`Done! Added ${count} subjects.`);
  process.exit(0);
}

populate().catch(console.error);
