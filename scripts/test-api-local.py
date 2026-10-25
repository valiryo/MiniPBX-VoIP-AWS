"""Verifica HTTP local, sem originar chamadas ou alterar registros dos softphones."""
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:3000"


def request(path, body=None, origin=None):
    headers = {"Content-Type": "application/json"}
    if origin:
        headers["Origin"] = origin
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=7) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def main():
    assert request("/health")[1]["status"] == "ok"
    health = request("/telephony/health")[1]
    assert health["ami"] in ("connected", "disconnected")
    extensions = request("/extensions")[1]
    assert {e["extension"] for e in extensions} == {"1001", "1002"}
    for body in ({"from": "1001", "to": "1001"}, {"from": "1001", "to": "9999"},
                 {"from": "1001", "to": "1002", "Application": "System"},
                 {"from": "1001\r\nAction: Command", "to": "1002"}):
        assert request("/calls", body)[0] == 400
    assert request("/calls", {"from": "1001", "to": "1002"}, "https://example.invalid")[0] == 403
    assert request("/calls/nao-existe")[0] == 404
    assert request("/calls")[0] == 200
    print("OK: saude, ramais, validacao 400, origem de navegador 403 e tentativa inexistente 404. Nenhuma chamada enviada.")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, OSError, ValueError, KeyError):
        raise SystemExit("Falha no teste HTTP local; confira API e diagnostico sem compartilhar segredos.")
