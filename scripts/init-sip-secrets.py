"""Gera credenciais SIP locais sem imprime-las ou sobrescrever arquivos."""

import configparser
import os
from pathlib import Path
import re
import secrets
import sys

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "secrets"


def write_new(path, content):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
        stream.write(content)


def main():
    DIRECTORY.mkdir(mode=0o700, exist_ok=True)
    paths = [DIRECTORY / f"sip-{number}.txt" for number in (1001, 1002)]
    auth_path = DIRECTORY / "sip-auth.conf"
    if any(path.exists() for path in [*paths, auth_path]):
        # Validar um conjunto completo; nunca girar senhas ao repetir o comando.
        if not all(path.is_file() for path in [*paths, auth_path]):
            raise ValueError("Conjunto de segredos incompleto; restaure o backup local antes de continuar.")
        passwords = [path.read_text(encoding="utf-8").strip() for path in paths]
        config = configparser.ConfigParser(interpolation=None)
        config.read(auth_path, encoding="utf-8")
        if passwords[0] == passwords[1] or not all(re.fullmatch(r"[a-f0-9]{64}", p) for p in passwords):
            raise ValueError("Segredos existentes nao passam na validacao; arquivos preservados.")
        for number, password in zip((1001, 1002), passwords):
            section = config[f"auth-{number}"]
            if (section["type"], section["auth_type"], section["username"], section["password"]) != (
                "auth", "userpass", str(number), password
            ):
                raise ValueError("Arquivos de senha e autenticacao divergem; arquivos preservados.")
        print("Credenciais existentes validadas e preservadas. Nenhuma senha exibida.")
        return

    passwords = [secrets.token_hex(32), secrets.token_hex(32)]
    while passwords[0] == passwords[1]:
        passwords[1] = secrets.token_hex(32)
    for path, password in zip(paths, passwords):
        write_new(path, password + "\n")
    write_new(auth_path, "\n".join(
        f"[auth-{number}]\ntype=auth\nauth_type=userpass\nusername={number}\npassword={password}\n"
        for number, password in zip((1001, 1002), passwords)
    ))
    print("Criados secrets/sip-auth.conf, sip-1001.txt e sip-1002.txt. Nenhuma senha exibida.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, configparser.Error):
        print("Falha ao preparar segredos. Arquivos existentes foram preservados; confira o conjunto local.", file=sys.stderr)
        sys.exit(1)
