import { Button, Text } from "@/ui";
import { useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/lib/auth/auth-provider";
import { useIsOnline } from "@/lib/data/data-provider";

export default function SignInScreen() {
  const { status, signIn, signOut } = useAuth();
  const online = useIsOnline();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);

    try {
      // A signed-in owner leaves this screen through the route guard.
      await signIn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="bg-background flex-1 items-center justify-center gap-4 p-6">
      {status === "not-owner" ? <NotOwner /> : <Welcome />}
      <Button onPress={start} disabled={!online || busy} className="w-full max-w-xs">
        <Text>{status === "not-owner" ? "Sign in with another account" : "Sign in"}</Text>
      </Button>
      {status === "not-owner" && (
        <Button variant="ghost" onPress={signOut} className="w-full max-w-xs">
          <Text>Sign out</Text>
        </Button>
      )}
      {!online && <Text variant="muted">Offline. Signing in needs a connection.</Text>}
    </View>
  );
}

function Welcome() {
  return (
    <View className="max-w-xs gap-2">
      <Text aria-level={1} variant="headline" className="text-center">
        Journal
      </Text>
      <Text variant="muted" className="text-center">
        Sign in with the owner&apos;s account to see your Habits, Check-ins and Connections.
      </Text>
    </View>
  );
}

function NotOwner() {
  return (
    <View className="max-w-xs gap-2">
      <Text aria-level={1} variant="headline" className="text-center">
        This app is for the owner
      </Text>
      <Text variant="muted" className="text-center">
        The account you signed in with isn&apos;t the owner&apos;s.
      </Text>
    </View>
  );
}
