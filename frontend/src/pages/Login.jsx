import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Stethoscope, Loader2, Eye, EyeOff } from "lucide-react";

const HERO_IMG =
  "https://images.unsplash.com/photo-1771774982253-adcc7715b8f6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzh8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMG1lZGljYWwlMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc3NzMzNDUxNXww&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success(`Welcome back, ${u.full_name}`);
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const useDemo = () => {
    setEmail("admin@medai.com");
    setPassword("Admin@12345");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Hero */}
      <div className="relative hidden lg:block overflow-hidden">
        <img src={HERO_IMG} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-slate-900/80" />
        <div className="relative z-10 flex flex-col h-full p-12 text-white">
          <div className="flex items-center gap-3 mb-auto">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="font-display font-bold text-lg">MedAI</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/60">Diagnosis Suite</div>
            </div>
          </div>

          <div className="max-w-md">
            <div className="text-xs uppercase tracking-[0.2em] text-accent mb-4">Decision support for radiology</div>
            <h1 className="text-4xl xl:text-5xl font-display font-bold leading-[1.05] tracking-tight mb-6">
              AI-assisted reading for X-ray, MRI &amp; CT scans.
            </h1>
            <p className="text-white/70 leading-relaxed">
              Upload medical images, receive structured findings with confidence scores and highlighted regions, and
              hand a polished PDF to your patient — in under a minute.
            </p>

            <div className="mt-10 grid grid-cols-3 gap-4 text-center">
              {[
                { k: "<10s", v: "median analysis" },
                { k: "DICOM-ready", v: "JPG · PNG" },
                { k: "HIPAA-mind", v: "audit trail" },
              ].map((s) => (
                <div key={s.k} className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-3">
                  <div className="font-display font-semibold">{s.k}</div>
                  <div className="text-[11px] text-white/60">{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-white/40 mt-auto pt-12">
            For research &amp; decision support. Not a substitute for licensed clinical judgement.
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md p-8 sm:p-10 border-border shadow-sm">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div className="font-display font-bold">MedAI</div>
          </div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Sign in</div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-2">Welcome back, doctor.</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Use your clinic credentials to access patient scans and reports.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="doctor@hospital.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email"
                className="mt-1.5 h-11"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <div className="relative mt-1.5">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="login-password"
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Toggle password visibility"
                  data-testid="login-toggle-password"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-2"
              data-testid="login-submit"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={useDemo}
              data-testid="login-fill-demo"
              className="text-primary hover:underline"
            >
              Use demo admin credentials
            </button>
            <Link to="/register" className="text-muted-foreground hover:text-foreground" data-testid="login-go-register">
              Need an account? <span className="font-medium">Register →</span>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
