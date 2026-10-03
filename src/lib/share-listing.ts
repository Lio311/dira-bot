export async function shareListing(url: string, title: string): Promise<"shared" | "copied" | "cancelled"> {
  const link = new URL(url);
  if (!["http:", "https:"].includes(link.protocol)) throw new Error("Invalid listing link");
  if (navigator.share) {
    try {
      await navigator.share({ title, url: link.href });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(link.href);
  return "copied";
}
