import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
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
      headers: CORS_HEADERS,
      body: JSON.stringify({ files: result.Items || [] }),
    };
  } catch (error: any) {
    console.error('Error listing files:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
