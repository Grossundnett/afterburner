import { redirect } from "next/navigation";

/**
 * The home page is the list.
 *
 * A redirect rather than moving the list's code here: /days is a real address
 * worth linking to and returning to, and keeping the list at its own path means
 * the row links, the browser's back button and any future navigation all agree
 * on where it lives. The identity and sign-out this page used to show have
 * moved onto /days, so nothing is lost.
 */
export default function Home() {
  redirect("/days");
}
