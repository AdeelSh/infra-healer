import os
import base64
import requests

GITHUB_TOKEN  = os.environ.get('GITHUB_TOKEN', '')
GITHUB_REPO   = os.environ.get('GITHUB_REPO', '')
GITHUB_BRANCH = os.environ.get('GITHUB_BRANCH', 'main')

def apply_patch(file_path: str, old_code: str, new_code: str, explanation: str) -> dict:
    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json'
    }
    url = f'https://api.github.com/repos/{GITHUB_REPO}/contents/{file_path}'

    r = requests.get(url, headers=headers, params={'ref': GITHUB_BRANCH})
    r.raise_for_status()
    file_data = r.json()
    current_content = base64.b64decode(file_data['content']).decode('utf-8')
    sha = file_data['sha']

    if old_code not in current_content:
        return { 'message': f'Target code not found in {file_path}', 'success': False }

    new_content = current_content.replace(old_code, new_code, 1)
    encoded = base64.b64encode(new_content.encode('utf-8')).decode('utf-8')

    payload = {
        'message': f'fix: {explanation} [auto-healed by Gemini]',
        'content': encoded,
        'sha': sha,
        'branch': GITHUB_BRANCH
    }
    r = requests.put(url, headers=headers, json=payload)
    r.raise_for_status()

    return {
        'message': f'Patch applied to {file_path}: {explanation}',
        'success': True,
        'commit': r.json()['commit']['sha'][:7]
    }
