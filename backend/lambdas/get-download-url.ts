import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

    // Generate pre-signed GET URLs for ciphertext and wrapped key
    const ciphertextUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: file.s3CiphertextKey }),
      { expiresIn: 900 }
    );

    const wrappedKeyUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: file.s3WrappedKeyRef }),
      { expiresIn: 900 }
    );

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ciphertextUrl,
        wrappedKeyUrl,
        iv: file.iv,
        fileName: file.fileName,
      }),
    };
  } catch (error: any) {
    console.error('Error generating download URLs:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
