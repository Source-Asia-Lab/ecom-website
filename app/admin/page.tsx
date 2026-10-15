import { auth } from "@/auth";
import { redirect } from "next/navigation";
import SiteFooter from "../components/site/SiteFooter";
import SiteHeader from "../components/site/SiteHeader";
import AdminConsole from "../components/site/AdminConsole";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "staff") redirect("/");

  return (
    <div className="landing-page">
      <SiteHeader currentPage="support" />
      <main className="admin-page">
        <header className="admin-page__header">
          <p className="section-heading__eyebrow">STAFF WORKSPACE</p>
          <h1>Operations</h1>
          <p>Signed in as {session.user.email}</p>
        </header>
        <AdminConsole />
      </main>
      <SiteFooter />
    </div>
  );
}