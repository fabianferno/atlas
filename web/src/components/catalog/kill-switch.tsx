"use client";

/**
 * kill_switch — mandatory in every autonomous app (REQUIRED_FOR_AUTONOMOUS).
 *
 * { halted?: boolean, event?: string, label?, note? }
 *
 * Two dispatches, in this order and for a reason:
 *   1. a LOCAL function call — the UI halts immediately, before any network
 *      round trip. If the agent is unreachable, the switch must still visibly
 *      work; a kill switch that waits on the thing it is killing is not one.
 *   2. a SERVER EVENT — the agent flips `policy.halted`, which is what actually
 *      blocks the signer.
 *
 * Resuming is deliberately more effort than halting: it needs a second press.
 */

import { useState } from "react";
import { Panel, BrutalButton, Label, Fig, useRuntime, Tag } from "@/components/brutal";
import { bool, dict, pick, pickStr, type CatProps } from "./_shared";

export function KillSwitch({ data, label, onAction, index }: CatProps) {
  const d = dict(data);
  const { policy } = useRuntime();
  const declaredHalted = bool(pick(d, "halted", "isHalted"), policy?.halted ?? false);

  const [halted, setHalted] = useState(declaredHalted);
  const [armResume, setArmResume] = useState(false);
  const event = pickStr(d, ["event", "eventName"], "kill_switch");

  const halt = () => {
    setHalted(true); // 1. local, immediate
    setArmResume(false);
    onAction?.({ name: event, context: { halted: true } }); // 2. server
  };

  const resume = () => {
    if (!armResume) {
      setArmResume(true);
      return;
    }
    setHalted(false);
    setArmResume(false);
    onAction?.({ name: event, context: { halted: false } });
  };

  return (
    <Panel
      index={index}
      title={label ?? pickStr(d, ["label", "title"], "Kill switch")}
      meta={
        halted ? (
          <Tag tone="loss" filled>
            halted
          </Tag>
        ) : (
          <Tag tone="gain">armed</Tag>
        )
      }
    >
      <div className="flex flex-col gap-2">
        {halted ? (
          <>
            <BrutalButton intent={armResume ? "danger" : "default"} full onClick={resume}>
              {armResume ? "press again to resume" : "resume agent"}
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
