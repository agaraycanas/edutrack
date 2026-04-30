
import xml.etree.ElementTree as ET
import json
from datetime import datetime

UID_GUILLERMO = "bAcANx9mPkaAQEmJqimdaIPtFYX2"
IES_ID = "ies_rey_fernando"

def parse_date(d):
    if not d: return None
    try:
        return datetime.strptime(d, "%Y-%m-%d").strftime("%Y-%m-%d")
    except:
        return None

def run():
    data = {
        "imparticiones": [],
        "horarios": [],
        "programaciones": [],
        "ausencias": []
    }

    # 1. Parse programaciones.xml for subjects and syllabus
    tree = ET.parse("legacy/programaciones/dat/programaciones.xml")
    root = tree.getroot()
    
    for curso in root.findall("curso"):
        curso_nombre = curso.get("nombre")
        for asig in curso.findall("asignatura"):
            asig_nombre = asig.get("nombre")
            for grupo in asig.findall("grupo"):
                if grupo.get("profe") == "Guillermo":
                    # This is Guillermo's subject
                    imp = {
                        "legacy_grupo": grupo.get("id"),
                        "legacy_curso": curso_nombre,
                        "asignatura_nombre": asig_nombre,
                        "pattern": {
                            "lunes": int(grupo.get("Mon", 0)),
                            "martes": int(grupo.get("Tue", 0)),
                            "miercoles": int(grupo.get("Wed", 0)),
                            "jueves": int(grupo.get("Thu", 0)),
                            "viernes": int(grupo.get("Fri", 0))
                        }
                    }
                    
                    temas = []
                    for tema in asig.findall("tema"):
                        temas.append({
                            "id": int(tema.get("n")),
                            "nombre": tema.get("titulo"),
                            "horasEstimadas": int(tema.get("horas", 0)),
                            "fechaInicio": "",
                            "fechaFin": ""
                        })
                    
                    imp["temas"] = temas
                    data["imparticiones"].append(imp)

    # 2. Parse seguimiento-Guillermo.xml for dates
    try:
        tree = ET.parse("legacy/programaciones/dat/seguimiento-Guillermo.xml")
        root = tree.getroot()
        for asig in root.findall("asignatura"):
            nombre = asig.get("nombre")
            grupo = asig.get("grupo")
            # Find matching imparticion
            for imp in data["imparticiones"]:
                if imp["asignatura_nombre"] == nombre and imp["legacy_grupo"] == grupo:
                    for tema_xml in asig.findall("tema"):
                        n = int(tema_xml.get("n"))
                        fini = parse_date(tema_xml.get("fini"))
                        ffin = parse_date(tema_xml.get("ffin"))
                        for t in imp["temas"]:
                            if t["id"] == n:
                                t["fechaInicio"] = fini if fini else ""
                                t["fechaFin"] = ffin if ffin else ""
    except:
        pass

    # 3. Parse faltas-Guillermo.xml
    try:
        tree = ET.parse("legacy/programaciones/dat/faltas-Guillermo.xml")
        root = tree.getroot()
        for falta in root.findall("falta"):
            date = parse_date(falta.text.strip())
            if date:
                data["ausencias"].append({
                    "startDate": date,
                    "endDate": None,
                    "motivo": falta.get("causa", "Ausencia legacy")
                })
    except:
        pass

    with open("guillermo_import.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    run()
