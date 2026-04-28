import json
import subprocess

def get_docs_to_fix():
    # Use the query tool via mcp-invoke if possible, or just list all and filter here.
    # I already saw there are many. Let's just list all to be sure we catch them all.
    cmd = [
        "mcp-invoke", "firebase-mcp-server", "firestore_list_documents",
        "--parent", "projects/edutrack-803e0/databases/(default)/documents",
        "--collectionId", "festivos"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        if "The output was large and was saved to:" in result.stdout:
            path = result.stdout.split("file:///")[1].strip()
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f).get('documents', [])
        return json.loads(result.stdout).get('documents', [])
    except:
        return []

def fix_docs():
    docs = get_docs_to_fix()
    to_fix = []
    for doc in docs:
        fields = doc.get('fields', {})
        end_date = fields.get('endDate', {})
        if end_date.get('stringValue') == 'null':
            to_fix.append(doc['name'])
    
    print(f"Found {len(to_fix)} documents to fix.")
    
    for doc_name in to_fix:
        # We want to remove the endDate field or set it to actual null.
        # Removing it is safer for the frontend check.
        # But wait, firestore_update_document needs the full document or a mask.
        # I'll just set it to nullValue.
        
        # We need the relative name for the tool.
        # projects/edutrack-803e0/databases/(default)/documents/festivos/ID
        doc_id = doc_name.split('/')[-1]
        
        # Get the original doc to preserve other fields
        # (Actually I can just construct it)
        pass

if __name__ == "__main__":
    fix_docs()
