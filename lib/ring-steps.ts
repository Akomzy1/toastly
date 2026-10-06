import type { VerifyView } from "@/lib/verification-view";

/**
 * The verification stepper's three steps for a view (components/verify/
 * ring-stepper.tsx draws them). Pure, so it's tested directly
 * (scripts/verification-view.test.mjs).
 */

export type Ring = "done" | "checking" | "todo" | "optional" | "optional_checking";
export type Step = { label: string; ring: Ring; status: string };

export function ringSteps(view: VerifyView, reverify = false, idDone = false): { steps: Step[]; fill: string } {
  const phone: Step = { label: "Phone", ring: "done", status: "Confirmed" };
  const real = (ring: Ring, status: string): Step => ({ label: "Verified Real", ring, status });
  const id = (ring: Ring, status: string): Step => ({ label: "ID check", ring, status });
  const optional = id("optional", "Optional");

  // A re-check a reviewer asked for (decided 6 October 2026): "Verified Real ·
  // Re-check" — never "Next", and never why the member was asked. The ID ring
  // is shown as it stands ("ID check (unchanged)"): a re-check doesn't take it
  // away, and marking it would hint that something is wrong.
  if (reverify) {
    const idRing = idDone ? id("done", "Done") : optional;
    switch (view.kind) {
      case "selfie_checking":
        return { steps: [phone, real("checking", "Being checked"), idRing], fill: "50%" };
      case "selfie_review":
        return { steps: [phone, real("checking", "Being reviewed"), idRing], fill: "50%" };
      case "start":
      case "selfie_retry":
        return { steps: [phone, real("todo", "Re-check"), idRing], fill: "33.3%" };
    }
  }

  switch (view.kind) {
    case "phone":
      return { steps: [{ label: "Phone", ring: "todo", status: "Next" }, real("todo", "After phone"), optional], fill: "0%" };
    case "start":
      return { steps: [phone, real("todo", "Next"), optional], fill: "33.3%" };
    case "selfie_retry":
      return { steps: [phone, real("todo", "Try again"), optional], fill: "33.3%" };
    case "selfie_checking":
      return { steps: [phone, real("checking", "Being checked"), optional], fill: "50%" };
    case "selfie_review":
      return { steps: [phone, real("checking", "Being reviewed"), optional], fill: "50%" };
    case "passed":
    case "id_retry":
      return { steps: [phone, real("done", "Done"), optional], fill: "66.6%" };
    case "id_checking":
      return { steps: [phone, real("done", "Done"), id("optional_checking", "Being checked")], fill: "83.3%" };
    case "id_review":
      return { steps: [phone, real("done", "Done"), id("optional_checking", "Being reviewed")], fill: "83.3%" };
    case "both":
      return { steps: [phone, real("done", "Done"), id("done", "Done")], fill: "100%" };
  }
}
