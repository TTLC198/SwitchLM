import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";

export type ChatGptTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const authFileSchema = z
  .object({
    chatgpt: z.record(z.string(), z.object({
      accessToken: z.string(),
      refreshToken: z.string(),
      expiresAt: z.number(),
    })).default({}),
  })
  .default({ chatgpt: {} });

export class TokenStore {
  constructor(private readonly path = defaultTokenPath()) {}

  async getChatGptTokens(account = "default"): Promise<ChatGptTokens | undefined> {
    return (await this.read()).chatgpt[account];
  }

  async requireChatGptTokens(account = "default"): Promise<ChatGptTokens> {
    const tokens = await this.getChatGptTokens(account);

    if (!tokens) {
      throw new Error(`ChatGPT account is not logged in: ${account}. Run: switchlm login chatgpt`);
    }

    return tokens;
  }

  async saveChatGptTokens(account: string, tokens: ChatGptTokens): Promise<void> {
    const data = await this.read();
    data.chatgpt[account] = tokens;
    await this.write(data);
  }

  async deleteChatGptTokens(account = "default"): Promise<void> {
    const data = await this.read();
    delete data.chatgpt[account];
    await this.write(data);
  }

  private async read(): Promise<z.infer<typeof authFileSchema>> {
    try {
      return authFileSchema.parse(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { chatgpt: {} };
      }

      throw error;
    }
  }

  private async write(data: z.infer<typeof authFileSchema>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(tempPath, this.path);
  }
}

export function defaultTokenPath(): string {
  return join(homedir(), ".switchlm", "auth.json");
}
