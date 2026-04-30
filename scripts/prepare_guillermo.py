
import xml.etree.ElementTree as ET
import json
from datetime import datetime

UID_GUILLERMO = "bAcANx9mPkaAQEmJqimdaIPtFYX2"
IES_ID = "ies_rey_fernando"

def parse_date(d):
    if not d: return None
    try:
        parts = d.split('-')
        if len(parts) == 3:
            y, m, d_ = parts
            if len(y) == 2: y = "20" + y
            return f"{y}-{m.zfill(2)}-{d_.zfill(2)}"
        return d
    except:
        return None

def run():
    data = {
        "imparticiones": [],
        "horarios": [],
        "programaciones": [],
        "ausencias": []
    }

    # 1. Parse programaciones.xml
    try:
        with open("legacy/programaciones/dat/programaciones.xml", "rb") as f:
            content = f.read().decode("latin-1")
            content = content.replace('encoding="UTF-8"', 'encoding="latin-1"')
            root = ET.fromstring(content)
        
        # Use .// to find elements anywhere
        for curso in root.findall(".//curso"):
            curso_nombre = curso.get("nombre")
            for asig in curso.findall("asignatura"):
                asig_nombre = asig.get("nombre")
                for grupo in asig.findall("grupo"):
                    profe = grupo.get("profe", "").strip()
                    if profe == "Guillermo":
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
    except Exception as e:
        print(f"Error parsing programaciones: {e}")

    # 2. Parse seguimiento-Guillermo.xml
    try:
        with open("legacy/programaciones/dat/seguimiento-Guillermo.xml", "rb") as f:
            content = f.read().decode("latin-1")
            content = content.replace('encoding="UTF-8"', 'encoding="latin-1"')
            root = ET.fromstring(content)
        
        for asig in root.findall(".//asignatura"):
            nombre = asig.get("nombre")
            grupo = asig.get("grupo")
            for imp in data["imparticiones"]:
                if grupo == imp["legacy_grupo"]:
                    for tema_xml in asig.findall("tema"):
                        n = int(tema_xml.get("n"))
                        fini = parse_date(tema_xml.get("fini"))
                        ffin = parse_date(tema_xml.get("ffin"))
                        for t in imp["temas"]:
                            if t["id"] == n:
                                t["fechaInicio"] = fini if fini else ""
                                t["fechaFin"] = ffin if ffin else ""
    except Exception as e:
        print(f"Error parsing seguimiento: {e}")

    # 3. Parse faltas-Guillermo.xml
    try:
        with open("legacy/programaciones/dat/faltas-Guillermo.xml", "rb") as f:
            content = f.read().decode("utf-8")
            root = ET.fromstring(content)
        for falta in root.findall(".//falta"):
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
