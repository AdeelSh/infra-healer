import boto3
import time
import uuid

dynamodb = boto3.resource('dynamodb', region_name='ap-southeast-2')
table = dynamodb.Table('infra_healer_events')

def log_event(step: str, message: str, status: str = 'running'):
    table.put_item(Item={
        'id': str(uuid.uuid4()),
        'timestamp': int(time.time() * 1000),
        'step': step,
        'message': message,
        'status': status
    })

def clear_events():
    scan = table.scan()
    with table.batch_writer() as batch:
        for item in scan['Items']:
            batch.delete_item(Key={'id': item['id']})
