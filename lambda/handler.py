import os
import json
import requests
from dynamo_logger import log_event, clear_events
from agents.diagnosis import run_diagnosis
from agents.patch import apply_patch
from agents.validation import run_validation
from agents.deploy import trigger_deploy
from agents.fix_ecs import describe_ecs_service, fix_ecs_service

SYSTEM_PROMPT = """
You are an autonomous infrastructure and application healing agent for a cloud system.

You handle TWO classes of failure:

CLASS 1 - APPLICATION BUG (code is broken):
  Symptoms: FATAL/ERROR/Exception in logs
  Fix steps: run_diagnosis then apply_patch then run_validation then trigger_deploy

CLASS 2 - INFRASTRUCTURE MISCONFIGURATION (AWS config is wrong):
  Symptoms: ECS running count is 0, no app logs
  Fix steps: describe_ecs_service then fix_ecs_service if desiredCount is 0

Rules:
- Always call run_diagnosis first
- The backend code is entirely in backend/server.js
- When logs contain "Offending code:" use that exact string as old_code in apply_patch
- When logs contain "Fix:" use that exact string as new_code in apply_patch
- If apply_patch fails, retry with a different old_code extraction
- Only escalate after 2 failed retries
- Never ask for clarification — act autonomously
"""

TOOL_DISPATCH = {
    'run_diagnosis':        lambda **kw: run_diagnosis(**kw),
    'describe_ecs_service': lambda **kw: describe_ecs_service(),
    'fix_ecs_service':      lambda **kw: fix_ecs_service(**kw),
    'apply_patch':          lambda **kw: apply_patch(**kw),
    'run_validation':       lambda **kw: run_validation(),
    'trigger_deploy':       lambda **kw: trigger_deploy(),
}

TERMINAL_TOOLS = {'trigger_deploy', 'fix_ecs_service', 'escalate'}

tools = [
    {
        "type": "function",
        "function": {
            "name": "run_diagnosis",
            "description": "Fetch recent CloudWatch logs to identify root cause. Always call first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "log_group": {"type": "string"},
                    "minutes_back": {"type": "integer"}
                },
                "required": ["log_group"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "describe_ecs_service",
            "description": "Read ECS service state. Use when logs are empty.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fix_ecs_service",
            "description": "Restore ECS service by setting desiredCount. Use when desiredCount is 0.",
            "parameters": {
                "type": "object",
                "properties": {
                    "desired_count": {"type": "integer"}
                },
                "required": ["desired_count"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "apply_patch",
            "description": "Edit backend/server.js in GitHub to fix a code bug.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string"},
                    "old_code": {"type": "string"},
                    "new_code": {"type": "string"},
                    "explanation": {"type": "string"}
                },
                "required": ["file_path", "old_code", "new_code", "explanation"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_validation",
            "description": "Run tests to verify the patch works.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_deploy",
            "description": "Redeploy the fixed service to ECS.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "escalate",
            "description": "Alert human operator. Only when all retries exhausted.",
            "parameters": {
                "type": "object",
                "properties": {"reason": {"type": "string"}},
                "required": ["reason"]
            }
        }
    }
]

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

def call_groq(messages, api_key, model):
    response = requests.post(
        GROQ_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        json={
            "model": model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "temperature": 0
        },
        timeout=30
    )
    if response.status_code >= 400:
        raise Exception(f"Groq API error {response.status_code}: {response.text}")
    return response.json()

def lambda_handler(event, context):
    sns_message = json.loads(event['Records'][0]['Sns']['Message'])
    alarm_name  = sns_message.get('AlarmName', 'unknown')
    log_group   = os.environ.get('CW_LOG_GROUP', '/infra-healer/backend')

    clear_events()
    log_event('orchestrator', f'Alarm triggered: {alarm_name}. Classifying failure...', 'running')

    try:
        return run_heal_cycle(alarm_name, log_group)
    except Exception as e:
        log_event('error', f'Heal cycle crashed: {str(e)}', 'error')
        log_event('complete', 'Heal cycle ended due to an error. Escalated to human operator.', 'error')
        return {'statusCode': 500, 'body': f'Heal cycle crashed: {str(e)}'}


def run_heal_cycle(alarm_name, log_group):
    groq_api_key = os.environ['GROQ_API_KEY']
    groq_model   = os.environ.get('GROQ_MODEL', 'llama-3.3-70b-versatile')

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": (
            f'CloudWatch alarm "{alarm_name}" fired on log group {log_group}. '
            f'Diagnose the failure, determine if it is an application bug or '
            f'infrastructure misconfiguration, and heal it autonomously.'
        )}
    ]

    for _ in range(12):
        result = call_groq(messages, groq_api_key, groq_model)
        choice = result['choices'][0]
        message = choice['message']

        if message.get('content'):
            log_event('reasoning', message['content'].strip(), 'running')

        messages.append(message)

        tool_calls = message.get('tool_calls')
        if not tool_calls:
            break

        for tool_call in tool_calls:
            fn_name = tool_call['function']['name']
            fn_args = json.loads(tool_call['function']['arguments'])

            log_event(fn_name, f'Calling {fn_name}...', 'running')

            if fn_name == 'escalate':
                log_event('escalate', fn_args.get('reason', 'Unknown'), 'error')
                log_event('complete', 'Heal cycle ended — escalated to human operator.', 'error')
                return {'statusCode': 200, 'body': 'Heal cycle finished — escalated'}

            tool_result = TOOL_DISPATCH[fn_name](**fn_args) if fn_name in TOOL_DISPATCH else {'message': f'Unknown tool: {fn_name}', 'success': False}
            log_event(fn_name, str(tool_result.get('message', tool_result)), 'running')

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call['id'],
                "content": json.dumps(tool_result)
            })

            if fn_name in TERMINAL_TOOLS:
                label = 'Infra restored — ECS tasks restarting. No human intervention required.' \
                    if fn_name == 'fix_ecs_service' \
                    else 'Heal complete — redeploying to ECS. No human intervention required.'
                log_event('complete', label, 'success')
                return {'statusCode': 200, 'body': 'Heal cycle finished'}

    return {'statusCode': 200, 'body': 'Heal cycle finished'}