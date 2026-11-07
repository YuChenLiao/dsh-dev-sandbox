import { createElement as h, useState } from "react";
import { TEXTS } from "../config.ts";

export interface CreateFormProps {
  busy: boolean;
  onCreate: (input: { name?: string; bundles?: string[] }) => void;
}

/** 新建表单：端口不给填，避免与工作环境撞车；bundles 留空即用最小组合。 */
export function CreateForm({ busy, onCreate }: CreateFormProps) {
  const [name, setName] = useState("");
  const [bundles, setBundles] = useState("");

  const submit = (): void => {
    const list = bundles.split(",").map((item) => item.trim()).filter(Boolean);
    onCreate({ name: name.trim() || undefined, bundles: list.length ? list : undefined });
    setName("");
    setBundles("");
  };

  return h("div", { className: "sbx-form" },
    h("input", {
      className: "sbx-input",
      placeholder: TEXTS.namePlaceholder,
      value: name,
      onChange: (event: { target: { value: string } }) => setName(event.target.value),
    }),
    h("input", {
      className: "sbx-input",
      placeholder: TEXTS.bundlesPlaceholder,
      value: bundles,
      onChange: (event: { target: { value: string } }) => setBundles(event.target.value),
    }),
    h("button", {
      className: "sbx-btn sbx-btn-primary",
      type: "button",
      onClick: submit,
      disabled: busy,
    }, busy ? TEXTS.creating : TEXTS.create));
}
