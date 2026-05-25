import boto3
import os

def trigger_deploy() -> dict:
    client = boto3.client('codepipeline', region_name='ap-southeast-2')
    pipeline_name = os.environ.get('PIPELINE_NAME', 'infra-healer-pipeline')
    response = client.start_pipeline_execution(name=pipeline_name)
    execution_id = response['pipelineExecutionId']
    return {
        'message': f'CodePipeline triggered. Execution: {execution_id[:8]}. ECS redeploying...',
        'success': True,
        'execution_id': execution_id
    }
