// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormSideSheet } from "./CrmUi";

// Semi's optional Lottie dependency probes canvas at import; JSDOM has no canvas engine.
vi.hoisted(() => Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true, value: () => ({ fillRect: () => {}, fillStyle: "" }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shared create/edit side sheet", () => {
  it("keeps the existing save/cancel handlers and entered fields", async () => {
    const save = vi.fn(), cancel = vi.fn();
    root = createRoot(document.createElement("div"));
    await act(async () => root!.render(<FormSideSheet visible title="编辑活动" onOk={save} onCancel={cancel} motion={false}>
      <input aria-label="活动名称" defaultValue="Existing user draft" />
    </FormSideSheet>));
    const sheet = document.querySelector(".semi-sidesheet")!;
    expect(sheet).not.toBeNull();
    expect(document.querySelector(".semi-modal")).toBeNull();
    expect((sheet.querySelector("input") as HTMLInputElement).value).toBe("Existing user draft");
    const buttons = [...sheet.querySelectorAll<HTMLButtonElement>(".sheet-footer button")];
    await act(async () => buttons.find(button => button.textContent === "保存")!.click());
    expect(save).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    await act(async () => buttons.find(button => button.textContent === "取消")!.click());
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("respects the caller's disabled save guard", async () => {
    const save = vi.fn();
    root = createRoot(document.createElement("div"));
    await act(async () => root!.render(<FormSideSheet visible onOk={save} onCancel={() => {}} okButtonProps={{ disabled: true }} motion={false} />));
    const button = document.querySelector<HTMLButtonElement>(".sheet-footer button:last-child")!;
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
    expect(save).not.toHaveBeenCalled();
  });

  it("uses the right edge and caps width at the viewport", () => {
    vi.stubGlobal("innerWidth", 480);
    const element = FormSideSheet({ visible: true, width: 680, placement: "left", onCancel: () => {} });
    expect(element.props.placement).toBe("right");
    expect(element.props.width).toBe(480);
    expect(element.props.maskClosable).toBe(false);
    expect(element.props.closeOnEsc).toBe(true);
  });
});
