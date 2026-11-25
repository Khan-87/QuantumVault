import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CORS_HEADERS } from './auth-utils';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const USERS_TABLE = process.env.USERS_TABLE || 'QuantumVault-Users';

export const handler: APIGatewayProxyHandler = async (event) => {
  const email = event.queryStringParameters?.email;

  if (!email) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Email parameter is required' }),
    };
  }

  try {
    const result = await docClient.send(
      new GetCommand({ TableName: USERS_TABLE, Key: { email: email.toLowerCase() } })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ salt: result.Item.pbkdf2Salt }),
    };
  } catch (error: any) {
    console.error('Error fetching salt:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
