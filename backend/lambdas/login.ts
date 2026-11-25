import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcryptjs';
import { CORS_HEADERS, signJwt } from './auth-utils';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const USERS_TABLE = process.env.USERS_TABLE || 'QuantumVault-Users';
const JWT_SECRET = process.env.JWT_SECRET || 'quantum-vault-secret-key-change-me';

export const handler: APIGatewayProxyHandler = async (event) => {
  if (!event.body) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  try {
    const { email, authHash } = JSON.parse(event.body);

    if (!email || !authHash) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Email and authHash are required' }),
      };
    }

    const normalizedEmail = email.toLowerCase();

    // Fetch user from database
    const result = await docClient.send(
      new GetCommand({ TableName: USERS_TABLE, Key: { email: normalizedEmail } })
    );

    const user = result.Item;
    if (!user) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid email or password' }),
      };
    }

    // Verify authHash against stored bcrypt hash
    const isValid = await bcrypt.compare(authHash, user.passwordHash);
    if (!isValid) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid email or password' }),
      };
    }

    const token = signJwt({ email: normalizedEmail }, JWT_SECRET);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ token, email: normalizedEmail }),
    };
  } catch (error: any) {
    console.error('Error during login:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
