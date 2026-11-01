let scope = "guest";
export const getScope = () => scope;
export const setScope = (id: string | null) => { scope = id || "guest"; };
export const accountKey = (key: string) => scope === "guest" ? key : `${key}:${scope}`;
export function usernameEmail(value: string) {
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(username)) throw new Error("اسم المستخدم: ٣–٣٢ حرف إنجليزي أو رقم أو شرطة سفلية، بدون مسافات.");
  return `${username}@reader.local`;
}