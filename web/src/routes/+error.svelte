<script lang="ts">
  import { page } from "$app/stores";
  import {
    AlertTriangle,
    ArrowLeft,
    BookOpen,
    ChevronRight,
    Home,
    LayoutDashboard,
  } from "@lucide/svelte";

  let { error, status }: { error: { message?: string }; status: number } =
    $props();

  const isNotFound = $derived(status === 404);
  const title = $derived(
    isNotFound ? "Page not found" : "Something went wrong",
  );
  const description = $derived.by(() => {
    if (isNotFound) {
      return `No page exists at "${$page.url.pathname}".`;
    }
    return (
      error?.message ||
      "An unexpected error occurred while loading this page."
    );
  });

  function goBack(): void {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = "/";
  }
</script>

<svelte:head>
  <title>{isNotFound ? "404 - Page not found" : `${status} - Error`} - OpenViber</title>
</svelte:head>

<section class="flex min-h-full flex-1 items-center justify-center bg-background px-4 py-10 sm:px-6">
  <div class="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
    <div class="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
      <AlertTriangle class="size-3.5" />
      Error {status}
    </div>

    <h1 class="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
      {title}
    </h1>
    <p class="mt-2 text-sm text-muted-foreground sm:text-base">{description}</p>

    <div class="mt-6 flex flex-wrap gap-2.5">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3.5 py-2 text-sm text-foreground hover:bg-accent"
        onclick={goBack}
      >
        <ArrowLeft class="size-4" />
        Go back
      </button>
      <a
        href="/docs"
        class="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3.5 py-2 text-sm text-foreground hover:bg-accent"
      >
        <BookOpen class="size-4" />
        Docs
      </a>
      <a
        href="/"
        class="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3.5 py-2 text-sm text-foreground hover:bg-accent"
      >
        <LayoutDashboard class="size-4" />
        Dashboard
      </a>
      <a
        href="/landing"
        class="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3.5 py-2 text-sm text-foreground hover:bg-accent"
      >
        <Home class="size-4" />
        Home
      </a>
    </div>
  </div>
</section>
