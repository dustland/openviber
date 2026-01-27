/**
 * WeCom (WeChat Work) Channel
 *
 * Integrates with WeCom Enterprise Application via webhook.
 * Receives encrypted XML messages and sends replies via WeCom API.
 *
 * @see https://developer.work.weixin.qq.com/document/path/90930
 */

import crypto from "crypto";
import {
  Channel,
  InboundMessage,
  AgentStreamEvent,
  WeComConfig,
} from "./channel";

// ==================== WeCom Types ====================

interface WeComMessage {
  ToUserName: string;
  FromUserName: string;
  CreateTime: number;
  MsgType: string;
  Content?: string;
  MsgId?: string;
  AgentID?: number;
}

// ==================== Crypto Utils ====================

class WeComCrypto {
  private token: string;
  private aesKey: Buffer;
  private corpId: string;

  constructor(token: string, encodingAESKey: string, corpId: string) {
    this.token = token;
    this.corpId = corpId;
    // AES key is base64 encoded + "=" padding, decode to 32 bytes
    this.aesKey = Buffer.from(encodingAESKey + "=", "base64");
  }

  /**
   * Verify callback URL signature
   */
  verifySignature(
    signature: string,
    timestamp: string,
    nonce: string,
    echostr?: string
  ): boolean {
    const sortedParams = [this.token, timestamp, nonce, echostr || ""]
      .filter(Boolean)
      .sort()
      .join("");
    const hash = crypto.createHash("sha1").update(sortedParams).digest("hex");
    return hash === signature;
  }

  /**
   * Decrypt message
   */
  decrypt(encrypted: string): string {
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      this.aesKey,
      this.aesKey.subarray(0, 16)
    );
    decipher.setAutoPadding(false);

    let decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]);

    // Remove PKCS7 padding
    const padLen = decrypted[decrypted.length - 1];
    decrypted = decrypted.subarray(0, decrypted.length - padLen);

    // Format: random(16) + msgLen(4) + msg + corpId
    const msgLen = decrypted.readUInt32BE(16);
    const content = decrypted.subarray(20, 20 + msgLen).toString("utf-8");

    return content;
  }

  /**
   * Encrypt message for reply
   */
  encrypt(message: string): string {
    const random = crypto.randomBytes(16);
    const msgBuffer = Buffer.from(message, "utf-8");
    const msgLen = Buffer.alloc(4);
    msgLen.writeUInt32BE(msgBuffer.length);
    const corpIdBuffer = Buffer.from(this.corpId, "utf-8");

    const plaintext = Buffer.concat([
      random,
      msgLen,
      msgBuffer,
      corpIdBuffer,
    ]);

    // PKCS7 padding
    const blockSize = 32;
    const padLen = blockSize - (plaintext.length % blockSize);
    const padding = Buffer.alloc(padLen, padLen);
    const padded = Buffer.concat([plaintext, padding]);

    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      this.aesKey,
      this.aesKey.subarray(0, 16)
    );
    cipher.setAutoPadding(false);

    const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
    return encrypted.toString("base64");
  }
}

// ==================== Channel Implementation ====================

export class WeComChannel implements Channel {
  id = "wecom";
  type = "webhook" as const;

  private config: WeComConfig;
  private crypto: WeComCrypto;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private responseBuffers = new Map<string, string>();

  constructor(config: WeComConfig) {
    this.config = config;
    this.crypto = new WeComCrypto(config.token, config.aesKey, config.corpId);
  }

  async start(): Promise<void> {
    await this.refreshAccessToken();
    console.log("[WeCom] Channel started");
  }

  async stop(): Promise<void> {
    this.accessToken = null;
    this.responseBuffers.clear();
    console.log("[WeCom] Channel stopped");
  }

  /**
   * Verify URL callback (for WeCom verification)
   */
  verifyUrl(
    signature: string,
    timestamp: string,
    nonce: string,
    echostr: string
  ): string | null {
    if (this.crypto.verifySignature(signature, timestamp, nonce, echostr)) {
      return this.crypto.decrypt(echostr);
    }
    return null;
  }

  /**
   * Parse XML webhook payload
   */
  parseWebhook(xmlContent: string, encrypted: string): InboundMessage | null {
    const decrypted = this.crypto.decrypt(encrypted);

    // Simple XML parsing (in production, use a proper XML parser)
    const getTag = (xml: string, tag: string): string => {
      const match = xml.match(new RegExp(`<${tag}><\\!\\[CDATA\\[(.+?)\\]\\]></${tag}>`));
      return match ? match[1] : "";
    };

    const fromUser = getTag(decrypted, "FromUserName");
    const content = getTag(decrypted, "Content");
    const msgId = getTag(decrypted, "MsgId");

    if (!content) return null;

    return {
      id: msgId || crypto.randomUUID(),
      source: this.id,
      userId: fromUser,
      conversationId: fromUser, // Use user ID as conversation ID
      content: content,
      metadata: {
        corpId: this.config.corpId,
        agentId: this.config.agentId,
      },
    };
  }

  async handleMessage(message: InboundMessage): Promise<void> {
    this.responseBuffers.set(message.conversationId, "");
  }

  async stream(
    conversationId: string,
    event: AgentStreamEvent
  ): Promise<void> {
    if (event.type === "text-delta") {
      const current = this.responseBuffers.get(conversationId) || "";
      this.responseBuffers.set(conversationId, current + event.content);
    } else if (event.type === "done") {
      const text = this.responseBuffers.get(conversationId) || "";
      await this.sendMessage(conversationId, text);
      this.responseBuffers.delete(conversationId);
    } else if (event.type === "error") {
      await this.sendMessage(conversationId, `Error: ${event.error}`);
      this.responseBuffers.delete(conversationId);
    }
  }

  /**
   * Send message via WeCom API
   */
  private async sendMessage(userId: string, content: string): Promise<void> {
    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          touser: userId,
          msgtype: "markdown",
          agentid: this.config.agentId,
          markdown: { content },
        }),
      });

      const result = await response.json();
      if (result.errcode !== 0) {
        console.error("[WeCom] Send message failed:", result);
      }
    } catch (error) {
      console.error("[WeCom] Send message error:", error);
    }
  }

  /**
   * Get access token (with caching)
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }
    await this.refreshAccessToken();
    return this.accessToken!;
  }

  /**
   * Refresh access token from WeCom API
   */
  private async refreshAccessToken(): Promise<void> {
    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.corpId}&corpsecret=${this.config.secret}`;

    try {
      const response = await fetch(url);
      const result = await response.json();

      if (result.errcode === 0) {
        this.accessToken = result.access_token;
        // Token expires in 2 hours, refresh 5 minutes early
        this.tokenExpiry = Date.now() + (result.expires_in - 300) * 1000;
      } else {
        console.error("[WeCom] Get token failed:", result);
      }
    } catch (error) {
      console.error("[WeCom] Get token error:", error);
    }
  }
}
