import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Stethoscope, Loader2 } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "doctor",
    specialty: "",
    license_number: "",
  });
  const [loading, setLoading] = useState(false);
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await register(form);
      toast.success(`Welcome, ${u.full_name}`);
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 sm:p-12 bg-background grid-mesh">
      <Card className="w-full max-w-lg p-8 sm:p-10 border-border">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div className="font-display font-bold">MedAI</div>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Create account</div>
        <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-2">Get started in seconds.</h2>
        <p className="text-sm text-muted-foreground mb-8">
          Register as a doctor to start uploading scans. Admin accounts are seeded by your IT team.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Full name</Label>
            <Input
              required
              value={form.full_name}
              onChange={(e) => update("full_name", e.target.value)}
              placeholder="Dr. Jane Doe"
              className="mt-1.5 h-11"
              data-testid="register-name"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
              <Input
                required
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="jane@hospital.com"
                className="mt-1.5 h-11"
                data-testid="register-email"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Password</Label>
              <Input
                required
                type="password"
                minLength={6}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="At least 6 characters"
                className="mt-1.5 h-11"
                data-testid="register-password"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Specialty</Label>
              <Input
                value={form.specialty}
                onChange={(e) => update("specialty", e.target.value)}
                placeholder="Radiology"
                className="mt-1.5 h-11"
                data-testid="register-specialty"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">License #</Label>
              <Input
                value={form.license_number}
                onChange={(e) => update("license_number", e.target.value)}
                placeholder="MD-123456"
                className="mt-1.5 h-11"
                data-testid="register-license"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Role</Label>
            <Select value={form.role} onValueChange={(v) => update("role", v)}>
              <SelectTrigger className="mt-1.5 h-11" data-testid="register-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="doctor">Doctor</SelectItem>
                <SelectItem value="admin">Admin (granted only if no admin exists)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full h-11 mt-2" disabled={loading} data-testid="register-submit">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <div className="mt-6 text-xs text-center text-muted-foreground">
          Already registered?{" "}
          <Link to="/login" className="text-primary hover:underline" data-testid="register-go-login">
            Sign in
          </Link>
        </div>
      </Card>
    </div>
  );
}
