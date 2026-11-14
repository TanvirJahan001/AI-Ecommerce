import { ContentPage } from "@/components/store";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ContentPage slug={slug} />;
}
