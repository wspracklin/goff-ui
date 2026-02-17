'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Shield,
  Users,
  Plus,
  Trash2,
  Loader2,
  Crown,
  Eye,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface Permission {
  resource: string;
  actions: string[];
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserWithRoles {
  userId: string;
  email: string;
  name: string;
  roles: Role[];
  lastActive: string;
}

const RESOURCES = ['flag', 'project', 'flagset', 'segment', 'settings', '*'];
const ACTIONS = ['read', 'write', 'delete', 'admin', 'manage_users'];

const roleIcons: Record<string, React.ReactNode> = {
  viewer: <Eye className="h-4 w-4 text-blue-500" />,
  editor: <Pencil className="h-4 w-4 text-green-500" />,
  admin: <ShieldCheck className="h-4 w-4 text-orange-500" />,
  owner: <Crown className="h-4 w-4 text-purple-500" />,
};

export default function AccessControlPage() {
  const queryClient = useQueryClient();
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [showAssignRole, setShowAssignRole] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState<Record<string, string[]>>({});
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await fetch('/api/roles');
      if (!res.ok) throw new Error('Failed to fetch roles');
      const data = await res.json();
      return data.roles as Role[];
    },
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      return data.users as UserWithRoles[];
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: async (role: { name: string; description: string; permissions: Permission[] }) => {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(role),
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'Failed to create role');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Role created');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setShowCreateRole(false);
      setNewRoleName('');
      setNewRoleDescription('');
      setNewRolePermissions({});
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create role');
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/roles/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'Failed to delete role');
      }
    },
    onSuccess: () => {
      toast.success('Role deleted');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setDeleteRoleId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete role');
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, roleIds }: { userId: string; roleIds: string[] }) => {
      const res = await fetch(`/api/users/${userId}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleIds }),
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'Failed to assign roles');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Roles updated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowAssignRole(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to assign roles');
    },
  });

  const togglePermission = (resource: string, action: string) => {
    setNewRolePermissions(prev => {
      const current = prev[resource] || [];
      if (current.includes(action)) {
        const updated = current.filter(a => a !== action);
        if (updated.length === 0) {
          const { [resource]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [resource]: updated };
      }
      return { ...prev, [resource]: [...current, action] };
    });
  };

  const handleCreateRole = () => {
    const permissions: Permission[] = Object.entries(newRolePermissions).map(([resource, actions]) => ({
      resource,
      actions,
    }));

    if (!newRoleName.trim()) {
      toast.error('Role name is required');
      return;
    }
    if (permissions.length === 0) {
      toast.error('At least one permission is required');
      return;
    }

    createRoleMutation.mutate({
      name: newRoleName.trim(),
      description: newRoleDescription.trim(),
      permissions,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">Access Control</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Manage roles and user permissions
          </p>
        </div>
      </div>

      {/* Roles Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Roles
              </CardTitle>
              <CardDescription>Define what actions each role can perform</CardDescription>
            </div>
            <Button onClick={() => setShowCreateRole(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Role
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rolesQuery.isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <div className="space-y-3">
              {rolesQuery.data?.map(role => (
                <div
                  key={role.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex items-center gap-3">
                    {roleIcons[role.name] || <Shield className="h-4 w-4 text-zinc-400" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{role.name}</span>
                        {role.isBuiltin && (
                          <Badge variant="secondary" className="text-xs">Built-in</Badge>
                        )}
                      </div>
                      {role.description && (
                        <p className="text-sm text-zinc-500">{role.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.map((p, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {p.resource}: {p.actions.join(', ')}
                        </Badge>
                      ))}
                    </div>
                    {!role.isBuiltin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteRoleId(role.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Users Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Users
          </CardTitle>
          <CardDescription>Users with assigned roles</CardDescription>
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : usersQuery.data && usersQuery.data.length > 0 ? (
            <div className="space-y-3">
              {usersQuery.data.map(user => (
                <div
                  key={user.userId}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div>
                    <div className="font-medium">{user.email || user.name || user.userId}</div>
                    {user.name && user.email && (
                      <p className="text-sm text-zinc-500">{user.name}</p>
                    )}
                    {user.lastActive && (
                      <p className="text-xs text-zinc-400">
                        Last active: {new Date(user.lastActive).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {user.roles.map(role => (
                        <Badge key={role.id} variant="secondary">{role.name}</Badge>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAssignRole(user.userId)}
                    >
                      Edit Roles
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-8 text-zinc-500">
              No users with assigned roles yet. Roles are assigned when users authenticate.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Create Role Dialog */}
      <Dialog open={showCreateRole} onOpenChange={setShowCreateRole}>
        <DialogHeader>
          <DialogTitle>Create Custom Role</DialogTitle>
          <DialogDescription>Define a new role with specific permissions</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="roleName">Role Name *</Label>
              <Input
                id="roleName"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g., flag-reviewer"
              />
            </div>
            <div>
              <Label htmlFor="roleDescription">Description</Label>
              <Textarea
                id="roleDescription"
                value={newRoleDescription}
                onChange={(e) => setNewRoleDescription(e.target.value)}
                placeholder="What can this role do?"
                rows={2}
              />
            </div>
            <div>
              <Label>Permissions</Label>
              <div className="mt-2 border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-100 dark:bg-zinc-800">
                      <th className="text-left p-2 font-medium">Resource</th>
                      {ACTIONS.map(action => (
                        <th key={action} className="p-2 font-medium text-center">{action}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RESOURCES.map(resource => (
                      <tr key={resource} className="border-t border-zinc-200 dark:border-zinc-700">
                        <td className="p-2 font-medium">{resource}</td>
                        {ACTIONS.map(action => (
                          <td key={action} className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={(newRolePermissions[resource] || []).includes(action)}
                              onChange={() => togglePermission(resource, action)}
                              className="rounded"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCreateRole(false)}>Cancel</Button>
          <Button onClick={handleCreateRole} disabled={createRoleMutation.isPending}>
            {createRoleMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Create Role
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Role Confirmation */}
      <Dialog open={!!deleteRoleId} onOpenChange={() => setDeleteRoleId(null)}>
        <DialogHeader>
          <DialogTitle>Delete Role</DialogTitle>
          <DialogDescription>Are you sure you want to delete this role?</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Users currently assigned this role will lose its permissions.
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteRoleId(null)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => deleteRoleId && deleteRoleMutation.mutate(deleteRoleId)}
            disabled={deleteRoleMutation.isPending}
          >
            {deleteRoleMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Assign Roles Dialog */}
      {showAssignRole && (
        <AssignRolesDialog
          userId={showAssignRole}
          roles={rolesQuery.data || []}
          currentRoles={usersQuery.data?.find(u => u.userId === showAssignRole)?.roles || []}
          onClose={() => setShowAssignRole(null)}
          onSave={(roleIds) => assignRoleMutation.mutate({ userId: showAssignRole, roleIds })}
          isSaving={assignRoleMutation.isPending}
        />
      )}
    </div>
  );
}

function AssignRolesDialog({
  userId,
  roles,
  currentRoles,
  onClose,
  onSave,
  isSaving,
}: {
  userId: string;
  roles: Role[];
  currentRoles: Role[];
  onClose: () => void;
  onSave: (roleIds: string[]) => void;
  isSaving: boolean;
}) {
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    currentRoles.map(r => r.id)
  );

  const toggleRole = (roleId: string) => {
    setSelectedRoles(prev =>
      prev.includes(roleId)
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogHeader>
        <DialogTitle>Assign Roles</DialogTitle>
        <DialogDescription>Select roles for user {userId}</DialogDescription>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-2">
          {roles.map(role => (
            <label
              key={role.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <input
                type="checkbox"
                checked={selectedRoles.includes(role.id)}
                onChange={() => toggleRole(role.id)}
                className="rounded"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {roleIcons[role.name] || <Shield className="h-4 w-4 text-zinc-400" />}
                  <span className="font-medium">{role.name}</span>
                  {role.isBuiltin && <Badge variant="secondary" className="text-xs">Built-in</Badge>}
                </div>
                {role.description && (
                  <p className="text-sm text-zinc-500 mt-1">{role.description}</p>
                )}
              </div>
            </label>
          ))}
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(selectedRoles)} disabled={isSaving}>
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Roles
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
