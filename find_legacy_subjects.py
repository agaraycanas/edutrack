import json

with open('C:\\Users\\Ax\\.gemini\\antigravity\\brain\\ec4bf9ec-44d4-4bf0-875b-50c558b9c2c0\\.system_generated\\steps\\467\\output.txt', 'r', encoding='utf-8') as f:
    data = json.load(f)

studies = {
    "0JKS51nEBzvL05ZkEqdP": "DAW",
    "aiSkVWbNBLK6PPhWKdEh": "DAM",
    "IRCwWmikBP6CKKipMQUl": "SMR",
    "oDDucwALpyjP39H2BEmE": "ASIR"
}

to_update = []
to_delete = []

for doc in data['documents']:
    fields = doc.get('fields', {})
    study_id = fields.get('iesEstudioId', {}).get('stringValue')
    sigla = fields.get('sigla', {}).get('stringValue')
    nombre = fields.get('nombre', {}).get('stringValue')
    name = doc.get('name')
    doc_id = name.split('/')[-1]

    if study_id in studies:
        # Check for legacy subjects
        if sigla in ['FOL', 'EIE', 'FCT']:
            print(f"Found {sigla} ({nombre}) in {studies[study_id]}: {doc_id}")
            if sigla == 'FOL':
                to_update.append({'id': doc_id, 'new_sigla': 'IPE I', 'new_nombre': 'Itinerario personal para la empleabilidad I', 'curso': 1})
            elif sigla == 'EIE':
                to_update.append({'id': doc_id, 'new_sigla': 'IPE II', 'new_nombre': 'Itinerario personal para la empleabilidad II', 'curso': 2})
            elif sigla == 'FCT':
                to_delete.append({'id': doc_id, 'sigla': sigla, 'study': studies[study_id]})
        
        # Also check for existing IPE 1 / IPE 2 that might have typos or inconsistent naming
        if sigla in ['IPE1', 'IPE2', 'IPE 1', 'IPE 2', 'IPE I', 'IPE II']:
             print(f"Found {sigla} ({nombre}) in {studies[study_id]}: {doc_id}")

print("\nTo Update:")
for item in to_update:
    print(item)

print("\nTo Delete:")
for item in to_delete:
    print(item)
