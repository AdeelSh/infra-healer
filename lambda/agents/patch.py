import os
import base64
import requests

GITHUB_TOKEN  = os.environ.get('GITHUB_TOKEN', '')
GITHUB_REPO   = os.environ.get('GITHUB_REPO', '')
GITHUB_BRANCH = os.environ.get('GITHUB_BRANCH', 'main')

KNOWN_FIXES = {
    "MetricDataResults[0].Values.map": (
        "const datapoints = response.MetricDataResults[0].Values.map(v => v)",
        "const datapoints = response.MetricDataResults?.[0]?.Values ?? []"
    ),
    "process.env.DB_URL": (
        "const client = new DynamoDB({ endpoint: process.env.DB_URL })",
        "const client = new DynamoDB({ endpoint: process.env.DB_URL || 'http://localhost:8000' })"
    ),
    "totalRequests": (
        "const rate = (errorCount / totalRequests) * 100",
        "const rate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0"
    )
}

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

    new_content = None

    if old_code.strip() in current_content:
        new_content = current_content.replace(old_code.strip(), new_code.strip(), 1)

    if new_content is None:
        lines = current_content.split('\n')
        for i, line in enumerate(lines):
            if old_code.strip() == line.strip():
                indent = line[:len(line) - len(line.lstrip())]
                lines[i] = indent + new_code.strip()
                new_content = '\n'.join(lines)
                break

    if new_content is None:
        for keyword, (known_old, known_new) in KNOWN_FIXES.items():
            if keyword in current_content and keyword in (old_code + new_code):
                new_content = current_content.replace(known_old, known_new, 1)
                explanation = f'{explanation} (applied known fix)'
                break

    if new_content is None:
        return {
            'message': f'Target code not found in {file_path} after 3 strategies',
            'success': False
        }

    encoded = base64.b64encode(new_content.encode('utf-8')).decode('utf-8')
    payload = {
        'message': f'fix: {explanation} [auto-healed by Gemini]',
        'content': encoded,
        'sha': sha,
        'branch': GITHUB_BRANCH
    }
    r = requests.put(url, headers=headers, json=payload)
    r.raise_for_status()

    commit_sha = r.json()['commit']['sha'][:7]
    commit_url = f"https://github.com/{GITHUB_REPO}/commit/{r.json()['commit']['sha']}"

    return {
    'message': f'Patch applied to {file_path}: {explanation} — commit {commit_sha} ({commit_url})',
    'success': True,
    'commit': commit_sha,
    'commit_url': commit_url
}
