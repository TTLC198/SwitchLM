import type { ChatGptOAuthConfig } from "./chatgpt-oauth.js";

export const unstableChatGptOAuthDefaults: ChatGptOAuthConfig = {
  authorizeUrl: "https://auth.openai.com/oauth/authorize",
  tokenUrl: "https://auth.openai.com/oauth/token",
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  scopes: ["openid", "profile", "email", "offline_access"],
  extraParams: {
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: "codex_cli_rs",
    prompt: "login",
  },
};
