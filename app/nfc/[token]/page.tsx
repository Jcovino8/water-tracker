// app/nfc/[token]/page.tsx
export const dynamic = "force-dynamic";
export const dynamicParams = true;
export const runtime = "nodejs";

export default async function NfcPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main style={{ padding: 24 }}>
      <h1>NFC tag detected</h1>
      <p>Token: {token}</p>
      <p>If you can see this page, the route works.</p>
    </main>
  );
}