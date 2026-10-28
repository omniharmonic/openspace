import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../../api";
import type { User } from "../../api/types";

interface Pending {
  run: (user: User) => void;
  signIn: () => void;
}

/**
 * Runs an action as the signed-in person, or asks them to sign in — but only once the session is
 * known. Until `/api/me` answers, a signed-in person looks signed out; acting on that (a quick
 * upload or submit right after the page opens) sent them to "Sign in" although they already
 * were, and the thing they chose was dropped. A choice made while the session loads now waits
 * for it (`waiting` is true meanwhile) and then carries on.
 */
export function useWhenSignedIn(): {
  whenSignedIn: (run: (user: User) => void, signIn: () => void) => void;
  waiting: boolean;
} {
  const session = useSession();
  const known = !session.isPending;
  const user = session.data?.user ?? null;
  const state = useRef({ known, user });
  state.current = { known, user };
  const pending = useRef<Pending | null>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const next = pending.current;
    if (!known || !next) return;
    pending.current = null;
    setWaiting(false);
    if (user) next.run(user);
    else next.signIn();
  }, [known, user]);

  const whenSignedIn = useCallback((run: (user: User) => void, signIn: () => void) => {
    const now = state.current;
    if (!now.known) {
      pending.current = { run, signIn };
      setWaiting(true);
      return;
    }
    if (now.user) run(now.user);
    else signIn();
  }, []);

  return { whenSignedIn, waiting };
}
