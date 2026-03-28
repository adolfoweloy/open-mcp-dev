id: bugs__ollama-chat-404-base-url
overview: >
  Add a normalisation function for the Ollama base URL so both model-listing and chat
  code paths resolve to the correct /api-prefixed endpoint, regardless of whether the
  user includes the /api suffix in config.yaml.
status: todo
tasks:
  - task: >
      Add normaliseOllamaBaseUrl(raw: string): string to server/lib/ollama.ts.
      The function strips trailing slashes, then appends /api only if the URL does not
      already end with /api. Update listOllamaModels to call normaliseOllamaBaseUrl on
      its baseUrl parameter before building the tags URL (change from
      `${baseUrl.replace(/\/$/, "")}/api/tags` to `${normaliseOllamaBaseUrl(baseUrl)}/tags`).
      Export the function so lib/models.ts can import it.
    refs:
      - specs/bugs/ollama-chat-404-base-url/design.md
      - specs/bugs/ollama-chat-404-base-url/requirements.md
    priority: high
    status: todo
  - task: >
      Test normaliseOllamaBaseUrl: verify the following inputs produce correct output:
      "http://localhost:11434" → "http://localhost:11434/api",
      "http://localhost:11434/" → "http://localhost:11434/api",
      "http://localhost:11434/api" → "http://localhost:11434/api",
      "http://localhost:11434/api/" → "http://localhost:11434/api",
      "http://custom:8080" → "http://custom:8080/api".
    refs:
      - specs/bugs/ollama-chat-404-base-url/design.md
    priority: high
    status: todo
  - task: >
      Update createModel in server/lib/models.ts: import normaliseOllamaBaseUrl from
      server/lib/ollama.ts. Change the Ollama branch to read the raw base_url
      (default "http://localhost:11434"), pass it through normaliseOllamaBaseUrl, and
      supply the result to createOllama({ baseURL }). Remove the old default that
      hardcodes /api.
    refs:
      - specs/bugs/ollama-chat-404-base-url/design.md
      - specs/bugs/ollama-chat-404-base-url/requirements.md
    priority: high
    status: todo
  - task: >
      Test createModel Ollama integration: verify that when config.llm.ollama.base_url
      is "http://localhost:11434" (no /api), createModel returns a model configured with
      baseURL "http://localhost:11434/api". Verify the same when base_url is
      "http://localhost:11434/api" (no double /api/api). Verify when base_url is omitted,
      the default resolves correctly.
    refs:
      - specs/bugs/ollama-chat-404-base-url/requirements.md
    priority: high
    status: todo
