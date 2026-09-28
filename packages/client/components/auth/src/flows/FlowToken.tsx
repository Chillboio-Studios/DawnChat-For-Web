import { onMount } from "solid-js";

import { Trans } from "@lingui/solid/macro";
import { useLocation, useNavigate, useSearchParams } from "@solidjs/router";

import { useClientLifecycle } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { useState } from "@revolt/state";

import { FlowTitle } from "./Flow";

export default function FlowToken() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state = useState();
  const modals = useModals();
  const { login, logout } = useClientLifecycle();

  onMount(async () => {
    const token = searchParams.token;
    navigate(location.pathname, { replace: true });

    if (typeof token !== "string" || token.length === 0) {
      navigate("/login/auth", { replace: true });
      return;
    }

    try {
      if (state.auth.getSession()) logout();

      const result = await login({ email: "token", password: token }, modals);

      navigate(result === false ? "/login/auth" : "/app", {
        replace: true,
      });
    } catch (error) {
      modals.showError(error);
      navigate("/login/auth", { replace: true });
    }
  });

  return (
    <FlowTitle>
      <Trans>Logging you in…</Trans>
    </FlowTitle>
  );
}
