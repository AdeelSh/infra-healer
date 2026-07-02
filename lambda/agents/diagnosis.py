import boto3
import time

def run_diagnosis(log_group: str, minutes_back: int = 10) -> dict:
    client = boto3.client('logs', region_name='ap-southeast-2')
    end_time   = int(time.time() * 1000)
    start_time = int(end_time - (int(minutes_back) * 60 * 1000))

    # Search all streams in the log group
    response = client.filter_log_events(
        logGroupName=log_group,
        startTime=start_time,
        endTime=end_time,
        filterPattern='FATAL'
    )

    events   = [e['message'] for e in response.get('events', [])]
    log_text = '\n'.join(events[-20:])

    return {
        'message': f'Found {len(events)} error events. Logs: {log_text[:500] if log_text else "none"}',
        'logs': log_text,
        'log_group': log_group,
        'events_found': len(events)
    }
