import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const FILES_TABLE = process.env.FILES_TABLE || 'QuantumVault-Files';
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const JWT_SECRET = process.env.JWT_SECRET || 'quantum-vault-secret-key-change-me';

function verifyJwt(token: string, secret: string): any {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64) return null;
    const signature = crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url');
    if (signature !== signatureB64) return null;
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch { return null; }
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };

  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Missing Authorization header' }) };
  }

  const user = verifyJwt(authHeader.substring(7), JWT_SECRET);
  if (!user?.email) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid token' }) };
  }

  if (!event.body) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Request body is required' }) };
  }

  try {
    const { fileId } = JSON.parse(event.body);

    if (!fileId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'fileId is required' }) };
    }

    // Fetch file metadata from DynamoDB
    const result = await docClient.send(
      new GetCommand({ TableName: FILES_TABLE, Key: { fileId } })
    );

    const file = result.Item;
    if (!file) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'File not found' }) };
    }

    // Verify ownership
    if (file.ownerID !== user.email) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Access denied' }) };
    }

    // Delete encrypted ciphertext from S3
    if (file.s3CiphertextKey) {
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: file.s3CiphertextKey })
      );
    }

    // Delete wrapped key from S3
    if (file.s3WrappedKeyRef) {
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: file.s3WrappedKeyRef })
      );
    }

    // Delete file record from DynamoDB
    await docClient.send(
      new DeleteCommand({ TableName: FILES_TABLE, Key: { fileId } })
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'File deleted successfully' }),
    };
  } catch (error) {
    console.error('Error deleting file:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
