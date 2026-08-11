import React from 'react';
import { useAuthStore } from '@/store/authStore';
import { UserRole } from '@/types';

interface RoleGateProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  fallback?: React.ReactNode;
}

export function RoleGate({ children, allowedRoles, fallback = null }: RoleGateProps) {
  const { userRole } = useAuthStore();

  if (!userRole || !allowedRoles.includes(userRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
