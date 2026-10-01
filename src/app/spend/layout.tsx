import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-bricolage",
});

const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
});

/**
 * Scopes the Spend route's fonts and palette to everything under /spend.
 *
 * data-spend lives on this wrapper rather than on <html> so the rest of the
 * app keeps its own fonts and tokens untouched — two visual worlds, not one
 * themed on top of the other.
 */
export default function SpendLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-spend
      className={`${bricolage.variable} ${atkinson.variable} min-h-full flex-1 bg-bg font-spend-body text-text [font-variant-numeric:tabular-nums]`}
    >
      {children}
    </div>
  );
}
