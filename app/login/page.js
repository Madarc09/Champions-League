import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { currentManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manager Login | Champions League"
};

export default async function LoginPage() {
  const manager = await currentManager();
  if (manager) redirect(`/team/${manager.slug}`);

  return (
    <section className="login-page">
      <LoginForm />
    </section>
  );
}
