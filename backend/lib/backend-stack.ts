import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── 1. S3 Bucket for Encrypted Storage ─────────────────────────────────
    const storageBucket = new s3.Bucket(this, 'QuantumVaultStorage', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
        },
      ],
    });

    // ─── 2. DynamoDB Tables ─────────────────────────────────────────────────
    const usersTable = new dynamodb.Table(this, 'QuantumVaultUsersV2', {
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // New Files table: fileId as PK, with GSI on ownerID for listing user's files
    const filesTable = new dynamodb.Table(this, 'QuantumVaultFilesV2', {
      partitionKey: { name: 'fileId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // GSI to query files by ownerID (user's email)
    filesTable.addGlobalSecondaryIndex({
      indexName: 'ownerID-index',
      partitionKey: { name: 'ownerID', type: dynamodb.AttributeType.STRING },
    });

    // ─── 3. Shared Environment Variables ────────────────────────────────────
    const jwtSecret = 'quantum-vault-secret-key-change-me'; // Use SecretsManager in production
    const environment = {
      USERS_TABLE: usersTable.tableName,
      FILES_TABLE: filesTable.tableName,
      BUCKET_NAME: storageBucket.bucketName,
      JWT_SECRET: jwtSecret,
    };

    const bundling = {
      minify: true,
      sourceMap: true,
      externalModules: ['@aws-sdk/*'],
    };

    // ─── 4. Lambda Functions ────────────────────────────────────────────────

    // Auth Lambdas
    const getSaltLambda = new NodejsFunction(this, 'GetSaltHandler', {
      entry: path.join(__dirname, '../lambdas/get-salt.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment,
      bundling,
    });

    const registerLambda = new NodejsFunction(this, 'RegisterHandler', {
      entry: path.join(__dirname, '../lambdas/register.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment,
      bundling,
    });

    const loginLambda = new NodejsFunction(this, 'LoginHandler', {
      entry: path.join(__dirname, '../lambdas/login.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment,
      bundling,
    });

    // File Lambdas
    const getUploadUrlLambda = new NodejsFunction(this, 'GetUploadUrlHandler', {
      entry: path.join(__dirname, '../lambdas/get-upload-url.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment,
      bundling,
    });

    const listFilesLambda = new NodejsFunction(this, 'ListFilesHandler', {
      entry: path.join(__dirname, '../lambdas/list-files.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment,
      bundling,
    });

    const confirmUploadLambda = new NodejsFunction(this, 'ConfirmUploadHandler', {
      entry: path.join(__dirname, '../lambdas/confirm-upload.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment,
      bundling,
    });

    const getDownloadUrlLambda = new NodejsFunction(this, 'GetDownloadUrlHandler', {
      entry: path.join(__dirname, '../lambdas/get-download-url.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment,
      bundling,
    });

    const deleteFileLambda = new NodejsFunction(this, 'DeleteFileHandler', {
      entry: path.join(__dirname, '../lambdas/delete-file.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment,
      bundling,
    });

    // ─── 5. Grant Permissions ───────────────────────────────────────────────
    usersTable.grantReadData(getSaltLambda);
    usersTable.grantReadWriteData(registerLambda);
    usersTable.grantReadData(loginLambda);

    filesTable.grantReadWriteData(getUploadUrlLambda);
    filesTable.grantReadData(listFilesLambda);
    filesTable.grantReadWriteData(confirmUploadLambda);
    filesTable.grantReadData(getDownloadUrlLambda);

    storageBucket.grantWrite(getUploadUrlLambda);
    storageBucket.grantRead(getDownloadUrlLambda);

    filesTable.grantReadWriteData(deleteFileLambda);
    storageBucket.grantReadWrite(deleteFileLambda);

    // ─── 6. API Gateway ────────────────────────────────────────────────────
    const api = new apigateway.RestApi(this, 'QuantumVaultApi', {
      restApiName: 'QuantumVault Security API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
    });

    // /auth routes
    const auth = api.root.addResource('auth');
    auth.addResource('salt').addMethod('GET', new apigateway.LambdaIntegration(getSaltLambda));
    auth.addResource('register').addMethod('POST', new apigateway.LambdaIntegration(registerLambda));
    auth.addResource('login').addMethod('POST', new apigateway.LambdaIntegration(loginLambda));

    // /files routes
    const files = api.root.addResource('files');
    files.addMethod('GET', new apigateway.LambdaIntegration(listFilesLambda));
    files.addResource('upload-url').addMethod('POST', new apigateway.LambdaIntegration(getUploadUrlLambda));
    files.addResource('confirm').addMethod('POST', new apigateway.LambdaIntegration(confirmUploadLambda));
    files.addResource('download-url').addMethod('POST', new apigateway.LambdaIntegration(getDownloadUrlLambda));
    files.addResource('delete').addMethod('POST', new apigateway.LambdaIntegration(deleteFileLambda));

    // ─── Stack Outputs ──────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'The URL of the API Gateway',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: storageBucket.bucketName,
      description: 'The name of the S3 bucket',
    });
  }
}
