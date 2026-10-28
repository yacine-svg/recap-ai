import Link from "next/link";
import ShaderBg from "@/components/fx/ShaderBg";
import { Logo } from "@/components/Header";

/** Split screen for sign-in, sign-up and confirmation: the form on one side, the moving gradient on the other. */
export default function AuthFrame({ children, quote }: { children: React.ReactNode; quote?: string }) {
  return (
    <main className="auth">
      <div className="auth-form">
        <div>
          <Link href="/" className="row" style={{ textDecoration: "none", fontWeight: 800, fontSize: "1.2rem", marginBottom: 48, gap: 10 }}>
            <Logo />
            Recap
          </Link>
          {children}
        </div>
      </div>
      <div className="auth-art">
        <ShaderBg calm />
        <blockquote>{quote ?? "Every sentence in your notes, linked to the second it was said."}</blockquote>
      </div>
    </main>
  );
}
