"use client"

import { useState } from "react"
import { LoginView } from "@/components/login-view"
import { Dashboard } from "@/components/dashboard"

export interface UserSession {
  token: string
  email: string
  kyberPublicKey: Uint8Array
  kyberPrivateKey: Uint8Array
  vaultKey?: CryptoKey
}

export default function Page() {
  const [session, setSession] = useState<UserSession | null>(null)

  if (!session) {
    return (
      <LoginView
        onSignIn={(token, email, kyberPublicKey, kyberPrivateKey, vaultKey) => {
          setSession({ token, email, kyberPublicKey, kyberPrivateKey, vaultKey })
        }}
      />
    )
  }

  return (
    <Dashboard
      session={session}
      onSignOut={() => setSession(null)}
    />
  )
}
