import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const USERS_TABLE = process.env.USERS_TABLE || 'QuantumVault-Users';
const JWT_SECRET = process.env.JWT_SECRET || 'quantum-vault-secret-key-change-me';

// Helper to sign JWT using native crypto (HS256)
function signJwt(payload: any, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };

  if (!event.body) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Request body is required' }) };
  }

  try {
    const { email, authHash, salt, kyberPublicKey, firstName, lastName } = JSON.parse(event.body);

    if (!email || !authHash || !salt) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Email, authHash, and salt are required' }) };
    }

    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const existingUser = await docClient.send(
      new GetCommand({ TableName: USERS_TABLE, Key: { email: normalizedEmail } })
    );

    if (existingUser.Item) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'User already exists' }) };
    }

    // Hash the authHash with bcrypt (double-hash: client PBKDF2 → server bcrypt)
    const saltRounds = 10;
    const authHashHashed = await bcrypt.hash(authHash, saltRounds);

    // Save to DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: {
          email: normalizedEmail,
          pbkdf2Salt: salt,
          passwordHash: authHashHashed,
          kyberPublicKey: kyberPublicKey || '',
          firstName: firstName || '',
          lastName: lastName || '',
          createdAt: new Date().toISOString(),
        },
      })
    );

    // Generate JWT
    const token = signJwt({ email: normalizedEmail }, JWT_SECRET);

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ token, email: normalizedEmail }) };
  } catch (error: any) {
    console.error('Error during registration:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
