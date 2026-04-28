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
    
    holidays.sort(key=lambda x: x['date'])
    
    grouped = []
    if not holidays:
        return grouped
        
    current_group = holidays[0]
    start_date = holidays[0]['date']
    end_date = holidays[0]['date']
    
    for i in range(1, len(holidays)):
        h = holidays[i]
        # Allow grouping even if weekends are between? 
        # Actually, let's keep it strict for now but allow gap if it's weekend
        is_next_day = h['date'] == end_date + timedelta(days=1)
        is_weekend_gap = False
        if not is_next_day:
            gap = (h['date'] - end_date).days
            if gap <= 3: # allow gap of up to 3 days if it's the same name (covers weekend)
                is_weekend_gap = True
        
        if h['name'] == current_group['name'] and (is_next_day or is_weekend_gap):
            end_date = h['date']
        else:
            grouped.append({
                'nombre': current_group['name'],
                'startDate': start_date.strftime('%Y-%m-%d'),
                'endDate': end_date.strftime('%Y-%m-%d') if end_date != start_date else None
            })
            current_group = h
            start_date = h['date']
            end_date = h['date']
            
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

def dates_match(xml_start, fs_start, xml_end, fs_end):
    # Tolerate 1-day shift (FS = XML - 1 day)
    xml_start_dt = datetime.strptime(xml_start, '%Y-%m-%d')
    fs_start_dt = datetime.strptime(fs_start, '%Y-%m-%d')
    
    start_matches = (xml_start_dt == fs_start_dt) or (xml_start_dt == fs_start_dt + timedelta(days=1))
    
    if not xml_end and not fs_end:
        return start_matches
    
    if xml_end and fs_end:
        xml_end_dt = datetime.strptime(xml_end, '%Y-%m-%d')
        fs_end_dt = datetime.strptime(fs_end, '%Y-%m-%d')
        end_matches = (xml_end_dt == fs_end_dt) or (xml_end_dt == fs_end_dt + timedelta(days=1))
        return start_matches and end_matches
        
    return False

missing = []
for xh in xml_holidays:
    found = False
    for fh in fs_holidays:
        # Normalize names (e.g. "-" in XML vs "Festivo" in FS)
        xh_name = xh['nombre']
        if xh_name == '-': xh_name = 'Festivo'
        
        fh_name = fh['nombre']
        
        if xh_name == fh_name and dates_match(xh['startDate'], fh['startDate'], xh['endDate'], fh['endDate']):
            found = True
            break
            
    if not found:
        missing.append(xh)

print(f"\nMissing holidays (with 1-day tolerance): {len(missing)}")
for m in missing:
    print(f"Name: {m['nombre']}, Start: {m['startDate']}, End: {m['endDate']}")
