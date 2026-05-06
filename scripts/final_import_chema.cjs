const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

async function importChemaData() {
    const keyPath = path.join(__dirname, 'serviceAccountKey.json');
    
    if (!fs.existsSync(keyPath)) {
        console.error("\n❌ ERROR: No se encuentra el archivo 'scripts/serviceAccountKey.json'");
        console.log("\nPara continuar con la migración, por favor:");
        console.log("1. Ve a la Consola de Firebase -> Configuración del proyecto -> Cuentas de servicio.");
        console.log("2. Haz clic en 'Generar nueva clave privada'.");
        console.log("3. Guarda el archivo como 'serviceAccountKey.json' dentro de la carpeta 'scripts/'.");
        console.log("4. Vuelve a ejecutar este script.\n");
        process.exit(1);
    }

    const serviceAccount = require(keyPath);
    initializeApp({ credential: cert(serviceAccount) });
    const db = getFirestore();

    console.log("--- Iniciando Importación Final de Chema ---");

    const dataPath = path.join(__dirname, 'normalized_chema_data.json');
    if (!fs.existsSync(dataPath)) {
        console.error("Error: No se encuentra normalized_chema_data.json. Ejecuta primero el parser.");
        process.exit(1);
    }

    const normalizedData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const UID = 'UhIIfgCMP2TyIwybjJkRdqpGdzH2'; // Chema
    const IES_ID = 'ies_rey_fernando';

    for (const item of normalizedData) {
        console.log(`\nProcesando: ${item.asignatura} (${item.grupo})`);
        
        // 1. Buscar todas las imparticiones del usuario en este IES
        // Simplificamos la consulta para evitar requerir índices compuestos
        const impSnap = await db.collection('ies_imparticiones')
            .where('iesId', '==', IES_ID)
            .where('usuarioId', '==', UID)
            .get();

        const targetImp = impSnap.docs.find(doc => {
            const d = doc.data();
            const nombreCoincide = (d.asignaturaNombre || '').toLowerCase() === item.asignatura.toLowerCase();
            const grupoCoincide = (d.grupoNombre || '').toLowerCase().includes(item.grupo.toLowerCase()) || 
                                 (d.label || '').toLowerCase().includes(item.grupo.toLowerCase());
            return nombreCoincide && grupoCoincide;
        });

        if (!targetImp) {
            console.warn(`⚠️  No se encontró la impartición en Firestore para ${item.asignatura}. Asegúrate de haber ejecutado migrate_chema.cjs primero.`);
            continue;
        }

        const impId = targetImp.id;
        console.log(`✅ Impartición encontrada: ${impId}`);

        // 2. Actualizar Programación Resumen (Legacy)
        await db.collection('profesor_programaciones').doc(impId).set({
            imparticionId: impId,
            usuarioId: UID,
            temas: item.temas,
            updatedAt: new Date(),
            normalized: true
        });

        // 3. Actualizar Temas Individuales (Nueva Estructura)
        // WIPE existing themes for this imparticion to ensure a clean state
        const temasSnap = await db.collection('ies_programacion_temas')
            .where('imparticionId', '==', impId)
            .get();
        
        const deleteBatch = db.batch();
        temasSnap.forEach(doc => {
            deleteBatch.delete(doc.ref);
        });
        await deleteBatch.commit();
        console.log(`🧹 Temas antiguos eliminados para ${impId}`);

        const batch = db.batch();
        for (const tema of item.temas) {
            const temaRef = db.collection('ies_programacion_temas').doc();
            batch.set(temaRef, {
                imparticionId: impId,
                n: tema.id,
                titulo: tema.nombre,
                horas: tema.horasEstimadas,
                fechaInicio: tema.fechaInicio || '',
                fechaFin: tema.fechaFin || '',
                observaciones: tema.observaciones || '',
                completado: tema.completado || false,
                updatedAt: new Date()
            });
        }
        await batch.commit();
        
        console.log(`🚀 Programación y ${item.temas.length} temas individuales creados (limpios).`);
    }

    console.log("\n--- Proceso completado ---");
}

importChemaData().catch(console.error);
