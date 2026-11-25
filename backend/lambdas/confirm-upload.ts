import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CORS_HEADERS, verifyJwt } from './auth-utils';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const FILES_TABLE = process.env.FILES_TABLE || 'QuantumVault-Files';
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
        body: JSON.stringify({ error: 'FileId is required' }),
      };
    }

    // Update status to 'uploaded'
    await docClient.send(
      new UpdateCommand({
        TableName: FILES_TABLE,
        Key: { fileId },
        UpdateExpression: 'set fileStatus = :status',
        ExpressionAttributeValues: {
          ':status': 'uploaded',
        },
      })
    );

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true }),
    };
  } catch (error: any) {
    console.error('Error confirming upload:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
