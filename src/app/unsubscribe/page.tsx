import type { Metadata } from "next";
import { connection } from "next/server";
import { NoticePage } from "@/components/notice-page";
import { maskEmail, unsubscribe } from "@/lib/subscriptions";
import { UndoUnsubscribe } from "./undo";

export const metadata: Metadata = {
  title: "Unsubscribe · diraBot",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** One click from the email footer: opening the link unsubscribes, and the page offers an undo. */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { token } = await searchParams;
  const { outcome, email } = await unsubscribe(token);

  if (outcome === "invalid" || !email || typeof token !== "string") {
    return (
      <NoticePage tone="warning" title="This link doesn't work">
        It may be incomplete. Use the unsubscribe link at the bottom of any diraBot email.
      </NoticePage>
    );
  }
  return (
    <NoticePage tone="neutral" title="You're unsubscribed" actions={<UndoUnsubscribe token={token} />}>
      <span className="font-medium text-fg">{maskEmail(email)}</span> won&apos;t get diraBot alerts anymore.
    </NoticePage>
  );
}
