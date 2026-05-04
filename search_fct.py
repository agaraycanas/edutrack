import json

with open('C:\\Users\\Ax\\.gemini\\antigravity\\brain\\ec4bf9ec-44d4-4bf0-875b-50c558b9c2c0\\.system_generated\\steps\\467\\output.txt', 'r', encoding='utf-8') as f:
    data = json.load(f)

search_terms = ['FCT', 'CENTROS DE TRABAJO', 'PRACTICAS', 'PROYECTO']

found = []
for doc in data['documents']:
    fields = doc.get('fields', {})
    name = doc.get('name')
    for field_name, field_val in fields.items():
        val = field_val.get('stringValue', '')
        for term in search_terms:
            if term in val.upper():
                found.append((name, field_name, val))

for f in found:
    print(f)
