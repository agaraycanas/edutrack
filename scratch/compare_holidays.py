import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

def parse_xml(file_path):
    tree = ET.parse(file_path)
    root = tree.getroot()
    
    holidays = []
    for festivo in root.findall('festivo'):
        name = festivo.get('causa')
        date_str = festivo.text.strip()
        
        # Convert YY-M-D to YYYY-MM-DD
        parts = date_str.split('-')
        year = int(parts[0]) + 2000
        month = int(parts[1])
        day = int(parts[2])
        date_obj = datetime(year, month, day)
        
        holidays.append({'name': name, 'date': date_obj})
    
    # Sort by date
    holidays.sort(key=lambda x: x['date'])
    
    # Group consecutive days with same name
    grouped = []
    if not holidays:
        return grouped
        
    current_group = holidays[0]
    start_date = holidays[0]['date']
    end_date = holidays[0]['date']
    
    for i in range(1, len(holidays)):
        h = holidays[i]
        if h['name'] == current_group['name'] and h['date'] == end_date + timedelta(days=1):
            end_date = h['date']
        else:
            # Save previous group
            grouped.append({
                'nombre': current_group['name'],
                'startDate': start_date.strftime('%Y-%m-%d'),
                'endDate': end_date.strftime('%Y-%m-%d') if end_date != start_date else None
            })
            # Start new group
            current_group = h
            start_date = h['date']
            end_date = h['date']
            
    # Save last group
    grouped.append({
        'nombre': current_group['name'],
        'startDate': start_date.strftime('%Y-%m-%d'),
        'endDate': end_date.strftime('%Y-%m-%d') if end_date != start_date else None
    })
    
    return grouped

def parse_firestore(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    records = []
    current_record = {}
    for line in content.split('\n'):
        line = line.strip()
        if line.startswith('- __path__:'):
            if current_record:
                records.append(current_record)
            current_record = {}
        elif line.startswith('nombre:'):
            current_record['nombre'] = line.split(':', 1)[1].strip()
        elif line.startswith('startDate:'):
            current_record['startDate'] = line.split(':', 1)[1].strip().strip("'")
        elif line.startswith('endDate:'):
            val = line.split(':', 1)[1].strip().strip("'")
            current_record['endDate'] = val if val != 'null' else None
            
    if current_record:
        records.append(current_record)
        
    return records

xml_holidays = parse_xml(r'd:\curro\web\edutrack\legacy\programaciones\dat\festivos.xml')
fs_holidays = parse_firestore(r'C:\Users\Ax\.gemini\antigravity\brain\18ecf3c0-4e07-430f-9648-513c57353482\.system_generated\steps\378\output.txt')

print(f"Total XML grouped holidays: {len(xml_holidays)}")
print(f"Total Firestore holidays: {len(fs_holidays)}")

# Compare
missing = []
for xh in xml_holidays:
    found = False
    for fh in fs_holidays:
        # Check for overlap or exact match
        # Since Firestore might have shifted dates, we should be a bit flexible?
        # Let's try exact match first
        if xh['nombre'] == fh['nombre'] and xh['startDate'] == fh['startDate']:
            found = True
            break
        # Also check if it's within a range
        if fh['endDate'] and fh['startDate'] <= xh['startDate'] <= fh['endDate']:
            found = True
            break
            
    if not found:
        missing.append(xh)

print(f"\nMissing holidays: {len(missing)}")
for m in missing:
    print(f"Name: {m['nombre']}, Start: {m['startDate']}, End: {m['endDate']}")
