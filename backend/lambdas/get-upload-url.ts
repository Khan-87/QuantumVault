import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
    const { fileName, fileSize, iv } = JSON.parse(event.body);

    if (!fileName) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'fileName is required' }) };
    }

    const fileId = crypto.randomUUID();
    const s3CiphertextKey = `vaults/${user.email}/${fileId}/ciphertext.enc`;
    const s3WrappedKeyRef = `vaults/${user.email}/${fileId}/wrapped-key.bin`;

    // Generate two pre-signed PUT URLs
    const ciphertextUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3CiphertextKey, ContentType: 'application/octet-stream' }),
      { expiresIn: 900 }
    );

    const wrappedKeyUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3WrappedKeyRef, ContentType: 'application/octet-stream' }),
      { expiresIn: 900 }
    );

    // Save file metadata in DynamoDB
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
      headers: corsHeaders,
      body: JSON.stringify({ ciphertextUrl, wrappedKeyUrl, fileId }),
    };
  } catch (error) {
    console.error('Error generating pre-signed URLs:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
