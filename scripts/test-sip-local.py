"""Sonda SIP/UDP local: Digest, registro e rejeicao pelo dialplan.

Nao e um softphone nem testa audio. Usa somente 127.0.0.1 e contas 1001/1002.
Execute com ambos os softphones desconectados; contatos de teste sao removidos.
Pacotes e credenciais nunca sao impressos.
"""

import hashlib
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
SERVER = ("127.0.0.1", 5060)


def cli(command):
    result = subprocess.run(
        ["docker", "compose", "--project-directory", str(ROOT), "exec", "-T",
         "asterisk", "asterisk", "-rx", command],
        capture_output=True, text=True, timeout=15,
    )
    if result.returncode:
        raise RuntimeError("Asterisk indisponivel; suba o Compose antes do teste.")
    return result.stdout


def parse(packet):
    lines = packet.decode("utf-8", errors="replace").split("\r\n")
    headers = {}
    for line in lines[1:]:
        if not line:
            break
        if ":" in line:
            name, value = line.split(":", 1)
            headers[name.lower()] = value.strip()
    return lines[0], headers


class Probe:
    def __init__(self, number):
        self.number = number
        self.password = (ROOT / "secrets" / f"sip-{number}.txt").read_text().strip()
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("127.0.0.1", 0))
        self.port = self.sock.getsockname()[1]
        self.call_id = secrets.token_hex(16) + "@minipbx-probe"
        self.tag = secrets.token_hex(8)
        self.cseq = 0

    def exchange(self, method, target=None, authorization=None, expires=120):
        self.cseq += 1
        branch = "z9hG4bK" + secrets.token_hex(12)
        uri = f"sip:{target}@127.0.0.1" if target else "sip:127.0.0.1"
        to = f"<sip:{target or self.number}@127.0.0.1>"
        via = f"SIP/2.0/UDP 127.0.0.1:{self.port};branch={branch};rport"
        from_value = f"<sip:{self.number}@127.0.0.1>;tag={self.tag}"
        headers = [
            f"{method} {uri} SIP/2.0", f"Via: {via}", "Max-Forwards: 70",
            f"From: {from_value}", f"To: {to}", f"Call-ID: {self.call_id}",
            f"CSeq: {self.cseq} {method}",
            f"Contact: <sip:{self.number}@127.0.0.1:{self.port}>",
            "User-Agent: MiniPBX-local-probe",
        ]
        if authorization:
            headers.append("Authorization: " + authorization)
        body = ""
        if method == "REGISTER":
            headers.append(f"Expires: {expires}")
        if method == "INVITE":
            body = ("v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=local-probe\r\n"
                    "c=IN IP4 127.0.0.1\r\nt=0 0\r\nm=audio 9 RTP/AVP 0\r\n"
                    "a=rtpmap:0 PCMU/8000\r\na=sendrecv\r\n")
            headers.append("Content-Type: application/sdp")
        packet = ("\r\n".join(headers + [f"Content-Length: {len(body)}", "", body])).encode()
        deadline = time.monotonic() + 5
        self.sock.sendto(packet, SERVER)
        while time.monotonic() < deadline:
            self.sock.settimeout(min(1, max(0.01, deadline - time.monotonic())))
            try:
                data, address = self.sock.recvfrom(65535)
            except socket.timeout:
                self.sock.sendto(packet, SERVER)
                continue
            first, response = parse(data)
            if first.startswith("OPTIONS "):
                reply = ["SIP/2.0 200 OK"]
                reply += [f"{name}: {response[name.lower()]}" for name in ("Via", "From", "To", "Call-ID", "CSeq")]
                self.sock.sendto(("\r\n".join(reply + ["Content-Length: 0", "", ""])).encode(), address)
                continue
            if not first.startswith("SIP/2.0 ") or response.get("call-id") != self.call_id:
                continue
            if response.get("cseq") != f"{self.cseq} {method}":
                continue
            code = int(first.split()[1])
            if code < 200:
                continue
            if method == "INVITE" and code >= 300:
                ack = [f"ACK {uri} SIP/2.0", f"Via: {via}", "Max-Forwards: 70",
                       f"From: {from_value}", f"To: {response['to']}",
                       f"Call-ID: {self.call_id}", f"CSeq: {self.cseq} ACK",
                       "Content-Length: 0", "", ""]
                self.sock.sendto("\r\n".join(ack).encode(), SERVER)
            return code, response, uri
        raise RuntimeError("Timeout SIP/UDP no loopback; confira Docker e porta 5060.")

    def authenticated(self, method, target=None, password=None, expires=120):
        code, response, uri = self.exchange(method, target, expires=expires)
        if code != 401:
            raise RuntimeError(f"{method}: esperado desafio 401; recebido {code}.")
        # O desafio pode ter valores entre aspas ou tokens simples.
        challenge = {key: quoted or token for key, quoted, token in re.findall(
            r'(\w+)=(?:"([^"]*)"|([^,\s]+))', response.get("www-authenticate", ""))}
        if challenge.get("algorithm", "MD5").upper() != "MD5":
            raise RuntimeError("Esta sonda suporta somente Digest MD5 do laboratorio local.")
        realm, nonce = challenge["realm"], challenge["nonce"]
        md5 = lambda value: hashlib.md5(value.encode()).hexdigest()
        ha1 = md5(f"{self.number}:{realm}:{self.password if password is None else password}")
        ha2 = md5(f"{method}:{uri}")
        fields = [f'username="{self.number}"', f'realm="{realm}"', f'nonce="{nonce}"',
                  f'uri="{uri}"', "algorithm=MD5"]
        if "qop" in challenge:
            if "auth" not in challenge["qop"].split(","):
                raise RuntimeError("qop do desafio nao suportado pela sonda.")
            cnonce = secrets.token_hex(12)
            digest = md5(f"{ha1}:{nonce}:00000001:{cnonce}:auth:{ha2}")
            fields.extend(["qop=auth", "nc=00000001", f'cnonce="{cnonce}"'])
        else:
            digest = md5(f"{ha1}:{nonce}:{ha2}")
        fields.append(f'response="{digest}"')
        if "opaque" in challenge:
            fields.append(f'opaque="{challenge["opaque"]}"')
        code, _, _ = self.exchange(method, target, "Digest " + ", ".join(fields), expires)
        return code


