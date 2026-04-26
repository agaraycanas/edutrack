const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, query, where, serverTimestamp } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyCh4uBQgjuvjhVorTVjjiV27pVv8LX2pNk",
  authDomain: "edutrack-803e0.firebaseapp.com",
  projectId: "edutrack-803e0",
  storageBucket: "edutrack-803e0.firebasestorage.app",
  messagingSenderId: "556182154739",
  appId: "1:556182154739:web:a5cc1ff521cefbd503b686"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const subjectsToPopulate = [
  // ESTÉTICA Y BELLEZA (xAKyA6eCxI6U2uHcDFBh)
  { 
    iesId: "ies_rey_fernando",
    iesEstudioId: "xAKyA6eCxI6U2uHcDFBh",
    titulacionNombre: "EB - Estética y Belleza",
    departamento: "Imagen Personal",
    subjects: [
      { nombre: "Estética de manos y pies", sigla: "EMP", curso: 1 },
      { nombre: "Técnicas de higiene facial y corporal", sigla: "THFC", curso: 1 },
      { nombre: "Depilación mecánica y decoloración del vello", sigla: "DMDV", curso: 1 },
      { nombre: "Maquillaje", sigla: "MAQ", curso: 1 },
      { nombre: "Cosmetología para Estética y Belleza", sigla: "COS", curso: 1 },
      { nombre: "Anatomía y fisiología humanas básicas", sigla: "AFB", curso: 1 },
      { nombre: "Formación y Orientación Laboral", sigla: "FOL", curso: 1 },
      { nombre: "Actividades en cabina de estética", sigla: "ACE", curso: 2 },
      { nombre: "Imagen corporal y hábitos saludables", sigla: "ICHS", curso: 2 },
      { nombre: "Perfumería y cosmética natural", sigla: "PCN", curso: 2 },
      { nombre: "Empresa e iniciativa emprendedora", sigla: "EIE", curso: 2 },
      { nombre: "Estética de manos y pies II", sigla: "EMP2", curso: 2 }
    ]
  },
  // ESO - Educación Secundaria Obligatoria (rhJ5JyFXebQ5EK7nJ6Id) - Missing core subjects
  {
    iesId: "ies_rey_fernando",
    iesEstudioId: "rhJ5JyFXebQ5EK7nJ6Id",
    titulacionNombre: "ESO - Educación Secundaria Obligatoria",
    departamento: "General",
    subjects: [
      { nombre: "Lengua Castellana y Literatura", sigla: "LCL", curso: 1 },
      { nombre: "Matemáticas", sigla: "MAT", curso: 1 },
      { nombre: "Geografía e Historia", sigla: "GH", curso: 1 },
      { nombre: "Biología y Geología", sigla: "BG", curso: 1 },
      { nombre: "Inglés", sigla: "ING", curso: 1 },
      { nombre: "Educación Física", sigla: "EF", curso: 1 },
      { nombre: "Plástica y Visual", sigla: "EPV", curso: 1 },
      { nombre: "Música", sigla: "MUS", curso: 1 },
      { nombre: "Religión / Valores Éticos", sigla: "REL", curso: 1 }
    ]
  }
];

async function run() {
  console.log("Starting population...");
  const colRef = collection(db, "ies_asignaturas");

  for (const group of subjectsToPopulate) {
    console.log(`Processing: ${group.titulacionNombre}`);
    for (const sub of group.subjects) {
      // Check if exists
      const q = query(colRef, 
        where("iesId", "==", group.iesId),
        where("iesEstudioId", "==", group.iesEstudioId),
        where("nombre", "==", sub.nombre),
        where("curso", "==", sub.curso)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        await addDoc(colRef, {
          iesId: group.iesId,
          iesEstudioId: group.iesEstudioId,
          titulacionNombre: group.titulacionNombre,
          departamento: group.departamento,
          nombre: sub.nombre,
          sigla: sub.sigla,
          curso: sub.curso,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        console.log(`  Added: ${sub.nombre}`);
      } else {
        console.log(`  Skipped: ${sub.nombre} (already exists)`);
      }
    }
  }
  console.log("Finished!");
}

run().catch(console.error);
