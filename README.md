# Infra Healer — Agentic Self-Healing Infrastructure

## Quick start (local)
```bash
# 1. Fill in your AWS credentials in backend/.env
# 2. Start everything
docker compose up --build
# Frontend → http://localhost:5173
# Backend  → http://localhost:3001
```

## AWS setup (run once)
```bash
# Create DynamoDB table
aws dynamodb create-table \
  --table-name infra_healer_events \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-2

# Push backend image to ECR (replace ACCOUNT_ID)
aws ecr create-repository --repository-name infra-healer-backend --region ap-southeast-2
cd backend
docker build -t infra-healer-backend .
docker tag infra-healer-backend:latest ACCOUNT_ID.dkr.ecr.ap-southeast-2.amazonaws.com/infra-healer-backend:latest
docker push ACCOUNT_ID.dkr.ecr.ap-southeast-2.amazonaws.com/infra-healer-backend:latest
```

## Lambda env vars
```
GEMINI_API_KEY   = from Google AI Studio
GITHUB_TOKEN     = ghp_...
GITHUB_REPO      = yourusername/infra-healer
GITHUB_BRANCH    = main
CW_LOG_GROUP     = /infra-healer/backend
PIPELINE_NAME    = infra-healer-pipeline
AWS_REGION       = ap-southeast-2
```

## Demo flow
1. Open dashboard at http://localhost:5173
2. Select a bug from the dropdown
3. Click "Inject bug" — watch metrics go red
4. CloudWatch alarm fires → Lambda invoked → Gemini heals
5. Watch the heal log stream in real time
6. Dashboard goes green — no human touched anything

## Additional Lambda env vars for infra healing
```
ECS_CLUSTER   = infra-healer-cluster
ECS_SERVICE   = infra-healer-backend
```

## Two failure modes — both auto-healed

### App bug (code failure)
Click "Inject app bug" → backend logs FATAL error → CloudWatch alarm fires →
Gemini reads logs → classifies as code bug → patches GitHub → CodePipeline redeploys

### Infra bug (ECS scale to zero)
Click "Kill infrastructure" → ECS desiredCount set to 0 → all tasks stop →
dashboard goes completely dark → CloudWatch alarm fires → Gemini calls
describe_ecs_service → sees desiredCount=0 → calls fix_ecs_service(desired_count=2) →
ECS tasks restart → dashboard goes green

No code is changed for infra healing — Gemini makes an AWS API call directly.
