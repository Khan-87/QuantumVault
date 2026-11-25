import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { BackendStack } from '../lib/backend-stack';

describe('QuantumVault CDK Backend Stack', () => {
  test('Synthesizes expected cloud infrastructure', () => {
    const app = new cdk.App();
    const stack = new BackendStack(app, 'TestBackendStack');
    const template = Template.fromStack(stack);

    // 1 S3 Bucket for client-side encrypted vault items
    template.resourceCountIs('AWS::S3::Bucket', 1);

    // 2 DynamoDB Tables (Users table and Files table with ownerID-index GSI)
    template.resourceCountIs('AWS::DynamoDB::Table', 2);

    // 1 API Gateway REST API
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);

    // 8 Lambda Functions for Zero-Knowledge Auth & File Operations
    template.resourceCountIs('AWS::Lambda::Function', 8);
  });
});
