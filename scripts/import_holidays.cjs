const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');
const FESTIVOS_XML = path.join(__dirname, '../legacy/programaciones/dat/festivos.xml');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Error: No se encontró serviceAccountKey.json en scripts/');
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  try {
    const xml = fs.readFileSync(FESTIVOS_XML, 'utf-8');
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
    const data = parser.parse(xml);

    const rawFestivos = [].concat(data.festivos.festivo || []);
    console.log(`Leídos ${rawFestivos.length} festivos individuales.`);

    // 1. Transformar y ordenar
    const festivos = rawFestivos.map(f => {
      // Formato YY-MM-DD
      const parts = f['#text'].split('-');
      const year = parseInt(parts[0]) < 50 ? 2000 + parseInt(parts[0]) : 1900 + parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      const date = new Date(year, month, day);
      return {
        nombre: f.causa === '-' ? 'Festivo' : f.causa,
        date: date,
        dateStr: date.toISOString().split('T')[0]
      };
    }).sort((a, b) => a.date - b.date);

    // 2. Agrupar por intervalos
    const intervals = [];
    if (festivos.length > 0) {
      let current = {
        nombre: festivos[0].nombre,
        startDate: festivos[0].dateStr,
        endDate: festivos[0].dateStr,
        lastDate: festivos[0].date
      };

      for (let i = 1; i < festivos.length; i++) {
        const f = festivos[i];
        const oneDayMs = 24 * 60 * 60 * 1000;
        const isConsecutive = (f.date - current.lastDate) <= oneDayMs + 1000; // +1000ms de margen

        if (isConsecutive && f.nombre === current.nombre) {
          current.endDate = f.dateStr;
          current.lastDate = f.date;
        } else {
          intervals.push(current);
          current = {
            nombre: f.nombre,
            startDate: f.dateStr,
            endDate: f.dateStr,
            lastDate: f.date
          };
        }
      }
      intervals.push(current);
    }

    console.log(`Agrupados en ${intervals.length} intervalos.`);

    // 3. Obtener el IES ID (usamos el primero que encontremos si no se especifica)
    const iesSnap = await db.collection('ies').limit(1).get();
    if (iesSnap.empty) {
      console.error('No se encontró ningún instituto en Firestore.');
      process.exit(1);
    }
    const iesId = iesSnap.docs[0].id;
    console.log(`Usando iesId: ${iesId}`);

    // 4. Subir a Firestore
    const batch = db.batch();
    const festivosColl = db.collection('festivos');

    for (const interval of intervals) {
      const docRef = festivosColl.doc();
      batch.set(docRef, {
        nombre: interval.nombre,
        startDate: interval.startDate,
        endDate: interval.startDate === interval.endDate ? null : interval.endDate,
        iesId: iesId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    await batch.commit();
    console.log('✓ Importación completada con éxito.');

  } catch (err) {
    console.error('Error:', err);
  }
}

main();
