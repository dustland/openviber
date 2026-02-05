import type { AuthUser } from "$lib/server/auth";

declare global {
  namespace App {
    interface Locals {
      user: AuthUser | null;
    }

    interface PageData {
      user: AuthUser | null;
    }
  }
}

export {};
