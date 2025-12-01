# AWS App Runner Deployment Guide

## Prerequisites
1. AWS Account with App Runner access
2. GitHub repository connected to AWS
3. Environment variables configured

## Configuration Files
- `apprunner.yaml` - App Runner build and runtime configuration
- `Dockerfile` - Alternative containerized deployment option

## Environment Variables Required

Add these to your App Runner service configuration:

```
NODE_ENV=production
PORT=3000
MONGODB_URI=<your-mongodb-uri>
JWT_SECRET=<your-jwt-secret>
EMAIL_USER=<your-email>
EMAIL_PASS=<your-email-password>
RAZORPAY_KEY_ID=<your-razorpay-key>
RAZORPAY_KEY_SECRET=<your-razorpay-secret>
CASHFREE_APP_ID=<your-cashfree-app-id>
CASHFREE_SECRET_KEY=<your-cashfree-secret>
CASHFREE_ENVIRONMENT=PRODUCTION
GOOGLE_CLOUD_PROJECT_ID=<optional-gcs-project-id>
GOOGLE_CLOUD_BUCKET_NAME=<optional-gcs-bucket>
```

## Deployment Steps

### Option 1: Using App Runner Console

1. **Create App Runner Service**
   - Go to AWS App Runner Console
   - Click "Create service"
   - Choose "Source code repository"
   - Connect your GitHub account and select repository

2. **Configure Build**
   - App Runner will automatically detect `apprunner.yaml`
   - Or manually configure:
     - Runtime: Node.js 20
     - Build command: `npm install && npx playwright install chromium`
     - Start command: `npm start`
     - Port: 3000

3. **Add Environment Variables**
   - Add all required environment variables listed above
   - Mark sensitive values as secrets

4. **Configure Service Settings**
   - CPU: 1 vCPU (recommended minimum)
   - Memory: 2 GB (required for Playwright)
   - Auto scaling: Configure based on needs

5. **Deploy**
   - Click "Create & deploy"
   - Wait for deployment to complete

### Option 2: Using AWS CLI

```bash
# Create App Runner service
aws apprunner create-service \
  --service-name kerala-sec-voter-api \
  --source-configuration '{
    "CodeRepository": {
      "RepositoryUrl": "https://github.com/<your-repo>",
      "SourceCodeVersion": {
        "Type": "BRANCH",
        "Value": "main"
      },
      "CodeConfiguration": {
        "ConfigurationSource": "API",
        "CodeConfigurationValues": {
          "Runtime": "NODEJS_20",
          "BuildCommand": "npm install && npx playwright install chromium",
          "StartCommand": "npm start",
          "Port": "3000"
        }
      }
    }
  }' \
  --instance-configuration '{
    "Cpu": "1024",
    "Memory": "2048"
  }'
```

### Option 3: Using Docker Container

If you prefer using the Dockerfile:

1. Build and push to Amazon ECR:
```bash
# Authenticate to ECR
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com

# Build image
docker build -t kerala-sec-voter-api .

# Tag image
docker tag kerala-sec-voter-api:latest <account-id>.dkr.ecr.<region>.amazonaws.com/kerala-sec-voter-api:latest

# Push image
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/kerala-sec-voter-api:latest
```

2. Create App Runner service from ECR:
   - Choose "Container registry" as source
   - Select your ECR image
   - Configure port 3000
   - Add environment variables

## Post-Deployment

1. **Verify Deployment**
   - Access the App Runner URL
   - Test API endpoints
   - Check logs for any errors

2. **Configure Custom Domain (Optional)**
   - In App Runner console, go to "Custom domains"
   - Add your domain
   - Update DNS records as instructed

3. **Monitor Service**
   - Check CloudWatch logs
   - Monitor metrics (CPU, memory, requests)
   - Set up alarms if needed

## Troubleshooting

### Playwright/Chromium Issues
- Ensure sufficient memory (minimum 2GB)
- Check Playwright installation in build logs
- Verify chromium dependencies are installed

### Memory Issues
- Increase instance memory to 3-4GB if needed
- Monitor memory usage in CloudWatch

### Environment Variables
- Verify all required variables are set
- Check for typos in variable names
- Ensure MongoDB URI is accessible from App Runner

### Build Failures
- Check build logs in App Runner console
- Verify package.json dependencies
- Ensure Node.js version compatibility

## Cost Optimization

- Use auto-scaling to scale down during low traffic
- Consider pausing service during non-business hours if applicable
- Monitor costs in AWS Cost Explorer

## Security Best practices

1. Use AWS Secrets Manager for sensitive environment variables
2. Enable VPC connector if accessing private resources
3. Use IAM roles for AWS service access
4. Enable encryption at rest and in transit
5. Regular security updates for dependencies
