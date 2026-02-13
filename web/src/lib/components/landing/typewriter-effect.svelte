<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let {
    words = [],
    typingSpeed = 100,
    deletingSpeed = 50,
    pauseTime = 2000
  } = $props();

  let currentWordIndex = $state(0);
  let currentText = $state('');
  let isDeleting = $state(false);
  let timer: ReturnType<typeof setTimeout>;

  function tick() {
    const fullWord = words[currentWordIndex];

    if (isDeleting) {
      currentText = fullWord.substring(0, currentText.length - 1);
    } else {
      currentText = fullWord.substring(0, currentText.length + 1);
    }

    let typeSpeed = typingSpeed;

    if (isDeleting) {
      typeSpeed = deletingSpeed;
    }

    if (!isDeleting && currentText === fullWord) {
      typeSpeed = pauseTime;
      isDeleting = true;
    } else if (isDeleting && currentText === '') {
      isDeleting = false;
      currentWordIndex = (currentWordIndex + 1) % words.length;
      typeSpeed = 500;
    }

    timer = setTimeout(tick, typeSpeed);
  }

  onMount(() => {
    if (words.length > 0) {
      tick();
    }
  });

  onDestroy(() => {
    clearTimeout(timer);
  });
</script>

<span
  class="inline-block min-w-[2ch]"
  aria-label={words[currentWordIndex]}
  role="img"
>
  <span aria-hidden="true">{currentText}</span><span class="animate-blink text-primary" aria-hidden="true">|</span>
</span>

<style>
  .animate-blink {
    animation: blink 1s step-end infinite;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
</style>
