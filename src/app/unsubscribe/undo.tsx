"use client";

import { useActionState } from "react";
import { resubscribeFromForm } from "../subscribe/actions";

/** "Unsubscribed by mistake?": puts the address back on the list without a new confirmation. */
export function UndoUnsubscribe({ token }: { token: string }) {
  const [state, action, pending] = useActionState(() => resubscribeFromForm(token), null);

  if (state?.ok) {
    return (
      <p role="status" className="inline-flex h-10 items-center gap-1.5 text-[13px] font-medium text-accent">
        <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
          <path d="m3.5 8.5 3 3 6-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Subscribed again
      </p>
    );
  }
  return (
    <form action={action}>
      <button
        disabled={pending}
        className="inline-flex h-10 items-center rounded-full border border-border bg-surface px-4 text-[13px] font-medium text-fg transition-[border-color,scale,opacity] duration-150 hover:border-border-strong active:scale-[0.97] disabled:opacity-60"
      >
        {pending ? "Resubscribing…" : state && !state.ok ? "Couldn't undo, try again" : "Undo"}
      </button>
    </form>
  );
}
