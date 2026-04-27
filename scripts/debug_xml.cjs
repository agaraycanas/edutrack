const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const PROGRAMACIONES_XML = path.join(__dirname, '../legacy/programaciones/dat/programaciones.xml');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const progXml = fs.readFileSync(PROGRAMACIONES_XML, 'utf-8');
const progData = parser.parse(progXml);

const departamentos = Array.isArray(progData.programacion.departamento)
  ? progData.programacion.departamento
  : [progData.programacion.departamento];

for (const dep of departamentos) {
  const cursos = Array.isArray(dep.curso) ? dep.curso : [dep.curso];
  for (const curso of cursos) {
    const asignaturas = Array.isArray(curso.asignatura) ? curso.asignatura : [curso.asignatura];
    for (const asig of asignaturas) {
      if (asig.nombre === "Programación" && asig.grupo.id === "w1") {
        console.log("Asignatura encontrada:", asig.nombre);
        console.log("Grupo:", asig.grupo.id);
        const temas = Array.isArray(asig.tema) ? asig.tema : [asig.tema];
        console.log("Número de temas encontrados:", temas.length);
        temas.forEach(t => console.log(`Tema ${t.n}: ${t.titulo}`));
      }
    }
  }
}
