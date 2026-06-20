import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import * as crypto from 'crypto';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const FILES_TABLE = process.env.FILES_TABLE || 'QuantumVault-Files';
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
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  };

  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Missing Authorization header' }) };
  }

  const user = verifyJwt(authHeader.substring(7), JWT_SECRET);
  if (!user?.email) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid token' }) };
  }

  try {
    // Query files where ownerID = user.email via GSI
    const result = await docClient.send(
      new QueryCommand({
        TableName: FILES_TABLE,
        IndexName: 'ownerID-index',
        KeyConditionExpression: 'ownerID = :ownerID',
        ExpressionAttributeValues: {
          ':ownerID': user.email,
        },
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ files: result.Items || [] }),
    };
  } catch (error) {
    console.error('Error listing files:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
