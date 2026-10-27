import { ArrowUpRight, Check, CreditCard, Hourglass, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useCapabilities, useCommerceActions, useCommerceSettings } from "../../api";
import type { Site } from "../../api/types";
import { Button, Spinner, toast } from "../../ui";
import { can } from "../site-mgmt/manage-ui";

/**
 * Payments for the shop and donations, guided: Stripe's own hosted sign-up (Stripe Connect) opens
 * in a new tab with everything OpenSpace can fill in; coming back, Studio re-checks by itself.
 * When this OpenSpace server can't take payments yet (no platform Stripe key), say so plainly and
 * keep the "opening soon" note on the site — never a broken checkout.
 */
export function PaymentsConnect({ site, onReady }: { site: Site; onReady?: () => void }) {
  const caps = useCapabilities();
  const commerce = useCommerceSettings(site.id, caps.payments.configured);
  const actions = useCommerceActions(site.id);
  const navigate = useNavigate();
  const payments = commerce.data?.payments;
  const ready = payments?.ready === true;

  // Coming back from Stripe's tab: check again when this window gets focus.
  const refresh = actions.refresh.mutate;
  useEffect(() => {
    if (!payments?.account || ready) return;
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [payments?.account, ready, refresh]);

  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  if (!caps.payments.configured)
    return (
      <div className="st-setup-wait">
        <Hourglass aria-hidden="true" />
        <div>
          <strong>Card payments are almost ready on OpenSpace.</strong> The OpenSpace team is
          finishing the connection to Stripe for everyone. Until then your site keeps its friendly
          “opening soon” note, and we'll show a button here the moment it's ready — nothing for you
          to do.
          <p className="st-setup-aside">
            Already have a Stripe account and comfortable copying two keys from it?{" "}
            <button
              type="button"
              className="st-linklike"
              onClick={() => navigate(`/sites/${site.id}/store`)}
            >
              Use your own Stripe keys instead
            </button>
          </p>
        </div>
      </div>
    );

  if (!can(site, "owner") && !ready)
    return (
      <p className="st-setup-note">
        Only the site's owner can connect Stripe, since payments go to their bank account.
      </p>
    );

  if (commerce.isPending) return <Spinner size={16} label="Checking payments" />;

  if (ready)
    return (
      <div className="st-setup-ok" role="status">
        <Check aria-hidden="true" />
        <div>
          <strong>Payments are ready.</strong> Money goes straight to your Stripe account; OpenSpace
          takes no fee.
        </div>
      </div>
    );

  const start = () =>
    actions.connect.mutate(window.location.href, {
      onSuccess: ({ url }) => {
        const w = window.open(url, "_blank");
        if (w) w.opener = null;
        else window.location.assign(url);
        toast({
          title: "Finish in Stripe's tab",
          description: "When you come back here, we'll check by ourselves.",
        });
      },
      onError: (e) =>
        toast({ tone: "danger", title: "Stripe didn't open", description: e.message }),
    });

  return (
    <div className="st-setup-pay">
      <p>
        Stripe is the card company most small businesses use. It asks for your name, your bank
        account and what you sell — about 5 minutes. Money goes straight to you; OpenSpace never
        sees card details and adds no fee.
      </p>
      <div className="st-setup-actions">
        <Button
          variant="primary"
          icon={<CreditCard />}
          loading={actions.connect.isPending}
          onClick={start}
        >
          {payments?.account ? "Continue in Stripe" : "Connect Stripe"}
          <ArrowUpRight aria-hidden="true" />
        </Button>
        {payments?.account && (
          <Button
            variant="ghost"
            icon={<RefreshCw />}
            loading={actions.refresh.isPending}
            onClick={() => refresh()}
          >
            Check again
          </Button>
        )}
      </div>
      {payments?.account && (
        <p className="st-setup-aside">
          Stripe still needs a few details. Pick up where you left off — your answers are saved.
        </p>
      )}
    </div>
  );
}
