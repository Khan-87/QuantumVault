const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ─── Type Definitions ────────────────────────────────────────────────────────

export interface FileRecord {
  fileId: string;
  ownerID: string;
  fileName: string;
  fileSize: number;
  s3CiphertextKey: string;
  s3WrappedKeyRef: string;
  iv: string; // base64-encoded AES-GCM IV
  fileStatus: 'pending' | 'uploaded';
  uploadTimestamp: string;
  lastAccessedAt?: string;
}

// ─── Auth Header ─────────────────────────────────────────────────────────────

function getAuthHeader(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ─── 1. Fetch User Salt ──────────────────────────────────────────────────────

export async function fetchUserSalt(email: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}auth/salt?email=${encodeURIComponent(email)}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error('Failed to fetch salt');
    }
    const data = await res.json();
    return data.salt;
  } catch (error) {
    console.error('Error fetching salt:', error);
    return null;
  }
}

// ─── 2. User Registration (Zero-Knowledge) ──────────────────────────────────

export async function registerUser(
  email: string,
  authHash: string,
  salt: string,
  kyberPublicKey: string,
  firstName?: string,
  lastName?: string
): Promise<{ token: string; email: string }> {
  const res = await fetch(`${API_URL}auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, authHash, salt, kyberPublicKey, firstName, lastName }),
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Registration failed');
  }

  return res.json();
}

// ─── 3. User Login (Zero-Knowledge) ─────────────────────────────────────────

export async function loginUser(
  email: string,
  authHash: string
): Promise<{ token: string; email: string }> {
  const res = await fetch(`${API_URL}auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, authHash }),
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Login failed');
  }

  return res.json();
}

// ─── 4. Get User Files ──────────────────────────────────────────────────────

export async function fetchUserFiles(token: string): Promise<FileRecord[]> {
  const res = await fetch(`${API_URL}files`, {
    method: 'GET',
    headers: getAuthHeader(token),
  });

  if (!res.ok) {
    throw new Error('Failed to fetch files');
  }

  const data = await res.json();
  return data.files;
}

// ─── 5. Encrypted Upload Pipeline ───────────────────────────────────────────

export async function uploadEncryptedFile(
  token: string,
  file: File,
  kyberPublicKey: Uint8Array,
  encryptFileFn: (plaintext: ArrayBuffer, pubKey: Uint8Array) => Promise<{
    ciphertext: Uint8Array;
    wrappedKey: Uint8Array;
    iv: Uint8Array;
  }>,
  uint8ToBase64Fn: (bytes: Uint8Array) => string,
  onProgress?: (progress: number) => void
): Promise<FileRecord> {
  // A. Read file content
  const plaintext = await file.arrayBuffer();

  // B. Encrypt client-side (AES-256-GCM + Kyber key wrapping)
  if (onProgress) onProgress(5);
  const { ciphertext, wrappedKey, iv } = await encryptFileFn(plaintext, kyberPublicKey);
  if (onProgress) onProgress(20);

  // C. Request two pre-signed upload URLs from Lambda
  const ivBase64 = uint8ToBase64Fn(iv);
  const res = await fetch(`${API_URL}files/upload-url`, {
    method: 'POST',
    headers: getAuthHeader(token),
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      iv: ivBase64,
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to get S3 upload links');
  }

  const { ciphertextUrl, wrappedKeyUrl, fileId } = await res.json();
  if (onProgress) onProgress(25);

  // D. Upload encrypted ciphertext to S3
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ciphertextUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          // Map upload progress from 25% → 85%
          const pct = 25 + (event.loaded / event.total) * 60;
          onProgress(Math.round(pct));
        }
      };
    }

    xhr.onload = () => (xhr.status === 200 ? resolve() : reject(new Error(`S3 ciphertext upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('S3 ciphertext upload error'));
    xhr.send(ciphertext);
  });

  // E. Upload wrapped key to S3
  const wrappedKeyRes = await fetch(wrappedKeyUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: wrappedKey,
  });

  if (!wrappedKeyRes.ok) {
    throw new Error('Failed to upload wrapped key to S3');
  }
  if (onProgress) onProgress(90);

  // F. Confirm upload
  const confirmRes = await fetch(`${API_URL}files/confirm`, {
    method: 'POST',
    headers: getAuthHeader(token),
    body: JSON.stringify({ fileId }),
  });

  if (!confirmRes.ok) {
    throw new Error('Failed to confirm upload');
  }
  if (onProgress) onProgress(100);

  return {
    fileId,
    ownerID: '',
    fileName: file.name,
    fileSize: file.size,
    s3CiphertextKey: '',
    s3WrappedKeyRef: '',
    iv: ivBase64,
    fileStatus: 'uploaded',
    uploadTimestamp: new Date().toISOString(),
  };
}

// ─── 6. Encrypted Download Pipeline ────────────────────────────────────────

export async function downloadEncryptedFile(
  token: string,
  fileId: string,
  fileName: string,
  ivBase64: string,
  kyberPrivateKey: Uint8Array,
  decryptFileFn: (ciphertext: Uint8Array, wrappedKey: Uint8Array, iv: Uint8Array, privateKey: Uint8Array) => Promise<Uint8Array>,
  base64ToUint8Fn: (base64: string) => Uint8Array
): Promise<void> {
  // A. Request pre-signed GET URLs from Lambda
  const res = await fetch(`${API_URL}files/download-url`, {
    method: 'POST',
    headers: getAuthHeader(token),
    body: JSON.stringify({ fileId }),
  });

  if (!res.ok) {
    throw new Error('Failed to get download URLs');
  }

  const { ciphertextUrl, wrappedKeyUrl } = await res.json();

  // B. Fetch encrypted ciphertext and wrapped key from S3
  const [ciphertextRes, wrappedKeyRes] = await Promise.all([
    fetch(ciphertextUrl),
    fetch(wrappedKeyUrl),
  ]);

  if (!ciphertextRes.ok || !wrappedKeyRes.ok) {
    throw new Error('Failed to download encrypted files from S3');
  }

  const ciphertext = new Uint8Array(await ciphertextRes.arrayBuffer());
  const wrappedKey = new Uint8Array(await wrappedKeyRes.arrayBuffer());
  const iv = base64ToUint8Fn(ivBase64);

  // C. Decrypt client-side
  const plaintext = await decryptFileFn(ciphertext, wrappedKey, iv, kyberPrivateKey);

  // D. Trigger browser download of the decrypted file
  const blob = new Blob([plaintext]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
