async function main() {
  const openRouterApiKey = "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";
  const prompt = "Say {\"test\": 123} as JSON";
  
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "stepfun/step-3.5-flash:free",
        response_format: { type: "json_object" },
        messages: [
          { role: "user", content: prompt }
        ],
        stream: true,
        include_reasoning: true
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    let content = "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const chunkString = decoder.decode(value, { stream: true });
        const lines = chunkString.split('\n');
        
        for (const line of lines) {
          if (line.trim() === '' || line.startsWith(':')) continue;
          if (line === 'data: [DONE]') continue;
          
          if (line.startsWith('data: ')) {
            try {
              const dataStr = line.replace('data: ', '');
              const data = JSON.parse(dataStr);
              
              const delta = data.choices?.[0]?.delta?.content;
              if (delta) {
                content += delta;
              }
              
              if (data.usage) {
                console.log("Usage tokens:", data.usage.totalTokens);
              }
            } catch (err) {}
          }
        }
      }
    }
    console.log("Returned content:", content);
  } catch (e) {
    console.error("Error:", e);
  }
}
main();
