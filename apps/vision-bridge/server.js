const express = require('express');
const { spawn } = require('child_process');
const app = express();

app.post('/analyze-stream', (req, res) => {
  const ollama = spawn('ollama', ['run', 'moondream']);
  req.pipe(ollama.stdin);
  ollama.stdout.pipe(res);
  ollama.on('error', (err) => res.status(500).send(err.message));
});

if (require.main === module) {
  const port = process.env.VISION_BRIDGE_PORT || 3210;
  app.listen(port, () => console.log(`Vision Bridge v2.0 active on port ${port}`));
}

module.exports = app;