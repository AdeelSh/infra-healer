import boto3
import time

def run_diagnosis(log_group: str, minutes_back: int = 5) -> dict:
    client = boto3.client('logs', region_name='ap-southeast-2')
    end_time   = int(time.time() * 1000)
    start_time = end_time - (minutes_back * 60 * 1000)
    response = client.filter_log_events(
        logGroupName=log_group,
        startTime=start_time,
        endTime=end_time,
        filterPattern='FATAL ERROR Exception'
    )
    events   = [e['message'] for e in response.get('events', [])]
    log_text = '\n'.join(events[-20:])
    return {
        'message': f'Found {len(events)} error events',
        'logs': log_text,
        'log_group': log_group
    }
