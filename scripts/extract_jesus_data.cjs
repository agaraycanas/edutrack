const fs = require('fs');
const data = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'latin1');

// Regex for Jesus's groups
// Example: <asignatura nombre="..."><grupo id="..." profe="Jesus" ... />
const regex = /<asignatura nombre="([^"]+)"><grupo id="([^"]+)" profe="Jesus"([^>]+)\/>/g;
let match;
const assignments = [];

while ((match = regex.exec(data)) !== null) {
    const asig = match[1];
    const grupo = match[2];
    const attrs = match[3];
    
    // Parse attributes (Mon="0" Tue="2" etc.)
    const schedule = {};
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    days.forEach(day => {
        const dMatch = new RegExp(`${day}="(\\d+)"`).exec(attrs);
        schedule[day] = dMatch ? parseInt(dMatch[1]) : 0;
    });

    assignments.push({ asig, grupo, schedule });
}

console.log(JSON.stringify(assignments, null, 2));
