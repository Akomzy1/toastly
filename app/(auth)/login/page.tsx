"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { signIn } from "../actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export default function LoginPage() {
  const [state, action] = useFormState(signIn, null);

  return (
    <>
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Welcome back</h1>
        <p className="text-ui text-grey-600">
          Sign in to pick up where you left off.
        </p>
      </div>

      <Card className="p-[26px]">
        <form action={action} className="grid gap-5">
          {state?.error ? <Notice tone="error">{state.error}</Notice> : null}

          <Label htmlFor="email">
            Email
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </Label>

          <Label htmlFor="password">
            Password
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Label>

          <Submit />
        </form>
      </Card>

      <p className="text-center text-ui text-grey-600">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-green-500">
          Create an account
        </Link>
      </p>
    </>
  );
}
