import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { currentManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manager Login | Champions League"
};

export default async function LoginPage({ searchParams }) {
  const manager = await currentManager();
  const params = await searchParams;
  const next = typeof params?.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : null;
  if (manager && !next) redirect(`/team/${manager.slug}/locker-room`);

  return (
    <section className="login-page">
      <LoginForm />
    </section>
  );
}
