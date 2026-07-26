"use client";

/**
 * kill_switch — mandatory in every autonomous app (REQUIRED_FOR_AUTONOMOUS).
 *
 * Composer payload: { halted: boolean, scope: "app", global: boolean }
 * plus a component-level `action: serverEvent("halt_agent", …)` AND a
 * `localAction: { call: "setHalted", args: { halted: true } }` — the composer's
 * extension field for exactly this component. The renderer fires both.
 *
 * Two dispatches, in this order and for a reason:
 *   1. a LOCAL function call — the UI halts immediately, before any network
 *      round trip. If the agent is unreachable, the switch must still visibly
 *      work; a kill switch that waits on the thing it is killing is not one.
 *   2. a SERVER EVENT — the agent flips `policy.halted`, which is what actually
 *      blocks the signer.
 *
 * Resuming is deliberately more effort than halting: it needs a second press.
 *
 * VOCABULARY: this panel does not use the word "armed", in the UI or in its own
 * state names. The board owns that word for one meaning — *this app would act if
 * a trigger fired* — and the switch's own state is `halted` / `not tripped`. See
 * the tag in `meta` for the collision that forced the rule.
 */

import { useState } from "react";
import { Panel, BrutalButton, Label, Fig, useRuntime, Tag } from "@/components/brutal";
import { bool, dict, pick, pickStr, type CatProps } from "./_shared";

export function KillSwitch({ data, label, onAction, index }: CatProps) {
  const d = dict(data);
  const { policy } = useRuntime();
  const declaredHalted = bool(pick(d, "halted", "isHalted"), policy?.halted ?? false);

  const [halted, setHalted] = useState(declaredHalted);
  // Was `armResume`, renamed with the tag below. Same reason: "armed" is the
  // board's word for *would act if a trigger fired*, and using it here for
  // "the second press is ready" left one word meaning two things three lines
  // apart. Code the reader greps is part of the vocabulary.
  const [confirmResume, setConfirmResume] = useState(false);
  const event = pickStr(d, ["event", "eventName"], "halt_agent");
  const scope = pickStr(d, ["scope"], "app");

  const halt = () => {
    setHalted(true); // 1. local, immediate
    setConfirmResume(false);
    onAction?.({ name: event, context: { scope, halted: true } }); // 2. server
  };

  const resume = () => {
    if (!confirmResume) {
      setConfirmResume(true);
      return;
    }
    setHalted(false);
    setConfirmResume(false);
    onAction?.({ name: event, context: { scope, halted: false } });
  };

  return (
    <Panel
      index={index}
      title={label ?? pickStr(d, ["label", "title"], "Kill switch")}
      meta={
        /*
         * `not tripped`, and it used to say `armed`.
         *
         * ONE WORD, TWO MEANINGS, ON THE SAME SCREEN. "Armed" is the board's
         * vocabulary for *this app would act if a trigger fired* — the lamp in
         * `chrome.tsx`, `isArmed()` in `store.ts`, the "armed — would act if a
         * trigger fired" line in the tier legend. This tag meant the opposite
         * kind of thing: the SWITCH is set and has not been thrown. The two
         * readings were survivable while they usually agreed, and then they
         * stopped: `isArmed` now requires an issued ENS subname, so every bundled
         * app's policy strip reads `not armed` — and a few rows below it this tag
         * rendered a green `armed` about a different subject entirely. A reader
         * has no way to tell those apart, and the one they are likelier to take
         * away is the green one saying an unpublished app is armed.
         *
         * So the switch describes the switch. `halted` / `not tripped` is one
         * pair about one object, and `armed` is left to mean exactly one thing in
         * this product.
         *
         * The tones are unchanged and are worth stating rather than inheriting:
         * `loss` filled for halted because a stopped agent is the loud state and
         * the panel below it is a resume flow, and `gain` for not-tripped because
         * a working kill switch IS the good state here. That is not the same
         * claim as "this app is armed" — it says the safety control is intact,
         * which is true of every app regardless of whether it holds a name, a
         * wallet or a subscription.
         */
        halted ? (
          <Tag tone="loss" filled>
            halted
          </Tag>
        ) : (
          <Tag tone="gain">not tripped</Tag>
        )
      }
    >
      {/*
        THE TWO `danger` BUTTONS, checked while the tag was being renamed, and
        both kept. They are red for opposite reasons and neither is a claim:
        `halt this app` is red as the affordance every kill switch has trained a
        reader to look for, not because halting is risky — halting is the safe
        move and the label says what it does. The resume button is DEFAULT on the
        first press and only turns red on the second, because the second press is
        the one that hands an autonomous app its signer back; §7's "resuming is
        deliberately more effort than halting" is enforced by the two-press flow
        above, and the colour is the only part of it a reader sees before pressing.
      */}
      <div className="flex flex-col gap-2">
        {halted ? (
          <>
            <BrutalButton intent={confirmResume ? "danger" : "default"} full onClick={resume}>
              {confirmResume ? "press again to resume" : "resume agent"}
            </BrutalButton>
            <Label className="text-loss">
              every action is blocked at the signer until this is cleared
            </Label>
          </>
        ) : (
          <>
            <BrutalButton intent="danger" full onClick={halt}>
              halt this app
            </BrutalButton>
            <Label>
              stops triggers and blocks signing immediately
            </Label>
          </>
        )}
        <Fig size="xs" className="text-[var(--muted-ink)]">
          local halt → then server event `{event}`
        </Fig>
        {pickStr(d, ["note"]) ? <Label className="normal-case">{pickStr(d, ["note"])}</Label> : null}
      </div>
    </Panel>
  );
}
