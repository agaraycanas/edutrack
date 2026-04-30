
import xml.etree.ElementTree as ET
import json
import io

def run():
    with open("legacy/programaciones/dat/programaciones.xml", "rb") as f:
        content = f.read().decode("latin-1")
        content = content.replace('encoding="UTF-8"', 'encoding="latin-1"')
        root = ET.fromstring(content)
        
    names = set()
    for curso in root.findall("curso"):
        for asig in curso.findall("asignatura"):
            for grupo in asig.findall("grupo"):
                profe = grupo.get("profe")
                if profe:
                    names.add(profe)
    
    print("Found teachers:", sorted(list(names)))
    
    if "Guillermo" in names:
        print("Guillermo is in names!")
    else:
        print("Guillermo NOT found in names.")

run()
