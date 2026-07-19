import { useEffect, useState } from "react";
import { apiClient, useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Users,
  Stethoscope,
  Shield,
  ScanLine,
  Activity,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  Trash2,
  Loader2,
} from "lucide-react";

function StatTile({ label, value, icon: Icon, accent }) {
  return (
    <Card className="p-5 border-border">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          <div className="font-display text-3xl font-bold mt-2">{value}</div>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Card>
  );
}

export default function Admin() {
  const { user: currentUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, u] = await Promise.all([
        apiClient.get("/admin/stats"),
        apiClient.get("/admin/users"),
      ]);
      setStats(s.data);
      setUsers(u.data);
    } catch (e) {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateRole = async (id, role) => {
    try {
      await apiClient.put(`/admin/users/${id}`, { role });
      toast.success("Role updated");
      load();
    } catch {
      toast.error("Failed to update role");
    }
  };

  const toggleActive = async (id, active) => {
    try {
      await apiClient.put(`/admin/users/${id}`, { active });
      toast.success(active ? "User enabled" : "User disabled");
      load();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this user permanently?")) return;
    try {
      await apiClient.delete(`/admin/users/${id}`);
      toast.success("User deleted");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to delete user");
    }
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto" data-testid="admin-page">
      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-2">Administration</h1>
      <p className="text-muted-foreground mb-8">Manage clinicians, roles, and observe system activity.</p>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatTile label="Total users" value={stats?.total_users ?? "—"} icon={Users} accent="bg-primary/10 text-primary" />
        <StatTile label="Doctors" value={stats?.total_doctors ?? "—"} icon={Stethoscope} accent="bg-accent/15 text-accent" />
        <StatTile label="Admins" value={stats?.total_admins ?? "—"} icon={Shield} accent="bg-violet-500/15 text-violet-600 dark:text-violet-400" />
        <StatTile label="Scans today" value={stats?.scans_today ?? "—"} icon={CalendarDays} accent="bg-amber-500/15 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatTile label="Total scans" value={stats?.total_scans ?? "—"} icon={ScanLine} accent="bg-primary/10 text-primary" />
        <StatTile label="Completed" value={stats?.completed_scans ?? "—"} icon={CheckCircle2} accent="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" />
        <StatTile label="Processing" value={stats?.processing_scans ?? "—"} icon={Activity} accent="bg-blue-500/15 text-blue-600 dark:text-blue-400" />
        <StatTile label="Errors" value={stats?.error_scans ?? "—"} icon={AlertCircle} accent="bg-red-500/15 text-red-600 dark:text-red-400" />
      </div>

      {/* Users table */}
      <Card className="border-border overflow-hidden" data-testid="admin-users-table">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Users</h2>
            <p className="text-xs text-muted-foreground">Manage roles &amp; account status.</p>
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="hidden md:table-cell">Specialty</TableHead>
                <TableHead className="hidden lg:table-cell">License</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isMe = u.id === currentUser?.id;
                return (
                  <TableRow key={u.id} data-testid={`admin-user-${u.id}`}>
                    <TableCell>
                      <div className="font-medium">{u.full_name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{u.specialty || "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs font-mono">{u.license_number || "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(v) => updateRole(u.id, v)}
                        disabled={isMe}
                      >
                        <SelectTrigger className="w-28 h-8" data-testid={`admin-role-${u.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="doctor">Doctor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => !isMe && toggleActive(u.id, !u.active)}
                        disabled={isMe}
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          u.active
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25"
                            : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        }`}
                        data-testid={`admin-status-${u.id}`}
                      >
                        {u.active ? "Active" : "Disabled"}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(u.id)}
                        disabled={isMe}
                        data-testid={`admin-delete-${u.id}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                    No users yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
