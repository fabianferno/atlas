/**
 * One running mini app, full width.
 *
 * Next 16: `params` is a Promise and must be awaited.
 */
import type { Metadata } from "next";
import { AppRuntime } from "@/components/board/app-runtime";
import { TopBar } from "@/components/board/top-bar";
import { SEED_APPS } from "@/lib/seed";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  const app = SEED_APPS.find((a) => a.manifest.name === name);
  return {
    title: app ? `${app.manifest.title} — Atlas` : `${name} — Atlas`,
    description: app?.manifest.intent,
  };
}

export default async function MiniAppPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  return (
    <>
      <TopBar />
      <AppRuntime name={name} />
    </>
  );
}
