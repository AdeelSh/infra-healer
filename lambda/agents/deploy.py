import boto3
import os

def trigger_deploy() -> dict:
    ecs = boto3.client('ecs', region_name='ap-southeast-2')
    cluster = os.environ.get('ECS_CLUSTER', 'infra-healer-cluster')
    service  = os.environ.get('ECS_SERVICE',  'infra-healer-backend')

    response = ecs.update_service(
        cluster=cluster,
        service=service,
        forceNewDeployment=True
    )

    return {
        'message': f'ECS forced new deployment triggered for {service}. New tasks starting...',
        'success': True,
        'serviceStatus': response['service']['status']
    }
