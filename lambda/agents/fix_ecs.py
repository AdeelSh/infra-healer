import boto3
import os

ecs = boto3.client('ecs', region_name=os.environ.get('AWS_REGION', 'ap-southeast-2'))

CLUSTER_NAME = os.environ.get('ECS_CLUSTER', 'infra-healer-cluster')
SERVICE_NAME = os.environ.get('ECS_SERVICE', 'infra-healer-backend')

def describe_ecs_service() -> dict:
    """Read the current state of the ECS service."""
    response = ecs.describe_services(
        cluster=CLUSTER_NAME,
        services=[SERVICE_NAME]
    )
    service = response['services'][0]
    return {
        'message': f"ECS service '{SERVICE_NAME}': desiredCount={service['desiredCount']}, runningCount={service['runningCount']}, status={service['status']}",
        'desiredCount': service['desiredCount'],
        'runningCount':  service['runningCount'],
        'status':        service['status'],
        'success': True
    }

def fix_ecs_service(desired_count: int = 2) -> dict:
    """Set ECS service desired count to restore running tasks."""
    ecs.update_service(
        cluster=CLUSTER_NAME,
        service=SERVICE_NAME,
        desiredCount=desired_count
    )
    return {
        'message': f"ECS service updated: desiredCount set to {desired_count}. Tasks starting...",
        'desiredCount': desired_count,
        'success': True
    }

def scale_to_zero() -> dict:
    """Simulate an infra misconfiguration — scale service to zero."""
    ecs.update_service(
        cluster=CLUSTER_NAME,
        service=SERVICE_NAME,
        desiredCount=0
    )
    return {
        'message': f"ECS service '{SERVICE_NAME}' scaled to 0 — all tasks stopped.",
        'success': True
    }
