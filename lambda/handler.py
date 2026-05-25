import os
import json
import google.generativeai as genai
from dynamo_logger import log_event, clear_events
from agents.diagnosis import run_diagnosis
from agents.patch import apply_patch
from agents.validation import run_validation
from agents.deploy import trigger_deploy
from agents.fix_ecs import describe_ecs_service, fix_ecs_service

SYSTEM_PROMPT = """
You are an autonomous infrastructure and application healing agent for a cloud system.

You handle TWO classes of failure — reason carefully about which one you are dealing with:

CLASS 1 — APPLICATION BUG (code is broken):
  Symptoms: FATAL/ERROR/Exception in logs, non-zero error rate, app crashes
  Fix steps: run_diagnosis → apply_patch → run_validation → trigger_deploy

CLASS 2 — INFRASTRUCTURE MISCONFIGURATION (AWS config is wrong):
  Symptoms: ECS running count is 0, service unreachable, no app logs at all
  Fix steps: describe_ecs_service → (if desiredCount=0) fix_ecs_service

Rules:
- Start by calling run_diagnosis to read the logs and classify the failure
- If logs show an exception/error → follow CLASS 1 steps
- If logs are empty or show ECS task stopped → call describe_ecs_service first
- If desiredCount is 0 → call fix_ecs_service(desired_count=2) immediately
- Always explain your reasoning in one sentence before each tool call
- Only call escalate if you cannot fix it after 2 retries
- Never ask for clarification — act autonomously and decisively
"""

tools = [
    genai.protos.Tool(function_declarations=[

        genai.protos.FunctionDeclaration(
            name='run_diagnosis',
            description='Fetch recent CloudWatch logs to identify the root cause — always call this first',
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    'log_group':    genai.protos.Schema(type=genai.protos.Type.STRING),
                    'minutes_back': genai.protos.Schema(type=genai.protos.Type.INTEGER)
                },
                required=['log_group']
            )
        ),

        genai.protos.FunctionDeclaration(
            name='describe_ecs_service',
            description='Read the current ECS service state — desiredCount, runningCount, status. Use when logs are empty or ECS tasks are stopped.',
            parameters=genai.protos.Schema(type=genai.protos.Type.OBJECT, properties={})
        ),

        genai.protos.FunctionDeclaration(
            name='fix_ecs_service',
            description='Restore the ECS service by setting desiredCount back to the correct value. Use when desiredCount is 0.',
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    'desired_count': genai.protos.Schema(type=genai.protos.Type.INTEGER, description='Number of tasks to run, typically 2')
                },
                required=['desired_count']
            )
        ),

        genai.protos.FunctionDeclaration(
            name='apply_patch',
            description='Edit a source file in the GitHub repo to fix an application code bug',
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    'file_path':   genai.protos.Schema(type=genai.protos.Type.STRING),
                    'old_code':    genai.protos.Schema(type=genai.protos.Type.STRING),
                    'new_code':    genai.protos.Schema(type=genai.protos.Type.STRING),
                    'explanation': genai.protos.Schema(type=genai.protos.Type.STRING)
                },
                required=['file_path', 'old_code', 'new_code', 'explanation']
            )
        ),

        genai.protos.FunctionDeclaration(
            name='run_validation',
            description='Run the test suite to verify an application patch does not break anything',
            parameters=genai.protos.Schema(type=genai.protos.Type.OBJECT, properties={})
        ),

        genai.protos.FunctionDeclaration(
            name='trigger_deploy',
            description='Trigger AWS CodePipeline to rebuild and redeploy the fixed application to ECS',
            parameters=genai.protos.Schema(type=genai.protos.Type.OBJECT, properties={})
        ),

        genai.protos.FunctionDeclaration(
            name='escalate',
            description='Alert the human operator — only when all retries are exhausted',
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={ 'reason': genai.protos.Schema(type=genai.protos.Type.STRING) },
                required=['reason']
            )
        )

    ])
]

TOOL_DISPATCH = {
    'run_diagnosis':      lambda **kw: run_diagnosis(**kw),
    'describe_ecs_service': lambda **kw: describe_ecs_service(),
    'fix_ecs_service':    lambda **kw: fix_ecs_service(**kw),
    'apply_patch':        lambda **kw: apply_patch(**kw),
    'run_validation':     lambda **kw: run_validation(),
    'trigger_deploy':     lambda **kw: trigger_deploy(),
}

TERMINAL_TOOLS = {'trigger_deploy', 'fix_ecs_service', 'escalate'}

def lambda_handler(event, context):
    sns_message = json.loads(event['Records'][0]['Sns']['Message'])
    alarm_name  = sns_message.get('AlarmName', 'unknown')
    log_group   = os.environ.get('CW_LOG_GROUP', '/infra-healer/backend')

    clear_events()
    log_event('orchestrator', f'Alarm triggered: {alarm_name}. Classifying failure...', 'running')

    genai.configure(api_key=os.environ['GEMINI_API_KEY'])
    model = genai.GenerativeModel(
        model_name='gemini-2.0-flash',
        tools=tools,
        system_instruction=SYSTEM_PROMPT
    )
    chat = model.start_chat()

    response = chat.send_message(
        f'CloudWatch alarm "{alarm_name}" fired on log group {log_group}. '
        f'Start by diagnosing the failure, then determine if this is an application bug '
        f'or an infrastructure misconfiguration, and heal it autonomously.'
    )

    for _ in range(12):
        parts = response.candidates[0].content.parts
        if not parts:
            break

        part = parts[0]

        # Gemini reasoning text — log it
        if hasattr(part, 'text') and part.text:
            log_event('reasoning', part.text.strip(), 'running')
            if len(parts) > 1 and hasattr(parts[1], 'function_call'):
                part = parts[1]
            else:
                break

        if hasattr(part, 'function_call'):
            fn_name = part.function_call.name
            fn_args = dict(part.function_call.args)

            log_event(fn_name, f'Calling {fn_name}...', 'running')

            if fn_name == 'escalate':
                log_event('escalate', fn_args.get('reason', 'Unknown'), 'error')
                log_event('complete', 'Heal cycle ended — escalated to human operator.', 'error')
                break

            result = TOOL_DISPATCH[fn_name](**fn_args) if fn_name in TOOL_DISPATCH else {'error': f'Unknown tool: {fn_name}', 'message': f'Unknown tool: {fn_name}'}
            log_event(fn_name, str(result.get('message', result)), 'running')

            response = chat.send_message(
                genai.protos.Content(parts=[
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=fn_name,
                            response={'result': json.dumps(result)}
                        )
                    )
                ])
            )

            if fn_name in TERMINAL_TOOLS:
                label = 'Infra restored — ECS tasks restarting. No human intervention required.' \
                    if fn_name == 'fix_ecs_service' \
                    else 'App heal complete — new build deploying to ECS. No human intervention required.'
                log_event('complete', label, 'success')
                break

    return {'statusCode': 200, 'body': 'Heal cycle finished'}
