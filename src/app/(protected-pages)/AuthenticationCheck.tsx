"use client";

import { PageSpinner } from "@/components/Spinner";
import { useUser } from "@/context/UserContext";
import { isLocalAuthBypassEnabled } from "@/utils/auth-mode";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export const AuthenticationCheck = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const router = useRouter();
  const { currentUser, isLoading, memberships, error, refreshUser } = useUser();
  const [isReady, setIsReady] = useState(false);
  const retriedLocalSession = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (!currentUser) {
      // Local Clerk bypass never uses /sign-in. Sending there loops:
      // sign-in redirects to /dashboard, which sends you back.
      if (isLocalAuthBypassEnabled()) {
        if (!retriedLocalSession.current) {
          retriedLocalSession.current = true;
          void refreshUser();
        }
        return;
      }
      router.push("/sign-in");
      return;
    }

    if (memberships.length === 0) {
      router.push("/create-organisation");
      return;
    }

    if (
      !currentUser.profile.currentOrganisationId ||
      !memberships.some(
        m => m.organisationId === currentUser.profile.currentOrganisationId
      )
    ) {
      router.push("/select-organisation");
      return;
    }

    setIsReady(true);
  }, [currentUser, isLoading, memberships, router, error, refreshUser]);

  if (
    !isLoading &&
    !currentUser &&
    isLocalAuthBypassEnabled() &&
    retriedLocalSession.current
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <p className="text-sm text-gray-600">
          Could not start the local session. Refresh the page.
        </p>
      </div>
    );
  }

  if (isLoading || !isReady) {
    return <PageSpinner />;
  }

  if (!currentUser) {
    return null;
  }

  return <>{children}</>;
};
