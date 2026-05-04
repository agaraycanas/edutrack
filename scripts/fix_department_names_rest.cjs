/**
 * fix_department_names_rest.cjs
 * 
 * Corrige referencias al departamento antiguo "Informática" 
 * usando la REST API de Firestore con el token del Firebase CLI.
 * 
 * Uso:
 *   1. Primero obtén el token: firebase login:ci  (o usa el token del CLI)
 *   2. node scripts/fix_department_names_rest.cjs [--dry-run]
 * 
 * O usa la variable de entorno FIREBASE_TOKEN:
 *   $env:FIREBASE_TOKEN = "tu_token"; node scripts/fix_department_names_rest.cjs
 */

const https = require('https');
const { execSync } = require('child_process');

const DRY_RUN   = process.argv.includes('--dry-run');
const PROJECT   = 'edutrack-803e0';
const IES_ID    = 'ies_rey_fernando';
const OLD_NAME  = 'Informática';
const NEW_NAME  = 'Informática y Comunicaciones';
const BASE_URL  = `firestore.googleapis.com`;
const DB_PATH   = `projects/${PROJECT}/databases/(default)/documents`;

let totalUpdated = 0;

// ─── Obtener token ────────────────────────────────────────────────────────────

function getToken() {
  if (process.env.FIREBASE_TOKEN) {
    return process.env.FIREBASE_TOKEN;
  }
  // Intentar obtener el token del config de gcloud
  try {
    const token = execSync(
      'npx firebase-tools@latest --project edutrack-803e0 tokens:print 2>nul',
      { encoding: 'utf8', cwd: process.cwd() }
    ).trim();
    if (token) return token;
  } catch {}

  // Usar gcloud si está disponible
  try {
    const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
    if (token) return token;
  } catch {}

  return null;
}

// ─── REST helpers ─────────────────────────────────────────────────────────────

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: BASE_URL,
      path: `/v1/${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function firestoreValue(val) {
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(firestoreValue) } };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') return { integerValue: String(val) };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (val && typeof val === 'object') {
    const fields = {};
    for (const k of Object.keys(val)) fields[k] = firestoreValue(val[k]);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function fromFirestoreValue(fval) {
  if (!fval) return null;
  if ('stringValue'  in fval) return fval.stringValue;
  if ('integerValue' in fval) return parseInt(fval.integerValue);
  if ('doubleValue'  in fval) return fval.doubleValue;
  if ('booleanValue' in fval) return fval.booleanValue;
  if ('nullValue'    in fval) return null;
  if ('arrayValue'   in fval) {
    return (fval.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in fval) {
    const obj = {};
    for (const [k, v] of Object.entries(fval.mapValue.fields || {})) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }
  return null;
}

async function listDocs(collection, token) {
  const docs = [];
  let pageToken = null;
  do {
    const path = `${DB_PATH}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await request('GET', path, null, token);
    if (res.status !== 200) throw new Error(`Error listando ${collection}: ${JSON.stringify(res.body)}`);
    (res.body.documents || []).forEach(d => docs.push(d));
    pageToken = res.body.nextPageToken;
  } while (pageToken);
  return docs;
}

