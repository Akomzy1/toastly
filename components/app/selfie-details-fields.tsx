"use client";

import { Input, Label, Select } from "@/components/ui/field";

export type SandboxIdentity = { key: string; label: string };

/**
 * The one detail Smile ID needs that Toastly doesn't hold: a surname. Same
 * wording as main's hosted selfie screen — used only to verify, never shown,
 * never stored. In the sandbox, for allowed testers, Smile ID's test
 * identities instead (they decide the sandbox outcome).
 */
export function SelfieDetailsFields({ sandbox = [] }: { sandbox?: SandboxIdentity[] }) {
  if (sandbox.length) {
    return (
      <Label>
        Sandbox test identity (testing only — never shown on the live site)
        <Select name="sandbox_identity" defaultValue="clear">
          {sandbox.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </Select>
      </Label>
    );
  }
  return (
    <Label htmlFor="surname">
      Your surname — used only to verify you, never shown to other members
      <Input id="surname" name="surname" autoComplete="family-name" maxLength={60} required />
    </Label>
  );
}
