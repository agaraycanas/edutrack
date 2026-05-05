const fs = require('fs');
const data = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'latin1');

const regex = /<asignatura nombre="([^"]+)"><grupo id="([^"]+)" profe="Guillermo"([^>]+)\/>/g;
let match;
const assignments = [];

while ((match = regex.exec(data)) !== null) {
    const asig = match[1];
    const grupo = match[2];
    assignments.push({ asig, grupo });
}

console.log(JSON.stringify(assignments, null, 2));