async function updateDoc(docName, fields, token) {
  const updateMask = Object.keys(fields).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const body = { name: docName, fields: {} };
  for (const [k, v] of Object.entries(fields)) {
    body.fields[k] = firestoreValue(v);
  }
  const path = `${docName.replace('projects/', '').replace(/^.*\/documents\//, `${DB_PATH}/`)}?${updateMask}`;
  // Use the full name directly
  const fullPath = `${docName.substring(docName.indexOf('/') + 1)}?${updateMask}`;
  const res = await request('PATCH', fullPath, body, token);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Error actualizando ${docName}: ${JSON.stringify(res.body)}`);
  }
  return res;
}

// ─── Patch helper (más simple) ─────────────────────────────────────────────

async function patchDoc(docFullName, fields, token) {
  // docFullName: projects/.../documents/collection/docId
  const fieldPaths = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
  const body = { fields: {} };
  for (const [k, v] of Object.entries(fields)) {
    body.fields[k] = firestoreValue(v);
  }
  // Extract the path after /v1/
  const apiPath = docFullName + '?' + fieldPaths;
  const res = await request('PATCH', apiPath, body, token);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`PATCH error (${res.status}) on ${docFullName}: ${JSON.stringify(res.body).substring(0, 200)}`);
  }
}

// ─── Fix ies_estudios ─────────────────────────────────────────────────────────

async function fixEstudios(token) {
  console.log('\n=== ies_estudios ===');
  const docs = await listDocs('ies_estudios', token);
  let count = 0;

  for (const doc of docs) {
    const fields = doc.fields || {};
    const iesId  = fromFirestoreValue(fields.iesId);
    if (iesId !== IES_ID) continue;

    const depts = fromFirestoreValue(fields.departamentos);
    if (!Array.isArray(depts) || !depts.includes(OLD_NAME)) continue;

    const newDepts = [...new Set(depts.map(d => d === OLD_NAME ? NEW_NAME : d))];
    const nombre   = fromFirestoreValue(fields.nombre) || '?';
    console.log(`  "${nombre}": ${JSON.stringify(depts)} → ${JSON.stringify(newDepts)}`);

    if (!DRY_RUN) {
      await patchDoc(doc.name, { departamentos: newDepts }, token);
    }
    count++;
  }
  console.log(`  → ${count} estudios afectados`);
  totalUpdated += count;
}

// ─── Fix ies_asignaturas ──────────────────────────────────────────────────────

async function fixAsignaturas(token) {
  console.log('\n=== ies_asignaturas ===');
  const docs = await listDocs('ies_asignaturas', token);
  let count = 0;

  for (const doc of docs) {
    const fields = doc.fields || {};
    const iesId  = fromFirestoreValue(fields.iesId);
    const dept   = fromFirestoreValue(fields.departamento);
    if (iesId !== IES_ID || dept !== OLD_NAME) continue;

    const nombre = fromFirestoreValue(fields.nombre) || '?';
    console.log(`  "${nombre}" → departamento: "${NEW_NAME}"`);

    if (!DRY_RUN) {
      await patchDoc(doc.name, { departamento: NEW_NAME }, token);
    }
    count++;
  }
  console.log(`  → ${count} asignaturas afectadas`);
  totalUpdated += count;
}

// ─── Fix usuarios ─────────────────────────────────────────────────────────────

async function fixUsuarios(token) {
  console.log('\n=== usuarios ===');
  const docs = await listDocs('usuarios', token);
  let count = 0;

  for (const doc of docs) {
    const fields = doc.fields || {};
    const roles  = fromFirestoreValue(fields.roles);
    if (!Array.isArray(roles)) continue;

    let changed = false;
    const newRoles = roles.map(r => {
      if (r && r.iesId === IES_ID && r.departamento === OLD_NAME) {
        changed = true;
        return { ...r, departamento: NEW_NAME };
      }
      return r;
    });

    if (!changed) continue;

    const email = fromFirestoreValue(fields.email) || doc.name.split('/').pop();
    console.log(`  Usuario "${email}" con rol en departamento antiguo`);
    if (!DRY_RUN) {
      await patchDoc(doc.name, { roles: newRoles }, token);
    }
    count++;
  }
  console.log(`  → ${count} usuarios afectados`);
  totalUpdated += count;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('========================================');
  console.log(' EduTrack – Fix Department Names');
  console.log(` IES     : ${IES_ID}`);
  console.log(` Cambio  : "${OLD_NAME}" → "${NEW_NAME}"`);
  if (DRY_RUN) console.log(' MODO    : DRY-RUN (sin cambios)');
  console.log('========================================');

  const token = getToken();
  if (!token) {
    console.error('\n❌ No se encontraron credenciales.');
    console.error('   Opciones:');
    console.error('   1. Instala gcloud y ejecuta: gcloud auth application-default login');
    console.error('   2. O establece la variable de entorno FIREBASE_TOKEN con el output de: firebase login:ci');
    process.exit(1);
  }
  console.log('\n✓ Credenciales encontradas');

  await fixEstudios(token);
  await fixAsignaturas(token);
  await fixUsuarios(token);

  console.log('\n========================================');
  console.log(` Total afectados: ${totalUpdated} documentos`);
  if (DRY_RUN) console.log(' (DRY-RUN: sin cambios reales)');
  console.log('========================================');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message);
  process.exit(1);
});
