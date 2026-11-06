import os
import subprocess

try:
    from fastmcp import FastMCP
except ImportError:
    try:
        from mcp.server.fastmcp import FastMCP
    except ImportError:
        from mcp.server.mcpserver import MCPServer as FastMCP

from openai import OpenAI

mcp = FastMCP("Bastilla-MCP")

@mcp.tool()
def zapytaj_chatgpt(prompt: str, model: str = "gpt-4o") -> str:
    """Wysyła zapytanie do modelu OpenAI/Azure."""
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
    if not api_key:
        return "BŁĄD: Brak skonfigurowanego klucza OPENAI_API_KEY w środowisku."
    c = OpenAI(api_key=api_key, base_url=base_url)
    resp = c.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content or ""

@mcp.tool()
def wykonaj_komende_linux(cmd: str) -> str:
    """Wykonuje komendę Bash na serwerze."""
    try:
        return subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT, text=True, timeout=30) or "OK"
    except Exception as e:
        return f"ERR: {e}"

if __name__ == "__main__":
    mcp.run(transport="stdio")
