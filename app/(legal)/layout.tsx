import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="bg-surface-50 pt-32 pb-24">
        <article className="mx-auto max-w-3xl px-6">{children}</article>
      </main>
      <Footer />
    </>
  );
}
