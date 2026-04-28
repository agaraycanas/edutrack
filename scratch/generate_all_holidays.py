import xml.etree.ElementTree as ET
import json
from datetime import datetime, timedelta
import unicodedata

def normalize_string(s):
    if not s: return ""
    s = unicodedata.normalize('NFC', s)
    if s == '-': return 'Festivo'
    return s.strip()

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
        
    current_group_name = holidays[0]['name']
    start_date = holidays[0]['date']
    end_date = holidays[0]['date']
    
    for i in range(1, len(holidays)):
        h = holidays[i]
        # Check if it's the same holiday name and is either the next day or within a 3-day weekend gap
        is_next_day = h['date'] == end_date + timedelta(days=1)
        is_weekend_gap = False
        if not is_next_day:
            gap = (h['date'] - end_date).days
            if gap <= 3: 
                is_weekend_gap = True
        
        if h['name'] == current_group_name and (is_next_day or is_weekend_gap):
            end_date = h['date']
        else:
            # Finish current group
            grouped.append({
                'nombre': normalize_string(current_group_name),
                'startDate': start_date.strftime('%Y-%m-%d'),
                'endDate': end_date.strftime('%Y-%m-%d') if end_date != start_date else None,
                'iesId': 'ies_rey_fernando'
            })
            # Start new group
            current_group_name = h['name']
            start_date = h['date']
            end_date = h['date']
            
    # Add last group
    grouped.append({
        'nombre': normalize_string(current_group_name),
        'startDate': start_date.strftime('%Y-%m-%d'),
        'endDate': end_date.strftime('%Y-%m-%d') if end_date != start_date else None,
        'iesId': 'ies_rey_fernando'
    })
    
    return grouped

xml_file = r'd:\curro\web\edutrack\legacy\programaciones\dat\festivos.xml'
all_holidays = parse_xml(xml_file)

output_file = r'd:\curro\web\edutrack\scratch\all_holidays_to_import.json'
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(all_holidays, f, indent=2, ensure_ascii=False)

print(f"Generated {len(all_holidays)} grouped holidays for import.")
print(f"Saved to {output_file}")
