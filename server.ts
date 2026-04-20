import express from "express";
import path from "path";
import Parser from "rss-parser";

const parser = new Parser({
  customFields: {
    item: ['content:encoded', 'content']
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check route required by infrastructure
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API route for fetching RSS
  app.all("/api/feed", async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: "Method Not Allowed. Expected POST, got " + req.method });
    }

    const { url } = req.body || {};
    if (!url) {
      return res.status(400).json({ error: "No URL provided in request body. Did the body get stripped?" });
    }

    try {
      const feed = await parser.parseURL(url);
      res.json(feed);
    } catch (error) {
      console.error("RSS parse error:", error);
      res.status(500).json({ error: "Failed to parse RSS feed from the URL" });
    }
  });

  // Generic API 404 handler to prevent NGINX static fallback from swallowing API 404s
  app.all("/api/*", (req, res) => {
    res.status(400).json({ error: "API route not found: " + req.url });
  });

  // Global Error Handler to ensure JSON responses
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global Express Error:", err);
    res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Failed to load vite dynamically", e);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
