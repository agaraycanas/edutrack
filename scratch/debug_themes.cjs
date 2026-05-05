const fs = require('fs');
const progXml = fs.readFileSync('legacy/programaciones/dat/programaciones.xml', 'latin1');

const asig = "Ofimática y archivo de documentos";
const grupo = "i2";

const asigRegex = new RegExp(`<asignatura nombre="${asig}">[\\s\\S]*?<grupo id="${grupo}"[\\s\\S]*?<\\/asignatura>`, 'g');
const match = asigRegex.exec(progXml);

console.log(match ? 'Match found' : 'No match');
if (match) {
  const temaRegex = /<tema n="(\d+)" titulo="([^"]+)" horas="(\d+)" \/>/g;
  let count = 0;
  while (temaRegex.exec(match[0])) count++;
  console.log('Themes count:', count);
}
