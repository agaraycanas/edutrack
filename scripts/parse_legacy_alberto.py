
import xml.etree.ElementTree as ET
import json
from datetime import datetime

# Alberto's UID and IesId
UID = "ISJn6KtWynbbduJJJPBk1PDPa2f1"
IES_ID = "ies_rey_fernando"

def parse_date_legacy(date_str):
    if not date_str: return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        try:
            return datetime.strptime(date_str, "%d-%m-%Y").strftime("%Y-%m-%d")
        except ValueError:
            return None

def import_data():
    # 1. Parse Faltas
    legacy_faltas_path = "legacy/programaciones/dat/faltas-Alberto.xml"
    try:
        tree = ET.parse(legacy_faltas_path)
        root = tree.getroot()
        legacy_faltas = []
        for falta in root.findall("falta"):
            date = parse_date_legacy(falta.text.strip())
            if date:
                legacy_faltas.append({
                    "date": date,
                    "causa": falta.get("causa", "").strip()
                })
    except Exception as e:
        print(f"Error parsing faltas: {e}")
        legacy_faltas = []

    # 2. Parse Seguimiento
    legacy_seguimiento_path = "legacy/programaciones/dat/seguimiento-Alberto.xml"
    try:
        tree = ET.parse(legacy_seguimiento_path)
        root = tree.getroot()
        legacy_tracking = {}
        for asig in root.findall("asignatura"):
            grupo = asig.get("grupo")
            nombre = asig.get("nombre")
            key = f"{grupo}-{nombre}"
            temas = []
            for tema in asig.findall("tema"):
                temas.append({
                    "id": int(tema.get("n")),
                    "fechaInicio": parse_date_legacy(tema.get("fini")),
                    "fechaFin": parse_date_legacy(tema.get("ffin")),
                    "comentario": tema.get("comentario", "")
                })
            legacy_tracking[key] = temas
    except Exception as e:
        print(f"Error parsing seguimiento: {e}")
        legacy_tracking = {}

    with open("legacy_data.json", "w", encoding="utf-8") as f:
        json.dump({
            "legacy_faltas": legacy_faltas,
            "legacy_tracking": legacy_tracking
        }, f, ensure_ascii=False)

if __name__ == "__main__":
    import_data()
