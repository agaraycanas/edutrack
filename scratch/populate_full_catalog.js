import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where } from "firebase/firestore";

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

const fullCatalog = [
  // SECUNDARIA Y BACHILLERATO
  { nombre: "ESO (Educación Secundaria Obligatoria)", cursos: [1, 2, 3, 4], tipo: "Secundaria" },
  { nombre: "Bachillerato de Ciencias y Tecnología", cursos: [1, 2], tipo: "Bachillerato" },
  { nombre: "Bachillerato de Humanidades y Ciencias Sociales", cursos: [1, 2], tipo: "Bachillerato" },
  { nombre: "Bachillerato de Artes (Artes Plásticas, Imagen y Diseño)", cursos: [1, 2], tipo: "Bachillerato" },
  { nombre: "Bachillerato de Artes (Música y Artes Escénicas)", cursos: [1, 2], tipo: "Bachillerato" },
  { nombre: "Bachillerato General", cursos: [1, 2], tipo: "Bachillerato" },

  // INFORMÁTICA Y COMUNICACIONES
  { nombre: "DAW - Desarrollo de Aplicaciones Web", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Informática y Comunicaciones" },
  { nombre: "DAM - Desarrollo de Aplicaciones Multiplataforma", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Informática y Comunicaciones" },
  { nombre: "ASIR - Administración de Sistemas Informáticos en Red", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Informática y Comunicaciones" },
  { nombre: "SMR - Sistemas Microinformáticos y Redes", cursos: [1, 2], tipo: "FP Grado Medio", familia: "Informática y Comunicaciones" },
  { nombre: "Informática y Comunicaciones (Básica)", cursos: [1, 2], tipo: "FP Básica", familia: "Informática y Comunicaciones" },

  // ADMINISTRACIÓN Y GESTIÓN
  { nombre: "Administración y Finanzas", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Administración y Gestión" },
  { nombre: "Asistencia a la Dirección", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Administración y Gestión" },
  { nombre: "Gestión Administrativa", cursos: [1, 2], tipo: "FP Grado Medio", familia: "Administración y Gestión" },

  // COMERCIO Y MARKETING
  { nombre: "Comercio Internacional", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Comercio y Marketing" },
  { nombre: "Marketing y Publicidad", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Comercio y Marketing" },
  { nombre: "Transporte y Logística", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Comercio y Marketing" },
  { nombre: "Actividades Comerciales", cursos: [1, 2], tipo: "FP Grado Medio", familia: "Comercio y Marketing" },

  // SANIDAD
  { nombre: "Anatomía Patológica y Citodiagnóstico", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Sanidad" },
  { nombre: "Higiene Bucodental", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Sanidad" },
  { nombre: "Laboratorio Clínico y Biomédico", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Sanidad" },
  { nombre: "Radioterapia y Dosimetría", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Sanidad" },
  { nombre: "Cuidados Auxiliares de Enfermería", cursos: [1], tipo: "FP Grado Medio", familia: "Sanidad" },
  { nombre: "Farmacia y Parafarmacia", cursos: [1, 2], tipo: "FP Grado Medio", familia: "Sanidad" },
  { nombre: "Emergencias Sanitarias", cursos: [1, 2], tipo: "FP Grado Medio", familia: "Sanidad" },

  // HOSTELERÍA Y TURISMO
  { nombre: "Agencias de Viajes y Gestión de Eventos", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Hostelería y Turismo" },
  { nombre: "Gestión de Alojamientos Turísticos", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Hostelería y Turismo" },
  { nombre: "Guía, Información y Asistencias Turísticas", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Hostelería y Turismo" },
  { nombre: "Dirección de Cocina", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Hostelería y Turismo" },
  { nombre: "Cocina y Gastronomía", cursos: [1, 2], tipo: "FP Grado Medio", familia: "Hostelería y Turismo" },

  // SERVICIOS SOCIOCULTURALES
  { nombre: "Educación Infantil", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Servicios Socioculturales y a la Comunidad" },
  { nombre: "Integración Social", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Servicios Socioculturales y a la Comunidad" },
  { nombre: "Atención a Personas en Situación de Dependencia", cursos: [1, 2], tipo: "FP Grado Medio", familia: "Servicios Socioculturales y a la Comunidad" },

  // IMAGEN Y SONIDO
  { nombre: "Animaciones 3D, Juegos y Entornos Interactivos", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Imagen y Sonido" },
  { nombre: "Producción de Audiovisuales y Espectáculos", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Imagen y Sonido" },
  { nombre: "Video Disc-Jockey y Sonido", cursos: [1, 2], tipo: "FP Grado Medio", familia: "Imagen y Sonido" },

  // ELECTRICIDAD Y ELECTRÓNICA
  { nombre: "Sistemas Electrotécnicos y Automatizados", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Electricidad y Electrónica" },
  { nombre: "Mantenimiento Electrónico", cursos: [1, 2], tipo: "FP Grado Superior", familia: "Electricidad y Electrónica" },
  { nombre: "Instalaciones Eléctricas y Automáticas", cursos: [1, 2], tipo: "FP Grado Medio", familia: "Electricidad y Electrónica" }
];

async function populate() {
  console.log("Starting full catalog population...");
  const colRef = collection(db, "oferta_educativa");
  
  for (const item of fullCatalog) {
    const q = query(colRef, where("nombre", "==", item.nombre));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      await addDoc(colRef, item);
      console.log(`Added: ${item.nombre}`);
    } else {
      console.log(`Skipped: ${item.nombre} (already exists)`);
    }
  }
  console.log("Finished!");
}

populate().catch(console.error);
