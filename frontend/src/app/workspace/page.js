"use client";

import { Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";

import DisclaimerModal from "@/components/DisclaimerModal";
import SpotlightTour from "@/components/SpotlightTour";
import WelcomeModal from "@/components/WelcomeModal";
import WorkspaceLayout from "@/components/workspace-v2/WorkspaceLayout";
import useWorkspaceController from "./useWorkspaceController";

function WorkspaceContent() {
  const controller = useWorkspaceController();

  const {
    ready,
    loading,
    workspaceError,
    workspaceClosed,
    showDisclaimer,
    handleDisclaimerAccept,
    showTour,
    completeTour,
    showWelcome,
    setShowWelcome,
    studentName,
    isDemoProject
  } = controller;

  useEffect(() => {
    // =====================================================
    // RECEIVE MESSAGES FROM WIX PARENT
    // =====================================================

    const handleWixMessage = (event) => {
      const data = event?.data;

      console.log(
        "[WORKSPACE AUTH] FULL MESSAGE RECEIVED:",
        data
      );

      if (!data || typeof data !== "object") {
        return;
      }

      console.log(
        "[WORKSPACE AUTH] MESSAGE TYPE:",
        data?.type
      );

      console.log(
        "[WORKSPACE AUTH] MESSAGE KEYS:",
        Object.keys(data)
      );

      // ===================================================
      // 1. AUTH TOKEN
      // ===================================================

      if (data.type === "AUTH_TOKEN") {
        const token = data.token;

        console.log(
          "[WORKSPACE AUTH] AUTH_TOKEN received"
        );

        if (!token) {
          console.error(
            "[WORKSPACE AUTH] Empty token received"
          );
          return;
        }

        try {
          localStorage.setItem(
            "internlabs_token",
            token
          );

          console.log(
            "[WORKSPACE AUTH] ✅ JWT stored in iframe localStorage"
          );

          console.log(
            "[WORKSPACE AUTH] Token exists:",
            Boolean(
              localStorage.getItem(
                "internlabs_token"
              )
            )
          );

          window.dispatchEvent(
            new Event("WORKSPACE_AUTH_READY")
          );
        } catch (error) {
          console.error(
            "[WORKSPACE AUTH] Failed to store JWT:",
            error
          );
        }

        return;
      }

      // ===================================================
      // 2. AUTH USER FROM WIX
      // ===================================================
      //
      // Wix is actually sending:
      //
      // {
      //   type: "AUTH_USER",
      //   token: "...",
      //   user: {...}
      // }
      //
      // ===================================================

      if (data.type === "AUTH_USER") {
        const user = data.user;

        console.log(
          "[WORKSPACE PROFILE] AUTH_USER received:",
          user
        );

        if (!user) {
          console.error(
            "[WORKSPACE PROFILE] Empty AUTH_USER received"
          );
          return;
        }

        try {
          // ---------------------------------------------
          // Store complete user object
          // ---------------------------------------------

          localStorage.setItem(
            "internlabs_user",
            JSON.stringify(user)
          );

          console.log(
            "[WORKSPACE PROFILE] ✅ User stored"
          );

          // ---------------------------------------------
          // Build normalized profile
          // ---------------------------------------------

          const profile = {
            id: user.id || "",

            wix_member_id:
              user.wix_member_id || "",

            email:
              user.email || "",

            full_name:
              user.full_name ||
              user.name ||
              "",

            avatar_url:
              user.avatar_url ||
              user.profile_picture ||
              user.image_url ||
              ""
          };

          // ---------------------------------------------
          // Store profile
          // ---------------------------------------------

          localStorage.setItem(
            "internlabs_profile",
            JSON.stringify(profile)
          );

          console.log(
            "[WORKSPACE PROFILE] ✅ Profile stored:",
            profile
          );

          // ---------------------------------------------
          // Debug
          // ---------------------------------------------

          console.log(
            "[WORKSPACE PROFILE] User ID:",
            profile.id
          );

          console.log(
            "[WORKSPACE PROFILE] Wix Member ID:",
            profile.wix_member_id
          );

          console.log(
            "[WORKSPACE PROFILE] Name:",
            profile.full_name
          );

          console.log(
            "[WORKSPACE PROFILE] Email:",
            profile.email
          );

          console.log(
            "[WORKSPACE PROFILE] Avatar:",
            profile.avatar_url
          );

          // ---------------------------------------------
          // Notify React components
          // ---------------------------------------------

          window.dispatchEvent(
            new Event(
              "internlabs_profile_updated"
            )
          );

          console.log(
            "[WORKSPACE PROFILE] ✅ Profile update event dispatched"
          );

        } catch (error) {
          console.error(
            "[WORKSPACE PROFILE] Failed to store AUTH_USER:",
            error
          );
        }

        // ---------------------------------------------
        // If AUTH_USER also contains a token,
        // make sure it is stored as well.
        // ---------------------------------------------

        if (data.token) {
          try {
            localStorage.setItem(
              "internlabs_token",
              data.token
            );

            console.log(
              "[WORKSPACE AUTH] ✅ Token from AUTH_USER stored"
            );

            window.dispatchEvent(
              new Event(
                "WORKSPACE_AUTH_READY"
              )
            );
          } catch (error) {
            console.error(
              "[WORKSPACE AUTH] Failed to store AUTH_USER token:",
              error
            );
          }
        }

        return;
      }

      // ===================================================
      // 3. WIX USER PROFILE
      // ===================================================

      if (data.type === "WIX_USER_PROFILE") {
        const user = data.user;

        console.log(
          "[WORKSPACE PROFILE] Wix user received:",
          user
        );

        if (!user) {
          console.error(
            "[WORKSPACE PROFILE] Empty user received"
          );
          return;
        }

        try {
          // ---------------------------------------------
          // Store complete user
          // ---------------------------------------------

          localStorage.setItem(
            "internlabs_user",
            JSON.stringify(user)
          );

          console.log(
            "[WORKSPACE PROFILE] ✅ User stored"
          );

          // ---------------------------------------------
          // Normalize profile
          // ---------------------------------------------

          const profile = {
            id: user.id || "",

            wix_member_id:
              user.wix_member_id || "",

            email:
              user.email || "",

            full_name:
              user.full_name ||
              user.name ||
              "",

            avatar_url:
              user.avatar_url ||
              user.profile_picture ||
              user.image_url ||
              ""
          };

          // ---------------------------------------------
          // Store profile
          // ---------------------------------------------

          localStorage.setItem(
            "internlabs_profile",
            JSON.stringify(profile)
          );

          console.log(
            "[WORKSPACE PROFILE] ✅ Profile stored:",
            profile
          );

          // ---------------------------------------------
          // Debug
          // ---------------------------------------------

          console.log(
            "[WORKSPACE PROFILE] User ID:",
            profile.id
          );

          console.log(
            "[WORKSPACE PROFILE] Wix Member ID:",
            profile.wix_member_id
          );

          console.log(
            "[WORKSPACE PROFILE] Name:",
            profile.full_name
          );

          console.log(
            "[WORKSPACE PROFILE] Email:",
            profile.email
          );

          console.log(
            "[WORKSPACE PROFILE] Avatar:",
            profile.avatar_url
          );

          // ---------------------------------------------
          // Notify React components
          // ---------------------------------------------

          window.dispatchEvent(
            new Event(
              "internlabs_profile_updated"
            )
          );

        } catch (error) {
          console.error(
            "[WORKSPACE PROFILE] Failed to store profile:",
            error
          );
        }

        return;
      }

      // ===================================================
      // 4. COMBINED AUTHENTICATION DATA
      // ===================================================

      if (
        data.type === "AUTH_DATA" ||
        data.type === "WIX_AUTH_DATA" ||
        data.type === "AUTHENTICATION_DATA"
      ) {
        console.log(
          "[WORKSPACE AUTH] Combined authentication data received"
        );

        // -----------------------------------------------
        // Token
        // -----------------------------------------------

        if (data.token) {
          try {
            localStorage.setItem(
              "internlabs_token",
              data.token
            );

            console.log(
              "[WORKSPACE AUTH] ✅ Combined JWT stored"
            );
          } catch (error) {
            console.error(
              "[WORKSPACE AUTH] Failed to store combined JWT:",
              error
            );
          }
        }

        // -----------------------------------------------
        // User
        // -----------------------------------------------

        const user =
          data.user ||
          data.profile ||
          null;

        if (user) {
          try {
            localStorage.setItem(
              "internlabs_user",
              JSON.stringify(user)
            );

            const profile = {
              id: user.id || "",

              wix_member_id:
                user.wix_member_id || "",

              email:
                user.email || "",

              full_name:
                user.full_name ||
                user.name ||
                "",

              avatar_url:
                user.avatar_url ||
                user.profile_picture ||
                user.image_url ||
                ""
            };

            localStorage.setItem(
              "internlabs_profile",
              JSON.stringify(profile)
            );

            console.log(
              "[WORKSPACE PROFILE] ✅ Combined profile stored:",
              profile
            );

            window.dispatchEvent(
              new Event(
                "internlabs_profile_updated"
              )
            );

          } catch (error) {
            console.error(
              "[WORKSPACE PROFILE] Failed to store combined profile:",
              error
            );
          }
        }

        // -----------------------------------------------
        // Notify authentication
        // -----------------------------------------------

        if (data.token) {
          window.dispatchEvent(
            new Event(
              "WORKSPACE_AUTH_READY"
            )
          );
        }

        return;
      }

      // ===================================================
      // 5. WORKSPACE READY ACK
      // ===================================================

      if (data.type === "WORKSPACE_READY") {
        console.log(
          "[WORKSPACE AUTH] Workspace ready message received"
        );

        return;
      }
    };

    // =====================================================
    // REGISTER MESSAGE LISTENER
    // =====================================================

    window.addEventListener(
      "message",
      handleWixMessage
    );

    console.log(
      "[WORKSPACE AUTH] Message listener registered"
    );

    // =====================================================
    // TELL WIX THAT IFRAME IS READY
    // =====================================================

    if (
      window.parent &&
      window.parent !== window
    ) {
      window.parent.postMessage(
        {
          type: "WORKSPACE_READY"
        },
        "*"
      );

      console.log(
        "[WORKSPACE AUTH] WORKSPACE_READY sent to Wix"
      );
    }

    // =====================================================
    // CLEANUP
    // =====================================================

    return () => {
      window.removeEventListener(
        "message",
        handleWixMessage
      );

      console.log(
        "[WORKSPACE AUTH] Message listener removed"
      );
    };
  }, []);

  // =======================================================
  // EXISTING WORKSPACE LOADING
  // =======================================================

  if (!ready || loading) {
    return (
      <div className="grid h-screen place-items-center bg-background">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Loading your workspace...
        </div>
      </div>
    );
  }

  // =======================================================
  // EXISTING WORKSPACE ERROR
  // =======================================================

  if (workspaceError) {
    return (
      <div className="grid h-screen place-items-center bg-background px-4">
        <div className="max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-5 text-center text-sm font-semibold text-destructive">
          {workspaceError}
        </div>
      </div>
    );
  }

  // =======================================================
  // EXISTING CLOSED WORKSPACE
  // =======================================================

  if (workspaceClosed?.closed) {
    return (
      <div className="grid h-screen place-items-center bg-background px-4">
        <div className="max-w-md rounded-2xl border border-border bg-card px-6 py-5 text-center text-sm font-semibold text-foreground">
          {workspaceClosed.message ||
            "This workspace is currently closed."}
        </div>
      </div>
    );
  }

  // =======================================================
  // EXISTING WORKSPACE UI
  // =======================================================

  return (
    <>
      <WorkspaceLayout {...controller} />

      {showDisclaimer ? (
        <DisclaimerModal
          onAccept={handleDisclaimerAccept}
        />
      ) : null}

      {showTour ? (
        <SpotlightTour
          onComplete={completeTour}
        />
      ) : null}

      {showWelcome ? (
        <WelcomeModal
          userName={studentName}
          isDemoProject={isDemoProject}
          onClose={() =>
            setShowWelcome(false)
          }
        />
      ) : null}
    </>
  );
}

// =========================================================
// WORKSPACE PAGE
// =========================================================

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-screen place-items-center bg-background text-sm text-muted-foreground">
          Loading workspace...
        </div>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}