import re
import json

file_path = r'C:\Users\Ax\.gemini\antigravity\brain\ec4bf9ec-44d4-4bf0-875b-50c558b9c2c0\.system_generated\steps\322\output.txt'

studies = {
    'SMR': 'IRCwWmikBP6CKKipMQUl',
    'ASIR': 'oDDucwALpyjP39H2BEmE',
    'DAW': '0JKS51nEBzvL05ZkEqdP',
    'DAM': 'aiSkVWbNBLK6PPhWKdEh'
}

results = {k: {} for k in studies.keys()}

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

current_doc = {}
current_field = None

for line in lines:
    line = line.strip()
    
    if line == '{':
        current_doc = {}
        continue
    
    name_match = re.search(r'"name": "projects/.*/ies_asignaturas/(.*)"', line)
    if name_match:
        current_doc['id'] = name_match.group(1)
        continue
    
    if '"iesEstudioId": {' in line: current_field = 'iesEstudioId'
    elif '"sigla": {' in line: current_field = 'sigla'
    elif '"nombre": {' in line: current_field = 'nombre'
    elif '"curso": {' in line: current_field = 'curso'
    
    if current_field:
        # Match "stringValue": "..." or "integerValue": "..."
        val_match = re.search(r'"(?:stringValue|integerValue)": "(.*)"', line)
        if val_match:
            current_doc[current_field] = val_match.group(1)
            current_field = None
            
    if line == '},' or line == '}':
        if 'iesEstudioId' in current_doc:
            eid = current_doc['iesEstudioId']
            for s_name, s_id in studies.items():
                if eid == s_id:
                    sigla = current_doc.get('sigla', '')
                    nombre = current_doc.get('nombre', '')
                    curso = current_doc.get('curso', '')
                    
                    # Search for EIE, FOL, FCT
                    # Also look for the "new" ones if they already exist (to avoid duplicates)
                    is_target = False
                    key = None
                    
                    if sigla in ['FOL', 'EIE', 'FCT', 'IPE I', 'IPE II', 'DIG', 'SASP']:
                        is_target = True
                        key = sigla
                    elif 'Formación y Orientación' in nombre:
                        is_target = True
                        key = 'FOL'
                    elif 'Empresa e Iniciativa' in nombre:
                        is_target = True
                        key = 'EIE'
                    elif 'FCT' in nombre or 'Formación en Centros' in nombre:
                        is_target = True
                        key = 'FCT'
                    
                    if is_target:
                        # Store multiple if found (e.g. both old and new)
                        if key not in results[s_name]:
                            results[s_name][key] = []
                        results[s_name][key].append(current_doc.copy())

print(json.dumps(results, indent=2))
