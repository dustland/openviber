# Local LLM Setup

Run OpenViber with local language models for maximum privacy and zero API costs.

## Ollama

[Ollama](https://ollama.ai) is the easiest way to run local models.

### Installation

```bash
# macOS / Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Or with Homebrew
brew install ollama
```

### Pull a Model

```bash
ollama pull llama3.2
ollama pull codellama
ollama pull deepseek-coder-v2
```

### Configure OpenViber

Set the environment variable:

```bash
export OLLAMA_BASE_URL="http://localhost:11434"
```

Then in your viber config (`~/.openviber/vibers/default.yaml`):

```yaml
provider: ollama
model: llama3.2
```

---

## vLLM

[vLLM](https://github.com/vllm-project/vllm) provides high-performance inference with OpenAI-compatible API.

### Installation

```bash
pip install vllm
```

### Start Server

```bash
vllm serve meta-llama/Llama-3.2-70B-Instruct --port 8000
```

### Configure OpenViber

```bash
export OPENAI_BASE_URL="http://localhost:8000/v1"
export OPENAI_API_KEY="not-needed"
```

Agent config:

```yaml
provider: openai
model: meta-llama/Llama-3.2-70B-Instruct
```

---

## LM Studio

[LM Studio](https://lmstudio.ai) provides a GUI for running local models with OpenAI-compatible API.

1. Download and install LM Studio
2. Download a model (e.g., Llama 3.2, DeepSeek Coder)
3. Start the local server (default port: 1234)

Configure OpenViber:

```bash
export OPENAI_BASE_URL="http://localhost:1234/v1"
export OPENAI_API_KEY="lm-studio"
```

---

## Model Recommendations

| Use Case | Recommended Model | Size |
|----------|------------------|------|
| General chat | `llama3.2` | 8B |
| Coding | `deepseek-coder-v2` | 16B |
| Long context | `qwen2.5:32b` | 32B |
| Fastest | `phi3:mini` | 3.8B |

## Tips

- **VRAM**: Most models need 8-16GB VRAM for good performance
- **Quantization**: Use Q4 or Q5 quantized models to reduce memory usage
- **Context**: Local models often have 4K-8K context limits
- **CPU fallback**: Works but significantly slower than GPU inference
