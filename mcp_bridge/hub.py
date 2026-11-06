import asyncio
import os
import sys

# Try loading from .env if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.expanduser("~/mcp_bridge/.env"))
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
    load_dotenv("/app/applet/.env")
except Exception:
    pass

from google import genai
from google.genai import types
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_PATH = os.environ.get(
    "MCP_SERVER_PATH",
    os.path.join(CURRENT_DIR, "mcp_server.py")
    if os.path.exists(os.path.join(CURRENT_DIR, "mcp_server.py"))
    else os.path.expanduser("~/mcp_bridge/mcp_server.py")
)

def mcp_tool_to_gemini_func_decl(mcp_tool):
    """Converts an MCP tool definition to a Google GenAI FunctionDeclaration."""
    schema = mcp_tool.inputSchema or {"type": "object", "properties": {}}
    return types.FunctionDeclaration(
        name=mcp_tool.name,
        description=mcp_tool.description or "",
        parameters=schema,
    )

async def main():
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    user_prompt = " ".join(sys.argv[1:]).strip() if len(sys.argv) > 1 else None

    print(f"[BASTILLA-MCP-HUB] Starting MCP Server: {SERVER_PATH}")
    p = StdioServerParameters(
        command="python3",
        args=[SERVER_PATH],
        env=os.environ.copy()
    )

    async with stdio_client(p) as (r, w), ClientSession(r, w) as s:
        await s.initialize()
        tools_response = await s.list_tools()
        tools_list = tools_response.tools
        tool_names = [t.name for t in tools_list]
        print(f"[BASTILLA-MCP-HUB] Connected. Registered tools: {', '.join(tool_names)}")

        if not user_prompt:
            print("[BASTILLA-MCP-HUB] Test połączenia MCP udany. Wszystkie narzędzia aktywne.")
            print("[BASTILLA-MCP-HUB] Użycie: python3 hub.py \"Twoje polecenie dla Gemini z MCP\"")
            return

        if not gemini_key:
            print("[BASTILLA-MCP-HUB] UWAGA: Brak GEMINI_API_KEY w środowisku.")
            print("[BASTILLA-MCP-HUB] Aby uruchomić zapytanie do Gemini z narzędziami MCP:")
            print("export GEMINI_API_KEY=\"twoj_klucz_gemini\" OPENAI_API_KEY=\"twoj_klucz_openai\"")
            print("python3 ~/mcp_bridge/hub.py \"Twoje pytanie\"")
            return

        c = genai.Client(api_key=gemini_key)
        func_decls = [mcp_tool_to_gemini_func_decl(t) for t in tools_list]
        gemini_tools = [types.Tool(function_declarations=func_decls)]

        model_name = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
        config = types.GenerateContentConfig(
            tools=gemini_tools,
            temperature=0.2,
            system_instruction="Jesteś operatorem jądra BastillaOS. Masz do dyspozycji narzędzia MCP: zapytaj_chatgpt oraz wykonaj_komende_linux. Użyj ich, kiedy to konieczne, aby zrealizować zadanie użytkownika."
        )

        chat = c.chats.create(model=model_name, config=config)
        response = chat.send_message(user_prompt)

        # Obsługa pętli wywołań narzędzi MCP
        while response.function_calls:
            for call in response.function_calls:
                fn_name = call.name
                fn_args = dict(call.args) if call.args else {}
                print(f"[BASTILLA-MCP-HUB] Wywołanie narzędzia MCP -> {fn_name}({fn_args})")
                try:
                    tool_call_res = await s.call_tool(fn_name, fn_args)
                    content_parts = []
                    for item in getattr(tool_call_res, "content", []):
                        if hasattr(item, "text"):
                            content_parts.append(item.text)
                        else:
                            content_parts.append(str(item))
                    res_str = "\n".join(content_parts) or "OK"
                except Exception as ex:
                    res_str = f"BŁĄD WYWOŁANIA: {ex}"

                print(f"[BASTILLA-MCP-HUB] Wynik narzędzia -> {res_str[:200]}...")
                response = chat.send_message(
                    types.Part.from_function_response(
                        name=fn_name,
                        response={"result": res_str}
                    )
                )

        print("\n--- Odpowiedź Gemini ---")
        print(response.text)

if __name__ == "__main__":
    asyncio.run(main())
