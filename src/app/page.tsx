import { connection } from "next/server";
import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/lib/data";

export default async function Page() {
  // Listings change every scrape; always render from the database.
  await connection();
  const data = await getDashboardData();
  return <Dashboard listings={data.listings} status={data.status} now={data.now} />;
}
