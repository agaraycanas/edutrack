const fs = require('fs');
const data = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'latin1');

const regex = /<asignatura nombre="([^"]+)">([\s\S]*?)<\/asignatura>/g;
let match;
while ((match = regex.exec(data)) !== null) {
    const asigName = match[1];
    const content = match[2];
    if (asigName.toLowerCase().includes('montaje')) {
        console.log(`SUBJECT: ${asigName}`);
        console.log(content);
    }
}
