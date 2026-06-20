import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const USERS_TABLE = process.env.USERS_TABLE || 'QuantumVault-Users';

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  };

  const email = event.queryStringParameters?.email;

  if (!email) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Email parameter is required' }) };
  }

  try {
    const result = await docClient.send(
      new GetCommand({ TableName: USERS_TABLE, Key: { email: email.toLowerCase() } })
    );

    if (!result.Item) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'User not found' }) };
    }

    // Return the PBKDF2 salt (renamed field)
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ salt: result.Item.pbkdf2Salt }),
    };
  } catch (error: any) {
    console.error('Error fetching salt:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
