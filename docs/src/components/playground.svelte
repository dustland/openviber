<script lang="ts">
  import { onMount } from "svelte";
  import { cn } from "$lib/utils";
  import ChatInput from "./chat-input.svelte";
  import Card from "./ui/card.svelte";
  import Badge from "./ui/badge.svelte";
  import Button from "./ui/button.svelte";
  import { ArrowRight } from "lucide-svelte";

  // Use VITE_ or PUBLIC_ prefix depending on Astro config, keeping it simple check content
  let isCreating = $state(false);
  let messages = $state<any[]>([]);

  // Initialize from URL params
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const initialPrompt = params.get("prompt");
    if (initialPrompt) {
      handleCreateXAgent(initialPrompt);
      // Clean URL without refresh
      window.history.replaceState({}, "", "/playground");
    }
  });

  const sampleGoals = [
    {
      id: 1,
      title: "AI Tools Market Analysis",
      description:
        "Research the current AI productivity tools market, compare top 5 competitors, and identify opportunities for differentiation",
      config: "auto_writer",
    },
    {
      id: 2,
      title: "Python Code Documentation",
      description:
        "Generate comprehensive documentation for a Python REST API project including API endpoints, data models, and usage examples",
      config: "simple_team",
    },
    {
      id: 3,
      title: "SaaS Blog Content Strategy",
      description:
        "Create a 3-month content calendar for a B2B SaaS startup focusing on SEO-optimized topics in the project management space",
      config: "handoff_demo",
    },
    {
      id: 4,
      title: "E-commerce Competitor Analysis",
      description:
        "Analyze top 5 sustainable fashion e-commerce brands, their pricing strategies, marketing channels, and unique selling propositions",
      config: "extractor",
    },
    {
      id: 5,
      title: "Mobile App Launch Plan",
      description:
        "Develop a go-to-market strategy for a fitness tracking mobile app including pre-launch, launch week, and post-launch activities",
      config: "auto_writer",
    },
    {
      id: 6,
      title: "Technical Blog Optimization",
      description:
        "Audit a developer blog for SEO, readability, and engagement, then provide actionable recommendations for improvement",
      config: "simple_team",
    },
  ];

  async function handleCreateXAgent(prompt: string) {
    if (!prompt.trim()) return;

    if (isCreating) return;

    isCreating = true;
    messages = [...messages, { role: "user", content: prompt }];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      const aiContent =
        data.choices?.[0]?.message?.content || "No response received.";

      messages = [...messages, { role: "assistant", content: aiContent }];
    } catch (error: any) {
      console.error("LLM Error:", error);
      alert(`Failed to generate: ${error.message}`);
    } finally {
      isCreating = false;
    }
  }

  function handleSampleGoalClick(goal: any) {
    const prompt = `${goal.title}: ${goal.description}`;
    handleCreateXAgent(prompt);
  }
</script>

<div class="flex flex-col min-h-[600px] bg-background text-foreground relative">
  <div class="flex-1 flex flex-col items-center justify-center px-4 py-12">
    <div class="w-full max-w-4xl space-y-8">
      <!-- Hero / Conversation -->
      <div class="text-center space-y-4">
        {#if messages.length === 0}
          <h1 class="text-4xl font-semibold tracking-tight lg:text-5xl">
            Hello there
          </h1>
          <p class="text-lg text-muted-foreground">
            What can I do for you today?
          </p>
        {:else}
          <div
            class="w-full text-left space-y-6 max-h-[60vh] overflow-y-auto pr-2"
          >
            {#each messages as msg}
              <div
                class={cn(
                  "p-4 rounded-lg",
                  msg.role === "user"
                    ? "bg-muted/50 ml-12"
                    : "bg-primary/10 mr-12 border border-primary/20",
                )}
              >
                <div
                  class="font-semibold text-xs mb-1 opacity-50 uppercase tracking-wider"
                >
                  {msg.role}
                </div>
                <div class="whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </div>
              </div>
            {/each}
            {#if isCreating}
              <div class="flex items-center gap-2 text-muted-foreground p-4">
                <span class="animate-pulse">Thinking...</span>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Input -->
      <ChatInput onSendMessage={handleCreateXAgent} isLoading={isCreating} />
    </div>
  </div>

  <!-- Sample Goals -->
  <div class="px-6 pb-12 w-full">
    <div class="max-w-5xl mx-auto">
      <h2 class="text-lg font-medium mb-6">Choose a goal to achieve</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each sampleGoals as goal (goal.id)}
          <Card
            class="group flex flex-col p-5 hover:border-primary/50 transition-all cursor-pointer h-full relative"
            onclick={() => handleSampleGoalClick(goal)}
          >
            <div class="space-y-2 flex-1 mb-8">
              <h3 class="font-medium">{goal.title}</h3>
              <p class="text-sm text-muted-foreground leading-relaxed">
                {goal.description}
              </p>
            </div>

            <div class="flex items-center justify-between mt-auto">
              <Badge
                variant="secondary"
                class="font-mono text-[10px] uppercase tracking-wider opacity-70"
              >
                {goal.config}
              </Badge>

              <Button
                size="sm"
                variant="ghost"
                class="h-7 text-xs gap-1 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
                onclick={(e) => {
                  e.stopPropagation();
                  handleSampleGoalClick(goal);
                }}
              >
                Start
                <ArrowRight size={12} />
              </Button>
            </div>
          </Card>
        {/each}
      </div>
    </div>
  </div>
</div>
