import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import { CORS_HEADERS, verifyJwt } from './auth-utils';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const FILES_TABLE = process.env.FILES_TABLE || 'QuantumVault-Files';
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const JWT_SECRET = process.env.JWT_SECRET || 'quantum-vault-secret-key-change-me';

export const handler: APIGatewayProxyHandler = async (event) => {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing Authorization header' }),
    };
  }

  const user = verifyJwt(authHeader.substring(7), JWT_SECRET);
  if (!user?.email) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid token' }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  try {
    const { fileName, fileSize, iv } = JSON.parse(event.body);

    if (!fileName) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'fileName is required' }),
      };
    }

    const fileId = crypto.randomUUID();
    const s3CiphertextKey = `vaults/${user.email}/${fileId}/ciphertext.enc`;
    const s3WrappedKeyRef = `vaults/${user.email}/${fileId}/wrapped-key.bin`;

    // Generate pre-signed PUT URLs for encrypted payload & wrapped key
    const ciphertextUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3CiphertextKey,
        ContentType: 'application/octet-stream',
      }),
      { expiresIn: 900 }
    );

    const wrappedKeyUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3WrappedKeyRef,
        ContentType: 'application/octet-stream',
      }),
      { expiresIn: 900 }
    );

    // Save initial file metadata in DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: FILES_TABLE,
        Item: {
          fileId,
          ownerID: user.email,
          fileName,
          fileSize: fileSize || 0,
          s3CiphertextKey,
          s3WrappedKeyRef,
          iv: iv || '',
          fileStatus: 'pending',
          uploadTimestamp: new Date().toISOString(),
        },
      })
    );

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        fileId,
        ciphertextUrl,
        wrappedKeyUrl,
      }),
    };
  } catch (error: any) {
    console.error('Error generating upload URLs:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
