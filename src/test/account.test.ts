import { afterEach, describe, expect, it } from "vitest";
import { accountKey, setScope, usernameEmail } from "@/lib/account";
afterEach(() => setScope(null));
describe("private username accounts", () => {
  it("uses the same username identity for sign-up and sign-in without real email", () => {
    expect(usernameEmail(" Ahmed_1 ")).toBe("ahmed_1@reader.local");
    expect(() => usernameEmail("ahmed@example.com")).toThrow();
  });
  it("keeps reading preferences separate for each user and guest", () => {
    setScope("user-a"); const a = accountKey("maktaba-settings");
    setScope("user-b"); expect(accountKey("maktaba-settings")).not.toBe(a);
    setScope(null); expect(accountKey("maktaba-settings")).toBe("maktaba-settings");
  });
});