def main():
    contacts = cli("pjsip show contacts")
    if "No objects found" not in contacts:
        raise RuntimeError("Desconecte ambos os softphones e aguarde contatos expirarem antes desta sonda.")
    cli("pjsip set logger off")  # Nao registrar material Digest nos logs.
    probes = []
    try:
        for number in (1001, 1002):
            probe = Probe(number)
            probes.append(probe)
            if probe.authenticated("REGISTER", password=secrets.token_hex(32)) not in (401, 403):
                raise RuntimeError("Senha incorreta foi aceita ou retornou resposta inesperada.")
            print(f"OK {number}: senha incorreta rejeitada.")
            if probe.authenticated("REGISTER") != 200:
                raise RuntimeError(f"Registro autenticado de {number} falhou.")
            print(f"OK {number}: REGISTER 401 -> autenticacao -> 200 OK.")
            # Todos os testes sao dirigidos a PBX no loopback, nunca a um provedor.
            for target in (number, "9999"):
                if probe.authenticated("INVITE", target=target) != 404:
                    raise RuntimeError(f"Destino {target} nao foi rejeitado com 404.")
                print(f"OK {number}: destino {target} rejeitado pelo dialplan (404).")
    finally:
        cleanup_errors = []
        for probe in probes:
            try:
                if probe.authenticated("REGISTER", expires=0) != 200:
                    raise RuntimeError("Falha ao remover contato temporario.")
            except (OSError, ValueError, KeyError, RuntimeError):
                cleanup_errors.append(probe.number)
            finally:
                probe.sock.close()
        if cleanup_errors:
            raise RuntimeError("Falha na limpeza de contatos temporarios; confira pjsip show contacts.")
    if "No objects found" not in cli("pjsip show contacts"):
        raise RuntimeError("Ha contatos restantes; confira a CLI antes do teste manual.")
    print("OK: contatos temporarios removidos. Audio e chamadas atendidas ainda exigem teste manual.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        # Nao mostrar pacotes SIP, challenges, segredos ou traceback.
        print(str(error) if isinstance(error, RuntimeError) else "Falha na sonda local; confira ferramentas e arquivos de segredos.", file=sys.stderr)
        sys.exit(1)
