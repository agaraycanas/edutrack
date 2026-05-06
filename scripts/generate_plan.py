import json
import os

# Load the legacies data
with open(r'C:\Users\Ax\.gemini\antigravity\brain\1f598e3f-7565-4127-840d-6d42e1dd1f9e\.system_generated\steps\2463\output.txt', 'r', encoding='utf-8') as f:
    legacy_data = json.load(f)

# Structure to hold migration plan
migration_plan = []

for doc in legacy_data.get('documents', []):
    fields = doc.get('fields', {})
    imparticion_id = fields.get('imparticionId', {}).get('stringValue')
    temas_raw = fields.get('temas', {}).get('arrayValue', {}).get('values', [])
    
    if not imparticion_id or not temas_raw:
        continue
        
    temas = []
    for t in temas_raw:
        t_fields = t.get('mapValue', {}).get('fields', {})
        temas.append({
            'n': int(t_fields.get('id', {}).get('integerValue', 0)),
            'titulo': t_fields.get('nombre', {}).get('stringValue', ''),
            'horas': int(t_fields.get('horasEstimadas', {}).get('integerValue', 0)),
            'fechaInicio': t_fields.get('fechaInicio', {}).get('stringValue', ''),
            'fechaFin': t_fields.get('fechaFin', {}).get('stringValue', ''),
            'observaciones': t_fields.get('observaciones', {}).get('stringValue', ''),
            'completado': t_fields.get('completado', {}).get('booleanValue', False)
        })
    
    migration_plan.append({
        'imparticionId': imparticion_id,
        'temas': temas
    })

with open('migration_plan.json', 'w', encoding='utf-8') as f:
    json.dump(migration_plan, f, indent=2, ensure_ascii=False)

print(f"Plan generated for {len(migration_plan)} imparticiones.")
