import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
    const { fileId } = JSON.parse(event.body);

    if (!fileId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'fileId is required' }),
      };
    }

    const result = await docClient.send(
      new GetCommand({ TableName: FILES_TABLE, Key: { fileId } })
    );

    const file = result.Item;
    if (!file) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'File not found' }),
      };
    }

    // Verify ownership
    if (file.ownerID !== user.email) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Access denied' }),
      };
    }

    // Delete S3 ciphertext and wrapped key
    if (file.s3CiphertextKey) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: file.s3CiphertextKey })
        );
      } catch (err) {
        console.warn('Could not delete S3 ciphertext:', err);
      }
    }

    if (file.s3WrappedKeyRef) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: file.s3WrappedKeyRef })
        );
      } catch (err) {
        console.warn('Could not delete S3 wrapped key:', err);
      }
    }

    // Delete record from DynamoDB
    await docClient.send(
      new DeleteCommand({ TableName: FILES_TABLE, Key: { fileId } })
    );

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, fileId }),
    };
  } catch (error: any) {
    console.error('Error deleting file:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
