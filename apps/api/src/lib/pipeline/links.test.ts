import { describe, expect, it } from "vitest";
import { autoPitchMessage, MAX_DELIVERY_MESSAGE_CHARS, OPT_OUT_LINE } from "./links";

describe("autoPitchMessage", () => {
  it("ends an Auto pitch with the opt-out line", () => {
    const message = autoPitchMessage("Hi team, see {{site_link}}", "https://p.example/s/x");
    expect(message).toBe(`Hi team, see https://p.example/s/x\n\n${OPT_OUT_LINE}`);
  });

  it("leaves a message that already tells people about STOP as written", () => {
    expect(autoPitchMessage("See {{site_link}}. Reply stop if not interested.", "https://p.example/s/x")).not.toContain(OPT_OUT_LINE);
  });

  it("stays within the message limit and keeps both the link and the opt-out line", () => {
    const message = autoPitchMessage(`${"word ".repeat(400)}{{site_link}}`, "https://p.example/s/x");
    expect(message.length).toBeLessThanOrEqual(MAX_DELIVERY_MESSAGE_CHARS);
    expect(message).toContain("https://p.example/s/x");
    expect(message.endsWith(OPT_OUT_LINE)).toBe(true);
  });
});
