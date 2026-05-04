import json

with open('C:\\Users\\Ax\\.gemini\\antigravity\\brain\\ec4bf9ec-44d4-4bf0-875b-50c558b9c2c0\\.system_generated\\steps\\467\\output.txt', 'r', encoding='utf-8') as f:
    data = json.load(f)

studies = {
    "0JKS51nEBzvL05ZkEqdP": "DAW",
    "aiSkVWbNBLK6PPhWKdEh": "DAM",
    "IRCwWmikBP6CKKipMQUl": "SMR",
    "oDDucwALpyjP39H2BEmE": "ASIR"
}

for doc in data['documents']:
    fields = doc.get('fields', {})
    study_id = fields.get('iesEstudioId', {}).get('stringValue')
    if study_id in studies:
        sigla = fields.get('sigla', {}).get('stringValue')
        nombre = fields.get('nombre', {}).get('stringValue')
        print(f"{studies[study_id]} - {sigla}: {nombre}")
