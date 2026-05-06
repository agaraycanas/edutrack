import xml.etree.ElementTree as ET
import json
import os
import re

def fix_encoding(text):
    if not text: return ""
    # Common latin-1 to utf-8 mess fixes
    replaces = {
        'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú',
        'Ã±': 'ñ', 'Ã\u0081': 'Á', 'Ã\u0089': 'É', 'Ã\u008D': 'Í',
        'Ã\u0093': 'Ó', 'Ã\u009A': 'Ú', 'Ã\u0091': 'Ñ'
    }
    for k, v in replaces.items():
        text = text.replace(k, v)
    return text

def pad_date(date_str):
    if not date_str or date_str == "null": return None
    parts = date_str.split('-')
    if len(parts) != 3: return date_str
    return f"{parts[0]}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"

def parse_chema_data():
    prog_path = 'legacy/programaciones/dat/programaciones.xml'
    seg_path = 'legacy/programaciones/dat/seguimiento-Chema.xml'
    
    if not os.path.exists(prog_path) or not os.path.exists(seg_path):
        print("Error: XML files not found.")
        return

    # Try UTF-8 first as per XML header
    try:
        with open(prog_path, 'r', encoding='utf-8') as f:
            prog_content = f.read()
    except UnicodeDecodeError:
        with open(prog_path, 'r', encoding='latin-1') as f:
            prog_content = f.read()
    
    try:
        with open(seg_path, 'r', encoding='utf-8') as f:
            seg_content = f.read()
    except UnicodeDecodeError:
        with open(seg_path, 'r', encoding='latin-1') as f:
            seg_content = f.read()

    # Subjects for Chema
    assignments = [
        {"asig": "Sistemas informáticos", "grupo": "w1"},
        {"asig": "Sistemas informáticos", "grupo": "m1d"},
        {"asig": "Desarrollo de interfaces", "grupo": "m2d"},
        {"asig": "Fundamentos de las Bases de datos", "grupo": "s1a"}
    ]

    results = []

    for ass in assignments:
        asig_name = ass["asig"]
        grupo_id = ass["grupo"]
        
        # Extract themes from programaciones.xml
        # The themes are siblings of the <grupo> tag within the same <asignatura>
        asig_pattern = rf'<asignatura nombre="{asig_name}">.*?<grupo id="{grupo_id}"[^>]*/>(.*?)</asignatura>'
        asig_match = re.search(asig_pattern, prog_content, re.DOTALL)
        
        print(f"Buscando {asig_name} ({grupo_id})... Match found: {bool(asig_match)}")
        
        temas = {}
        if asig_match:
            content = asig_match.group(1)
            # print(f"Contenido: {content[:100]}...")
            tema_matches = re.finditer(r'<tema n="(\d+)" titulo="([^"]+)" horas="(\d+)"\s*/>', content)
            for tm in tema_matches:
                n = int(tm.group(1))
                temas[n] = {
                    "id": n,
                    "nombre": fix_encoding(tm.group(2)),
                    "horasEstimadas": int(tm.group(3)),
                    "completado": False,
                    "fechaInicio": None,
                    "fechaFin": None,
                    "observaciones": ""
                }
        
        # Extract tracking from seguimiento-Chema.xml
        seg_pattern = rf'<asignatura grupo="{grupo_id}" nombre="{asig_name}">(.*?)</asignatura>'
        seg_match = re.search(seg_pattern, seg_content, re.DOTALL)
        
        if seg_match:
            seg_tema_matches = re.finditer(r'<tema n="(\d+)" fini="([^"]*)" ffin="([^"]*)" comentario="([^"]*)"\s*/>', seg_match.group(1))
            for stm in seg_tema_matches:
                n = int(stm.group(1))
                if n in temas:
                    temas[n]["fechaInicio"] = pad_date(stm.group(2))
                    temas[n]["fechaFin"] = pad_date(stm.group(3))
                    temas[n]["observaciones"] = fix_encoding(stm.group(4))
                    temas[n]["completado"] = bool(stm.group(3))

        results.append({
            "asignatura": asig_name,
            "grupo": grupo_id,
            "temas": list(temas.values())
        })

    with open('scripts/normalized_chema_data.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"Normalized data saved to scripts/normalized_chema_data.json")

if __name__ == "__main__":
    parse_chema_data()
