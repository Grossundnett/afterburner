import { AppNav } from "@/components/app-nav";
import { getClaims } from "@/lib/supabase/server";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: claims } = await getClaims();
  const email = claims?.claims.email as string | undefined;

  return (
    <>
      <AppNav email={email} />
      {/* On desktop, push the content right of the fixed 160px sidebar.
          On mobile, keep space below for the fixed 60px bottom bar.
          flex-1 + flex-col preserves the existing chain so pages that
          use flex-1 on their <main> still fill the viewport. */}
      <div className="flex flex-1 flex-col md:ml-[160px] pb-[60px] md:pb-0">
        {children}
      </div>
    </>
  );
}
