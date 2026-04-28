import json

with open(r'C:\Users\Ax\.gemini\antigravity\brain\18ecf3c0-4e07-430f-9648-513c57353482\.system_generated\steps\450\output.txt', 'r', encoding='utf-8') as f:
    data = json.load(f)

docs = []
for d in data['documents']:
    fields = d['fields']
    name = fields['nombre']['stringValue']
    start = fields['startDate']['stringValue']
    end = fields.get('endDate', {}).get('stringValue', 'N/A')
    if 'nullValue' in fields.get('endDate', {}):
        end = 'null'
    docs.append({'nombre': name, 'startDate': start, 'endDate': end})

docs.sort(key=lambda x: x['startDate'])

current_year = ""
for d in docs:
    year = d['startDate'][:4]
    if year != current_year:
        print(f"\n--- {year} ---")
        current_year = year
    print(f"{d['nombre']} | {d['startDate']} | {d['endDate']}")
