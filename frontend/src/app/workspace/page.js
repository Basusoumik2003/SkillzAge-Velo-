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

  // =====================================================
  // WIX <-> IFRAME AUTHENTICATION
  // =====================================================

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    // ===================================================
    // RECEIVE MESSAGES FROM WIX PARENT
    // ===================================================

    const handleWixMessage = (event) => {
      // -------------------------------------------------
      // SECURITY CHECK
      // -------------------------------------------------

      if (
        window.parent &&
        event.source !== window.parent
      ) {
        console.warn(
          "[WORKSPACE AUTH] Ignored message from non-parent window"
        );

        return;
      }

      const data = event?.data;

      console.log(
        "[WORKSPACE AUTH] FULL MESSAGE RECEIVED:",
        data
      );

      if (
        !data ||
        typeof data !== "object"
      ) {
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

      // =================================================
      // 1. AUTH TOKEN
      // =================================================

      if (
        data.type === "AUTH_TOKEN"
      ) {
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
            new Event(
              "WORKSPACE_AUTH_READY"
            )
          );
        } catch (error) {
          console.error(
            "[WORKSPACE AUTH] Failed to store JWT:",
            error
          );
        }

        return;
      }

      // =================================================
      // 2. AUTH USER
      // =================================================

      if (
        data.type === "AUTH_USER"
      ) {
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
          // STORE JOURNEY ID
          // ---------------------------------------------

          const journeyId =
            data.journeyId ||
            user.journeyId ||
            user.journey_id ||
            "";

          if (journeyId) {
            localStorage.setItem(
              "internlabs_journey_id",
              String(journeyId)
            );

            console.log(
              "[WORKSPACE JOURNEY] ✅ Journey ID stored:",
              journeyId
            );
          } else {
            console.warn(
              "[WORKSPACE JOURNEY] No journeyId received"
            );
          }

          // ---------------------------------------------
          // Normalize profile
          // ---------------------------------------------

          const profile = {
            id:
              user.id || "",

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
              user.profile_image ||
              user.profile_image_url ||
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
          // Tell React components that profile changed
          // ---------------------------------------------

          window.dispatchEvent(
            new Event(
              "internlabs_profile_updated"
            )
          );

          // ---------------------------------------------
          // Tell controller that journey changed
          // ---------------------------------------------

          window.dispatchEvent(
            new CustomEvent(
              "WORKSPACE_JOURNEY_UPDATED",
              {
                detail: {
                  journeyId:
                    journeyId
                      ? String(journeyId)
                      : ""
                }
              }
            )
          );

          console.log(
            "[WORKSPACE JOURNEY] ✅ Journey update event dispatched:",
            journeyId
          );

        } catch (error) {
          console.error(
            "[WORKSPACE PROFILE] Failed to store AUTH_USER:",
            error
          );
        }

        // ---------------------------------------------
        // If AUTH_USER contains token
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

      // =================================================
      // 3. WIX USER PROFILE
      // =================================================

      if (
        data.type === "WIX_USER_PROFILE"
      ) {
        const user = data.user;

        console.log(
          "[WORKSPACE PROFILE] WIX_USER_PROFILE received:",
          user
        );

        // ------------------------------------------------
        // LOGGED OUT
        // ------------------------------------------------

        if (
          data.loggedIn === false ||
          !user
        ) {
          console.log(
            "[WORKSPACE PROFILE] Wix user is logged out"
          );

          try {
            localStorage.removeItem(
              "internlabs_user"
            );

            localStorage.removeItem(
              "internlabs_profile"
            );

            localStorage.removeItem(
              "internlabs_token"
            );

            localStorage.removeItem(
              "internlabs_journey_id"
            );
          } catch (error) {
            console.error(
              "[WORKSPACE PROFILE] Failed to clear auth:",
              error
            );
          }

          window.dispatchEvent(
            new Event(
              "internlabs_profile_updated"
            )
          );

          window.dispatchEvent(
            new Event(
              "WORKSPACE_AUTH_READY"
            )
          );

          window.dispatchEvent(
            new CustomEvent(
              "WORKSPACE_JOURNEY_UPDATED",
              {
                detail: {
                  journeyId: ""
                }
              }
            )
          );

          return;
        }

        // ------------------------------------------------
        // LOGGED IN
        // ------------------------------------------------

        try {
          // ---------------------------------------------
          // Store complete Wix/backend user
          // ---------------------------------------------

          localStorage.setItem(
            "internlabs_user",
            JSON.stringify(user)
          );

          console.log(
            "[WORKSPACE PROFILE] ✅ User stored"
          );

          // ---------------------------------------------
          // JOURNEY ID
          // ---------------------------------------------

          const journeyId =
            data.journeyId ||
            user.journeyId ||
            user.journey_id ||
            "";

          if (journeyId) {
            localStorage.setItem(
              "internlabs_journey_id",
              String(journeyId)
            );

            console.log(
              "[WORKSPACE JOURNEY] ✅ Journey ID stored:",
              journeyId
            );
          }

          // ---------------------------------------------
          // Normalize profile
          // ---------------------------------------------

          const profile = {
            id:
              user.id || "",

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
              user.profile_image ||
              user.profile_image_url ||
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
          // Notify React
          // ---------------------------------------------

          window.dispatchEvent(
            new Event(
              "internlabs_profile_updated"
            )
          );

          // ---------------------------------------------
          // Notify journey update
          // ---------------------------------------------

          window.dispatchEvent(
            new CustomEvent(
              "WORKSPACE_JOURNEY_UPDATED",
              {
                detail: {
                  journeyId:
                    journeyId
                      ? String(journeyId)
                      : ""
                }
              }
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

      // =================================================
      // 4. COMBINED AUTHENTICATION DATA
      // =================================================

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
        // Journey ID
        // -----------------------------------------------

        const journeyId =
          data.journeyId ||
          data.journey_id ||
          "";

        if (journeyId) {
          try {
            localStorage.setItem(
              "internlabs_journey_id",
              String(journeyId)
            );

            console.log(
              "[WORKSPACE JOURNEY] ✅ Combined Journey ID stored:",
              journeyId
            );

            window.dispatchEvent(
              new CustomEvent(
                "WORKSPACE_JOURNEY_UPDATED",
                {
                  detail: {
                    journeyId:
                      String(journeyId)
                  }
                }
              )
            );
          } catch (error) {
            console.error(
              "[WORKSPACE JOURNEY] Failed to store journey ID:",
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
              id:
                user.id || "",

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
                user.profile_image ||
                user.profile_image_url ||
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

      // =================================================
      // 5. WORKSPACE READY
      // =================================================

      if (
        data.type === "WORKSPACE_READY"
      ) {
        console.log(
          "[WORKSPACE AUTH] Workspace ready acknowledgement received"
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
        "[WORKSPACE AUTH] ✅ WORKSPACE_READY sent to Wix"
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

  if (
    !ready ||
    loading
  ) {
    return (
      <div className="grid h-screen place-items-center bg-background">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground">
          <Loader2
            className="h-4 w-4 animate-spin text-primary"
          />
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
      <WorkspaceLayout
        {...controller}
      />

      {showDisclaimer ? (
        <DisclaimerModal
          onAccept={
            handleDisclaimerAccept
          }
        />
      ) : null}

      {showTour ? (
        <SpotlightTour
          onComplete={
            completeTour
          }
        />
      ) : null}

      {showWelcome ? (
        <WelcomeModal
          userName={
            studentName
          }
          isDemoProject={
            isDemoProject
          }
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